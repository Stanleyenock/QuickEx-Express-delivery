import "dotenv/config";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { createDatabase } from "./database.js";
import { createApp } from "./app.js";

const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const adminPassword = String(process.env.ADMIN_PASSWORD || "");
const sessionSecret = String(process.env.SESSION_SECRET || "");

if (!adminEmail || !adminPassword || !sessionSecret) {
  throw new Error(
    "Set ADMIN_EMAIL, ADMIN_PASSWORD and SESSION_SECRET in the server environment.",
  );
}
if (adminPassword.length < 12)
  throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
if (sessionSecret.length < 64)
  throw new Error("SESSION_SECRET must be at least 64 characters.");

const db = await createDatabase(
  process.env.DATABASE_FILE || "server/data/quickex.sqlite",
);
const existingAdmin = db.queryOne(
  "SELECT id, role, password_hash FROM users WHERE email = ?",
  [adminEmail],
);
if (!existingAdmin) {
  db.run(
    `INSERT INTO users (id, name, email, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, 'admin', ?)`,
    [
      crypto.randomUUID(),
      "QuickEx Admin",
      adminEmail,
      await bcrypt.hash(adminPassword, 12),
      new Date().toISOString(),
    ],
  );
} else if (existingAdmin.role !== "admin") {
  throw new Error("ADMIN_EMAIL is already assigned to a non-administrator account.");
} else if (!(await bcrypt.compare(adminPassword, existingAdmin.password_hash))) {
  db.run("UPDATE users SET password_hash = ? WHERE id = ?", [
    await bcrypt.hash(adminPassword, 12),
    existingAdmin.id,
  ]);
}

const production = process.env.NODE_ENV === "production";
const app = createApp({ db, sessionSecret, production });
const port = Number(process.env.API_PORT || 3001);
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`QuickEx API listening on port ${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
