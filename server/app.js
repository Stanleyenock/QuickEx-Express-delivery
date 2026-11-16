import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "node:url";

const STATUSES = [
  "Order Created",
  "Shipped Out",
  "On Transit",
  "Ready for Pickup",
  "Out on Delivery",
  "Delivered Successfully",
];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_AGE = 8 * 60 * 60 * 1000;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.created_at,
  };
}

function getShipment(db, row) {
  if (!row) return null;
  const updates = db.queryAll(
    `SELECT status, location, note, created_at
     FROM tracking_updates
     WHERE shipment_id = ?
     ORDER BY created_at DESC, rowid DESC`,
    [row.id],
  );
  const comments = db.queryAll(
    `SELECT users.name AS by, shipment_comments.message AS text,
            shipment_comments.created_at
     FROM shipment_comments
     JOIN users ON users.id = shipment_comments.user_id
     WHERE shipment_comments.shipment_id = ?
     ORDER BY shipment_comments.created_at ASC, shipment_comments.rowid ASC`,
    [row.id],
  );
  return {
    id: row.id,
    trackingId: row.tracking_id,
    recipient: row.recipient,
    email: row.email,
    address: row.address,
    country: row.country,
    origin: row.origin,
    destination: row.destination,
    contents: row.contents,
    status: row.status,
    createdAt: row.created_at,
    eta: row.eta,
    updates: updates.map((update) => ({
      status: update.status,
      location: update.location,
      note: update.note,
      at: update.created_at,
    })),
    comments: comments.map((comment) => ({
      by: comment.by,
      text: comment.text,
      at: comment.created_at,
    })),
  };
}

