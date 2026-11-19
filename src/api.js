import { supabase, supabaseConfigured } from "./supabase.js";

const STATUSES = [
  "Order Created",
  "Shipped Out",
  "On Transit",
  "Ready for Pickup",
  "Out on Delivery",
  "Delivered Successfully",
];

function client() {
  if (!supabaseConfigured || !supabase) {
    throw new Error(
      "QuickEx is not connected to Supabase yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file, then restart the app.",
    );
  }
  return supabase;
}

function fail(error, fallback = "The request could not be completed.") {
  if (!error) return;
  const message = String(error.message || fallback);
  if (error.code === "42501" || /row-level security|permission denied/i.test(message)) {
    throw new Error("Access denied. Check that your Supabase account role and database policies are configured correctly.");
  }
  if (error.code === "PGRST116") throw new Error("Shipment not found.");
  throw new Error(message || fallback);
}

function mapShipment(row, isPublic = false) {
  if (!row) return null;
  const updates = [...(row.tracking_updates || row.updates || [])]
    .sort((a, b) => new Date(b.created_at || b.at) - new Date(a.created_at || a.at))
    .map((item) => ({
      status: item.status,
      location: item.location,
      note: item.note,
      at: item.created_at || item.at,
    }));
  const comments = [...(row.shipment_comments || row.comments || [])]
    .sort((a, b) => new Date(a.created_at || a.at) - new Date(b.created_at || b.at))
    .map((item) => ({
      by: item.profiles?.full_name || item.by || "Recipient",
      text: item.message || item.text,
      at: item.created_at || item.at,
    }));
  return {
    id: row.id,
    trackingId: row.tracking_id || row.trackingId,
    recipient: row.recipient,
    email: row.email,
    address: row.address,
    country: row.country,
    origin: row.origin,
    destination: row.destination,
    contents: row.contents,
    status: row.status,
    createdAt: row.created_at || row.createdAt,
    eta: row.eta || "",
    updates,
    comments,
    isPublic,
  };
}

async function getProfile(authUser) {
  const { data, error } = await client()
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .eq("id", authUser.id)
    .single();
  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("Your QuickEx profile has not been created yet. Check that the Supabase profile trigger was installed from schema.sql.");
    }
    fail(error, "Could not load your QuickEx profile.");
  }
  return {
    id: data.id,
    name: data.full_name || authUser.user_metadata?.full_name || data.email,
    email: data.email || authUser.email,
    role: data.role,
    createdAt: data.created_at,
  };
}

async function getPrivateShipment(query) {
  const { data, error } = await query;
  if (error) fail(error, "Could not load shipment details.");
  return data ? mapShipment(data) : null;
}

async function getShipmentById(id) {
  const query = client()
    .from("shipments")
    .select("*, tracking_updates(*), shipment_comments(*, profiles(full_name))")
    .eq("id", id)
    .single();
  const shipment = await getPrivateShipment(query);
  if (!shipment) throw new Error("Shipment not found.");
  return shipment;
}

async function lookupPublicShipment(trackingId) {
  const { data, error } = await client().rpc("lookup_shipment", {
    p_tracking_id: trackingId,
  });
  if (error) fail(error, "Could not look up this tracking number.");
  if (!data) throw new Error("No shipment was found for that tracking number. Check the number and try again.");
  return mapShipment(data, true);
}

