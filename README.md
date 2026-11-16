# QuickEx Shipping

Responsive React + Vite customer and administrator website backed by an Express API and a persistent SQLite database.

## Requirements
- Node.js 20 or later
- npm

## Configure the server
Copy `.env.example` to `.env`, then set:
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the first administrator account
- `SESSION_SECRET` to a random secret of at least 64 characters
- `APP_ORIGIN` to the public site origin (comma-separated origins are supported)

The server creates the administrator account on first startup and stores the password as a bcrypt hash. On later startups, `ADMIN_PASSWORD` remains authoritative and updates the administrator hash if it changes. Customer registration cannot create administrator accounts. Keep `.env` private; it is ignored by version control and its values are never sent to the browser.

## Run locally
```bash
npm install
npm run dev
```
Open the Vite URL printed in the terminal. The Vite server proxies `/api` requests to the Node API.

## Production
```bash
npm run build
npm start
```
Set `NODE_ENV=production`, configure the environment variables above, and provide persistent disk storage for `DATABASE_FILE`. Serve the site over HTTPS in production so session cookies remain secure.

## Included
- Customer registration and login with bcrypt-hashed passwords and server-side sessions
- Persistent users, shipments, tracking history and comments in SQLite
- Admin-only order creation, shipment editing, customer directory and status/location updates
- Role-specific landing pages: administrators open the admin console and customers open their shipment dashboard
- Unique tracking IDs and owner-scoped customer shipment access
- Customers can view and comment on shipments addressed to their account email
- Responsive homepage, full-width hero and adaptive navigation for phones, tablets and laptops
- Direct links to recent shipments, tracking, worldwide delivery information and a shipment support center
- Tracking history and print-friendly shipment details

Customer accounts can only read shipments whose recipient email matches their signed-in account. Tracking IDs are checked server-side; knowing another customer's ID does not grant access. Admin routes require an authenticated administrator session.
