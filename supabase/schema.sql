-- QuickEx: browser-only React/Vite app with Supabase Auth + PostgreSQL.
-- Run this complete file once in Supabase Dashboard > SQL Editor.

grant usage on schema public to anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role text not null default 'customer' check (role in ('admin', 'customer')),
  created_at timestamptz not null default now()
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  tracking_id text not null unique,
  recipient text not null check (char_length(trim(recipient)) between 1 and 120),
  email text not null check (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and char_length(email) <= 254),
  address text not null check (char_length(trim(address)) between 1 and 300),
  country text not null check (char_length(trim(country)) between 1 and 100),
  origin text not null check (char_length(trim(origin)) between 1 and 160),
  destination text not null check (char_length(trim(destination)) between 1 and 160),
  contents text not null default '' check (char_length(contents) <= 300),
  status text not null default 'Order Created'
    check (status in ('Order Created', 'Shipped Out', 'On Transit', 'Ready for Pickup', 'Out on Delivery', 'Delivered Successfully')),
  created_at timestamptz not null default now(),
  eta date
);

create index if not exists shipments_email_lower_idx
  on public.shipments (lower(email));
create index if not exists shipments_created_at_idx
  on public.shipments (created_at desc);

create table if not exists public.tracking_updates (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  status text not null
    check (status in ('Order Created', 'Shipped Out', 'On Transit', 'Ready for Pickup', 'Out on Delivery', 'Delivered Successfully')),
  location text not null check (char_length(trim(location)) between 1 and 200),
  note text not null check (char_length(trim(note)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists tracking_updates_shipment_idx
  on public.tracking_updates (shipment_id, created_at desc);

create table if not exists public.shipment_comments (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists shipment_comments_shipment_idx
  on public.shipment_comments (shipment_id, created_at);

-- A SECURITY DEFINER helper avoids recursive profile RLS checks. The empty
-- search_path and fully-qualified table name are intentional hardening.
create or replace function public.is_quickex_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$$;
revoke all on function public.is_quickex_admin() from public, anon;
grant execute on function public.is_quickex_admin() to authenticated;

-- Every new Auth user receives a customer profile. Admin is assigned manually
-- in SQL after the administrator account is created in Supabase Auth.
create or replace function public.handle_new_quickex_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    'customer'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = case
          when excluded.full_name <> '' then excluded.full_name
          else public.profiles.full_name
        end;
  return new;
end;
$$;
revoke all on function public.handle_new_quickex_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_quickex on auth.users;
create trigger on_auth_user_created_quickex
  after insert on auth.users
  for each row execute procedure public.handle_new_quickex_user();

-- Row Level Security: the browser receives only the access its current user
-- needs. Public visitors do not get direct table access.
alter table public.profiles enable row level security;
alter table public.shipments enable row level security;
alter table public.tracking_updates enable row level security;
alter table public.shipment_comments enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.shipments from anon, authenticated;
revoke all on table public.tracking_updates from anon, authenticated;
revoke all on table public.shipment_comments from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select, update on table public.shipments to authenticated;
grant select on table public.tracking_updates to authenticated;
grant select, insert on table public.shipment_comments to authenticated;

drop policy if exists "Profiles: own profile or QuickEx admin" on public.profiles;
create policy "Profiles: own profile or QuickEx admin"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id or (select public.is_quickex_admin()));

drop policy if exists "Shipments: admin or matching recipient" on public.shipments;
create policy "Shipments: admin or matching recipient"
  on public.shipments for select to authenticated
  using (
    (select public.is_quickex_admin())
    or lower(email) = lower((select auth.jwt() ->> 'email'))
  );

drop policy if exists "Shipments: admin can edit" on public.shipments;
create policy "Shipments: admin can edit"
  on public.shipments for update to authenticated
  using ((select public.is_quickex_admin()))
  with check ((select public.is_quickex_admin()));

drop policy if exists "Tracking updates: admin or matching recipient" on public.tracking_updates;
create policy "Tracking updates: admin or matching recipient"
  on public.tracking_updates for select to authenticated
  using (
    (select public.is_quickex_admin())
    or exists (
      select 1
      from public.shipments s
      where s.id = shipment_id
        and lower(s.email) = lower((select auth.jwt() ->> 'email'))
    )
  );

drop policy if exists "Comments: admin or shipment recipient can read" on public.shipment_comments;
create policy "Comments: admin or shipment recipient can read"
  on public.shipment_comments for select to authenticated
  using (
    (select public.is_quickex_admin())
    or exists (
      select 1
      from public.shipments s
      where s.id = shipment_id
        and lower(s.email) = lower((select auth.jwt() ->> 'email'))
    )
  );

drop policy if exists "Comments: recipient can add own comment" on public.shipment_comments;
create policy "Comments: recipient can add own comment"
  on public.shipment_comments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.shipments s
      where s.id = shipment_id
        and lower(s.email) = lower((select auth.jwt() ->> 'email'))
    )
  );

-- Admin creates order + first tracking event atomically. The tracking code is
-- random and deliberately longer than the old six-digit suffix.
create or replace function public.create_admin_shipment(p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_tracking_id text;
  v_created_at timestamptz := now();
  v_recipient text := trim(coalesce(p_input ->> 'recipient', ''));
  v_email text := lower(trim(coalesce(p_input ->> 'email', '')));
  v_address text := trim(coalesce(p_input ->> 'address', ''));
  v_country text := trim(coalesce(p_input ->> 'country', ''));
  v_origin text := trim(coalesce(p_input ->> 'origin', ''));
  v_destination text := trim(coalesce(p_input ->> 'destination', ''));
  v_contents text := trim(coalesce(p_input ->> 'contents', ''));
  v_eta date;
begin
  if not public.is_quickex_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  if v_recipient = '' or char_length(v_recipient) > 120
     or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or char_length(v_email) > 254
     or v_address = '' or char_length(v_address) > 300
     or v_country = '' or char_length(v_country) > 100
     or v_origin = '' or char_length(v_origin) > 160
     or v_destination = '' or char_length(v_destination) > 160
     or char_length(v_contents) > 300 then
    raise exception 'Complete the shipment details using valid values.' using errcode = '22023';
  end if;

  if coalesce(p_input ->> 'eta', '') <> '' then
    if (p_input ->> 'eta') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Enter a valid estimated delivery date.' using errcode = '22023';
    end if;
    v_eta := (p_input ->> 'eta')::date;
  end if;

  loop
    v_tracking_id := 'QEX-' || to_char(current_date, 'YYYY') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));
    exit when not exists (
      select 1 from public.shipments s where s.tracking_id = v_tracking_id
    );
  end loop;

  insert into public.shipments (
    id, tracking_id, recipient, email, address, country, origin,
    destination, contents, status, created_at, eta
  ) values (
    v_id, v_tracking_id, v_recipient, v_email, v_address, v_country,
    v_origin, v_destination, v_contents, 'Order Created', v_created_at, v_eta
  );

  insert into public.tracking_updates (
    shipment_id, status, location, note, created_at
  ) values (
    v_id,
    'Order Created',
    v_origin,
    'Shipment order created by QuickEx administrator.',
    v_created_at
  );

  return v_id;