export const api = {
  me: async () => {
    const { data, error } = await client().auth.getSession();
    if (error) fail(error, "Could not restore your session.");
    return data.session?.user ? getProfile(data.session.user) : null;
  },

  login: async ({ email, password }) => {
    const { data, error } = await client().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) fail(error, "Email or password is incorrect.");
    if (!data.user) throw new Error("Supabase did not return a signed-in user.");
    return getProfile(data.user);
  },

  register: async ({ name, email, password }) => {
    if (!name.trim() || name.trim().length > 100) {
      throw new Error("Enter a valid full name.");
    }
    if (password.length < 12 || password.length > 128) {
      throw new Error("Passwords must be between 12 and 128 characters.");
    }
    const { data, error } = await client().auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: name.trim() } },
    });
    if (error) fail(error, "Could not create your account.");
    if (!data.session || !data.user) {
      throw new Error("Your account was created. Check your email to confirm it, then return and log in. For instant registration during initial testing, turn off email confirmation in Supabase Auth settings.");
    }
    return getProfile(data.user);
  },

  logout: async () => {
    const { error } = await client().auth.signOut();
    if (error) fail(error, "Could not sign out.");
    return { ok: true };
  },

  shipments: async () => {
    const { data, error } = await client()
      .from("shipments")
      .select("*, tracking_updates(*), shipment_comments(*, profiles(full_name))")
      .order("created_at", { ascending: false });
    if (error) fail(error, "Could not load shipments.");
    return (data || []).map((row) => mapShipment(row));
  },

  shipment: async (trackingId) => {
    const { data: sessionData, error: sessionError } = await client().auth.getSession();
    if (sessionError) fail(sessionError);
    if (sessionData.session?.user) {
      const privateShipment = await getPrivateShipment(
        client()
          .from("shipments")
          .select("*, tracking_updates(*), shipment_comments(*, profiles(full_name))")
          .eq("tracking_id", trackingId.trim().toUpperCase())
          .maybeSingle(),
      );
      if (privateShipment) return privateShipment;
    }
    return lookupPublicShipment(trackingId.trim().toUpperCase());
  },

  createShipment: async (details) => {
    const { data: id, error } = await client().rpc("create_admin_shipment", {
      p_input: details,
    });
    if (error) fail(error, "Could not create this shipment.");
    return getShipmentById(id);
  },

  updateShipment: async (id, details) => {
    const eta = details.eta || null;
    const { error } = await client()
      .from("shipments")
      .update({
        recipient: details.recipient.trim(),
        email: details.email.trim().toLowerCase(),
        address: details.address.trim(),
        country: details.country.trim(),
        origin: details.origin.trim(),
        destination: details.destination.trim(),
        contents: details.contents.trim(),
        eta,
      })
      .eq("id", id);
    if (error) fail(error, "Could not save shipment details.");
    return getShipmentById(id);
  },

  updateStatus: async (id, update) => {
    if (!STATUSES.includes(update.status)) throw new Error("Choose a valid shipment status.");
    const { data: updatedId, error } = await client().rpc("admin_update_shipment_status", {
      p_shipment_id: id,
      p_status: update.status,
      p_location: update.location,
      p_note: update.note,
    });
    if (error) fail(error, "Could not update shipment status.");
    return getShipmentById(updatedId);
  },

  addComment: async (trackingId, message) => {
    const { data: sessionData, error: sessionError } = await client().auth.getSession();
    if (sessionError) fail(sessionError);
    const userId = sessionData.session?.user?.id;
    if (!userId) throw new Error("Sign in with the recipient account to comment.");
    const shipment = await api.shipment(trackingId);
    if (shipment.isPublic || shipment.email?.toLowerCase() !== sessionData.session.user.email?.toLowerCase()) {
      throw new Error("Only the recipient account can comment on this shipment.");
    }
    const { error } = await client().from("shipment_comments").insert({
      shipment_id: shipment.id,
      user_id: userId,
      message: message.trim(),
    });
    if (error) fail(error, "Could not post your comment.");
    return api.shipment(trackingId);
  },

  customers: async () => {
    const { data: profiles, error } = await client()
      .from("profiles")
      .select("id, full_name, email, created_at")
      .eq("role", "customer")
      .order("created_at", { ascending: false });
    if (error) fail(error, "Could not load customer accounts.");
    const { data: shipments, error: shipmentError } = await client()
      .from("shipments")
      .select("email");
    if (shipmentError) fail(shipmentError, "Could not count customer shipments.");
    const counts = new Map();
    for (const shipment of shipments || []) {
      const email = shipment.email.toLowerCase();
      counts.set(email, (counts.get(email) || 0) + 1);
    }
    return (profiles || []).map((profile) => ({
      id: profile.id,
      name: profile.full_name,
      email: profile.email,
      createdAt: profile.created_at,
      shipmentCount: counts.get(profile.email.toLowerCase()) || 0,
    }));
  },
};
