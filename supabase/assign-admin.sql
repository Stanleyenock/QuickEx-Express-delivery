-- Run this only AFTER creating the administrator user in Supabase Auth.
-- Replace the email below with the exact administrator email address.
update public.profiles
set role = 'admin'
where lower(email) = lower('YOUR_ADMIN_EMAIL');

-- Confirm that exactly the intended account is an administrator.
select id, email, full_name, role
from public.profiles
where lower(email) = lower('YOUR_ADMIN_EMAIL');
