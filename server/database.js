import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";
import session from "express-session";

const require = createRequire(import.meta.url);

export async function createDatabase(databaseFile) {
  const file = path.resolve(databaseFile);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const SQL = await initSqlJs({
    locateFile: (name) => path.join(path.dirname(require.resolve("sql.js")), name),
  });
  const database = new SQL.Database(
    fs.existsSync(file) ? fs.readFileSync(file) : undefined,
  );
  let transactionDepth = 0;

  const persist = () => {
    const temporaryFile = `${file}.tmp`;
    fs.writeFileSync(temporaryFile, Buffer.from(database.export()));
    fs.renameSync(temporaryFile, file);
  };
  const queryAll = (sql, parameters = []) => {
    const statement = database.prepare(sql);
    try {
      statement.bind(parameters);
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  };
  const queryOne = (sql, parameters = []) => queryAll(sql, parameters)[0] || null;
  const run = (sql, parameters = []) => {
    database.run(sql, parameters);
    const changes = database.getRowsModified();
    if (transactionDepth === 0) persist();
    return changes;
  };
  const transaction = (callback) => {
    database.run("BEGIN IMMEDIATE");
    transactionDepth += 1;
    let result;
    try {
      result = callback();
      database.run("COMMIT");
    } catch (error) {
      database.run("ROLLBACK");
      transactionDepth -= 1;
      throw error;
    }
    transactionDepth -= 1;
    if (transactionDepth === 0) persist();
    return result;
  };

  database.run("PRAGMA foreign_keys = ON");
  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'customer')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      tracking_id TEXT NOT NULL UNIQUE,
      recipient TEXT NOT NULL,
      email TEXT NOT NULL,
      address TEXT NOT NULL,
      country TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      contents TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      eta TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS shipments_email_idx ON shipments(email);
    CREATE TABLE IF NOT EXISTS tracking_updates (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      location TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tracking_updates_shipment_idx
      ON tracking_updates(shipment_id, created_at);
    CREATE TABLE IF NOT EXISTS shipment_comments (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      expires INTEGER NOT NULL,
      data TEXT NOT NULL
    );
  `);
  run("DELETE FROM sessions WHERE expires <= ?", [Date.now()]);

  class SqliteSessionStore extends session.Store {
    get(sid, callback) {
      try {
        const row = queryOne("SELECT expires, data FROM sessions WHERE sid = ?", [
          sid,
        ]);
        if (!row) return callback(null, null);
        if (row.expires <= Date.now()) {
          this.destroy(sid, (error) => callback(error, null));
          return;
        }
        callback(null, JSON.parse(row.data));
      } catch (error) {
        callback(error);
      }
    }

    set(sid, value, callback = () => {}) {
      try {
        const expires = value.cookie?.expires
          ? new Date(value.cookie.expires).getTime()
          : Date.now() + 8 * 60 * 60 * 1000;
        run(
          "INSERT OR REPLACE INTO sessions (sid, expires, data) VALUES (?, ?, ?)",
          [sid, expires, JSON.stringify(value)],
        );
        callback(null);
      } catch (error) {
        callback(error);
      }
    }

    touch(sid, value, callback = () => {}) {
      try {
        const expires = value.cookie?.expires
          ? new Date(value.cookie.expires).getTime()
          : Date.now() + 8 * 60 * 60 * 1000;
        run("UPDATE sessions SET expires = ? WHERE sid = ?", [expires, sid]);
        callback(null);
      } catch (error) {
        callback(error);
      }
    }

    destroy(sid, callback = () => {}) {
      try {
        run("DELETE FROM sessions WHERE sid = ?", [sid]);
        callback(null);
      } catch (error) {
        callback(error);
      }
    }
  }

  persist();
  return {
    queryAll,
    queryOne,
    run,
    transaction,
    sessionStore: new SqliteSessionStore(),
    close: () => database.close(),
  };
}