function shipmentInput(body) {
  const value = {
    recipient: String(body.recipient || "").trim(),
    email: String(body.email || "").trim().toLowerCase(),
    address: String(body.address || "").trim(),
    country: String(body.country || "").trim(),
    origin: String(body.origin || "").trim(),
    destination: String(body.destination || "").trim(),
    contents: String(body.contents || "").trim(),
    eta: String(body.eta || "").trim(),
  };
  if (!value.recipient || value.recipient.length > 120)
    throw Object.assign(new Error("Enter a valid recipient name."), {
      status: 400,
    });
  if (!EMAIL_PATTERN.test(value.email) || value.email.length > 254)
    throw Object.assign(new Error("Enter a valid recipient email."), {
      status: 400,
    });
  if (
    !value.address ||
    value.address.length > 300 ||
    !value.country ||
    value.country.length > 100 ||
    !value.origin ||
    value.origin.length > 160 ||
    !value.destination ||
    value.destination.length > 160 ||
    value.contents.length > 300
  )
    throw Object.assign(
      new Error("Complete the shipment details using valid values."),
      { status: 400 },
    );
  if (value.eta && !/^\d{4}-\d{2}-\d{2}$/.test(value.eta))
    throw Object.assign(new Error("Enter a valid estimated delivery date."), {
      status: 400,
    });
  return value;
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

export function createApp({ db, sessionSecret, production = false }) {
  const app = express();
  const allowedOrigins = new Set(
    (process.env.APP_ORIGIN || "http://127.0.0.1:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  if (production) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: production ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "20kb" }));
  app.use((req, res, next) => {
    if (
      req.body !== undefined &&
      (req.body === null || typeof req.body !== "object" || Array.isArray(req.body))
    )
      return res.status(400).json({ error: "Request body must be an object." });
    next();
  });
  app.use("/api", (req, res, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const origin = req.get("origin");
      if (!origin || !allowedOrigins.has(origin)) {
        return res.status(403).json({ error: "Request origin is not allowed." });
      }
    }
    next();
  });
  app.use(
    session({
      name: "quickex.sid",
      secret: sessionSecret,
      store: db.sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: production,
        sameSite: "lax",
        maxAge: MAX_AGE,
        path: "/",
      },
    }),
  );

  function requireUser(req, res, next) {
    if (!req.session.userId)
      return res.status(401).json({ error: "Sign in to continue." });
    const user = db.queryOne(
      "SELECT id, name, email, role, created_at FROM users WHERE id = ?",
      [req.session.userId],
    );
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Your session has expired." });
    }
    req.user = publicUser(user);
    next();
  }

  function requireAdmin(req, res, next) {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Administrator access is required." });
    next();
  }

  function ownedShipment(req, res, next) {
    const trackingId = String(req.params.trackingId || "")
      .trim()
      .toUpperCase();
    const row = db.queryOne(
      "SELECT * FROM shipments WHERE tracking_id = ?",
      [trackingId],
    );
    if (!row || (req.user.role !== "admin" && row.email !== req.user.email))
      return res.status(404).json({ error: "Shipment not found." });
    req.shipment = row;
    next();
  }

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Try again later." },
  });

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));
  app.get("/api/auth/me", (req, res) => {
    if (!req.session.userId) return res.json({ user: null });
    const user = db.queryOne(
      "SELECT id, name, email, role, created_at FROM users WHERE id = ?",
      [req.session.userId],
    );
    if (!user) return res.json({ user: null });
    res.json({ user: publicUser(user) });
  });

  app.post(
    "/api/auth/register",
    authLimiter,
    asyncRoute(async (req, res) => {
      const name = String(req.body.name || "").trim();
      const email = String(req.body.email || "").trim().toLowerCase();
      const password = String(req.body.password || "");
      if (!name || name.length > 100)
        return res.status(400).json({ error: "Enter a valid full name." });
      if (!EMAIL_PATTERN.test(email) || email.length > 254)
        return res.status(400).json({ error: "Enter a valid email address." });
      if (password.length < 12 || password.length > 128)
        return res
          .status(400)
          .json({ error: "Passwords must be between 12 and 128 characters." });
      if (
        db.queryOne("SELECT id FROM users WHERE email = ?", [email])
      )
        return res
          .status(409)
          .json({ error: "An account with this email already exists." });

      const user = {
        id: crypto.randomUUID(),
        name,
        email,
        role: "customer",
        created_at: new Date().toISOString(),
      };
      const passwordHash = await bcrypt.hash(password, 12);
      try {
        db.run(
          `INSERT INTO users (id, name, email, password_hash, role, created_at)
           VALUES (?, ?, ?, ?, 'customer', ?)`,
          [user.id, user.name, user.email, passwordHash, user.created_at],
        );
      } catch (error) {
        if (String(error.message).includes("UNIQUE"))
          return res
            .status(409)
            .json({ error: "An account with this email already exists." });
        throw error;
      }
      await regenerateSession(req);
      req.session.userId = user.id;
      await saveSession(req);
      res.status(201).json({ user: publicUser(user) });
    }),
  );

  app.post(
    "/api/auth/login",
    authLimiter,
    asyncRoute(async (req, res) => {
      const email = String(req.body.email || "").trim().toLowerCase();
      const password = String(req.body.password || "");
      const user = db.queryOne("SELECT * FROM users WHERE email = ?", [email]);
      if (!user || !(await bcrypt.compare(password, user.password_hash)))
        return res.status(401).json({ error: "Email or password is incorrect." });
      await regenerateSession(req);
      req.session.userId = user.id;
      await saveSession(req);
      res.json({ user: publicUser(user) });
    }),
  );

  app.post("/api/auth/logout", requireUser, (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie("quickex.sid", {
        httpOnly: true,
        sameSite: "lax",
        secure: production,
        path: "/",
      });
      res.json({ ok: true });
    });
  });

  app.get("/api/shipments", requireUser, (req, res) => {
    const rows =
      req.user.role === "admin"
        ? db.queryAll("SELECT * FROM shipments ORDER BY created_at DESC")
        : db.queryAll(
            "SELECT * FROM shipments WHERE email = ? ORDER BY created_at DESC",
            [req.user.email],
          );
    res.json({ shipments: rows.map((row) => getShipment(db, row)) });
  });

  app.get(
    "/api/shipments/:trackingId",
    requireUser,
    ownedShipment,
    (req, res) => res.json({ shipment: getShipment(db, req.shipment) }),
  );

  app.post(
    "/api/shipments",
    requireUser,
    requireAdmin,
    (req, res, next) => {
      let value;
      try {
        value = shipmentInput(req.body);
      } catch (error) {
        return res.status(error.status || 400).json({ error: error.message });
      }
      const createdAt = new Date().toISOString();
      const shipmentId = crypto.randomUUID();
      let trackingId;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const candidate = `QEX-${new Date().getFullYear()}-${crypto
          .randomInt(0, 1_000_000)
          .toString()
          .padStart(6, "0")}`;
        if (!db.queryOne("SELECT id FROM shipments WHERE tracking_id = ?", [candidate])) {
          trackingId = candidate;
          break;
        }
      }
      if (!trackingId)
        return res
          .status(503)
          .json({ error: "A unique tracking ID could not be generated." });
      try {
        db.transaction(() => {
          db.run(
            `INSERT INTO shipments
             (id, tracking_id, recipient, email, address, country, origin,
              destination, contents, status, created_at, eta)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Order Created', ?, ?)`,
            [
              shipmentId,
              trackingId,
              value.recipient,
              value.email,
              value.address,
              value.country,
              value.origin,
              value.destination,
              value.contents,
              createdAt,
              value.eta,
            ],
          );
          db.run(
            `INSERT INTO tracking_updates
             (id, shipment_id, status, location, note, created_at)
             VALUES (?, ?, 'Order Created', ?, ?, ?)`,
            [
              crypto.randomUUID(),
              shipmentId,
              value.origin,
              "Shipment order created by QuickEx administrator.",
              createdAt,
            ],
          );
        });
      } catch (error) {
        return next(error);
      }
      const row = db.queryOne("SELECT * FROM shipments WHERE id = ?", [
        shipmentId,
      ]);
      res.status(201).json({ shipment: getShipment(db, row) });
    },
  );

  app.put(
    "/api/shipments/:id",
    requireUser,
    requireAdmin,
    (req, res) => {
      let value;
      try {
        value = shipmentInput(req.body);
      } catch (error) {
        return res.status(error.status || 400).json({ error: error.message });
      }
      const changed = db.run(
        `UPDATE shipments
         SET recipient = ?, email = ?, address = ?, country = ?, origin = ?,
             destination = ?, contents = ?, eta = ?
         WHERE id = ?`,
        [
          value.recipient,
          value.email,
          value.address,
          value.country,
          value.origin,
          value.destination,
          value.contents,
          value.eta,
          req.params.id,
        ],
      );
      if (!changed)
        return res.status(404).json({ error: "Shipment not found." });
      const row = db.queryOne("SELECT * FROM shipments WHERE id = ?", [
        req.params.id,
      ]);
      res.json({ shipment: getShipment(db, row) });
    },
  );

  app.post(
    "/api/shipments/:id/status",
    requireUser,
    requireAdmin,
    (req, res) => {
      const status = String(req.body.status || "");
      const location = String(req.body.location || "").trim();
      const note = String(req.body.note || "").trim();
      if (!STATUSES.includes(status))
        return res.status(400).json({ error: "Choose a valid shipment status." });
      if (!location || location.length > 200 || !note || note.length > 1000)
        return res.status(400).json({
          error: "Enter a location and a tracking note (up to 1,000 characters).",
        });
      const shipment = db.queryOne("SELECT id FROM shipments WHERE id = ?", [
        req.params.id,
      ]);
      if (!shipment)
        return res.status(404).json({ error: "Shipment not found." });
      const createdAt = new Date().toISOString();
      db.transaction(() => {
        db.run("UPDATE shipments SET status = ? WHERE id = ?", [
          status,
          shipment.id,
        ]);
        db.run(
          `INSERT INTO tracking_updates
           (id, shipment_id, status, location, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            shipment.id,
            status,
            location,
            note,
            createdAt,
          ],
        );
      });
      const row = db.queryOne("SELECT * FROM shipments WHERE id = ?", [
        shipment.id,
      ]);
      res.json({ shipment: getShipment(db, row) });
    },
  );

  app.post(
    "/api/shipments/:trackingId/comments",
    requireUser,
    ownedShipment,
    (req, res) => {
      if (req.user.role !== "customer")
        return res
          .status(403)
          .json({ error: "Only the shipment recipient can comment." });
      const message = String(req.body.message || "").trim();
      if (!message || message.length > 2000)
        return res.status(400).json({
          error: "Comments must be between 1 and 2,000 characters.",
        });
      db.run(
        `INSERT INTO shipment_comments
         (id, shipment_id, user_id, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          req.shipment.id,
          req.user.id,
          message,
          new Date().toISOString(),
        ],
      );
      res.status(201).json({
        shipment: getShipment(
          db,
          db.queryOne("SELECT * FROM shipments WHERE id = ?", [
            req.shipment.id,
          ]),
        ),
      });
    },
  );

  app.get("/api/customers", requireUser, requireAdmin, (req, res) => {
    const customers = db.queryAll(
      `SELECT users.id, users.name, users.email, users.created_at,
              COUNT(shipments.id) AS shipment_count
       FROM users
       LEFT JOIN shipments ON lower(shipments.email) = lower(users.email)
       WHERE users.role = 'customer'
       GROUP BY users.id
       ORDER BY users.created_at DESC`,
    );
    res.json({
      customers: customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        createdAt: customer.created_at,
        shipmentCount: customer.shipment_count,
      })),
    });
  });

  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API endpoint not found." }),
  );

  const dist = path.join(root, "dist");
  if (production && fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false }));
    app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error(error);
    res.status(error.status || 500).json({
      error:
        error.status && error.status < 500
          ? error.message
          : "The server could not complete the request.",
    });
  });
  return app;
}