end;
$$;
revoke all on function public.create_admin_shipment(jsonb) from public, anon;
grant execute on function public.create_admin_shipment(jsonb) to authenticated;

-- Updating a status and adding its audit event are one database transaction.
create or replace function public.admin_update_shipment_status(
  p_shipment_id uuid,
  p_status text,
  p_location text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_id uuid;
  v_location text := trim(coalesce(p_location, ''));
  v_note text := trim(coalesce(p_note, ''));
begin
  if not public.is_quickex_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in (
    'Order Created', 'Shipped Out', 'On Transit', 'Ready for Pickup',
    'Out on Delivery', 'Delivered Successfully'
  ) then
    raise exception 'Choose a valid shipment status.' using errcode = '22023';
  end if;
  if v_location = '' or char_length(v_location) > 200
     or v_note = '' or char_length(v_note) > 1000 then
    raise exception 'Enter a location and a tracking note (up to 1,000 characters).' using errcode = '22023';
  end if;

  update public.shipments
  set status = p_status
  where id = p_shipment_id
  returning id into v_updated_id;
  if v_updated_id is null then
    raise exception 'Shipment not found.' using errcode = 'P0002';
  end if;

  insert into public.tracking_updates (shipment_id, status, location, note)
  values (v_updated_id, p_status, v_location, v_note);
  return v_updated_id;
end;
$$;
revoke all on function public.admin_update_shipment_status(uuid, text, text, text) from public, anon;
grant execute on function public.admin_update_shipment_status(uuid, text, text, text) to authenticated;

-- Anonymous tracking is supported, but it returns operational data only. It
-- never returns the recipient's email, full address, package contents or comments.
create or replace function public.lookup_shipment(p_tracking_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments%rowtype;
  v_updates jsonb;
begin
  if p_tracking_id is null or char_length(trim(p_tracking_id)) < 10
     or char_length(trim(p_tracking_id)) > 64 then
    return null;
  end if;

  select * into v_shipment
  from public.shipments s
  where upper(s.tracking_id) = upper(trim(p_tracking_id));

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'status', u.status,
        'location', u.location,
        'note', u.note,
        'at', u.created_at
      ) order by u.created_at desc
    ),
    '[]'::jsonb
  ) into v_updates
  from public.tracking_updates u
  where u.shipment_id = v_shipment.id;

  return jsonb_build_object(
    'id', v_shipment.id,
    'trackingId', v_shipment.tracking_id,
    'origin', v_shipment.origin,
    'destination', v_shipment.destination,
    'status', v_shipment.status,
    'createdAt', v_shipment.created_at,
    'eta', v_shipment.eta,
    'updates', v_updates,
    'comments', '[]'::jsonb,
    'isPublic', true
  );
end;
$$;
revoke all on function public.lookup_shipment(text) from public;
grant execute on function public.lookup_shipment(text) to anon, authenticated;

-- Do not grant anon direct table access. Public users can only call the limited
-- lookup_shipment function above.
