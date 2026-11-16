async function request(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Unable to reach the QuickEx server. Please try again.");
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }
  if (!response.ok)
    throw new Error(data.error || "The request could not be completed.");
  return data;
}

export const api = {
  me: async () => (await request("/auth/me")).user,
  login: async (credentials) =>
    (await request("/auth/login", { method: "POST", body: credentials })).user,
  register: async (details) =>
    (await request("/auth/register", { method: "POST", body: details })).user,
  logout: () => request("/auth/logout", { method: "POST" }),
  shipments: async () => (await request("/shipments")).shipments,
  shipment: async (trackingId) =>
    (
      await request(`/shipments/${encodeURIComponent(trackingId)}`)
    ).shipment,
  createShipment: async (details) =>
    (
      await request("/shipments", {
        method: "POST",
        body: details,
      })
    ).shipment,
  updateShipment: async (id, details) =>
    (
      await request(`/shipments/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: details,
      })
    ).shipment,
  updateStatus: async (id, update) =>
    (
      await request(`/shipments/${encodeURIComponent(id)}/status`, {
        method: "POST",
        body: update,
      })
    ).shipment,
  addComment: async (trackingId, message) =>
    (
      await request(
        `/shipments/${encodeURIComponent(trackingId)}/comments`,
        {
          method: "POST",
          body: { message },
        },
      )
    ).shipment,
  customers: async () => (await request("/customers")).customers,
};
