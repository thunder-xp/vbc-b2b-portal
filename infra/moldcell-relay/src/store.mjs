import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export class DurableRelayStore {
  constructor({ databasePath, rateLimitPerMinute, idempotencyTtlSeconds, replayWindowSeconds, now = Date.now }) {
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o750 });
    this.database = new DatabaseSync(databasePath, { timeout: 5_000 });
    this.rateLimitPerMinute = rateLimitPerMinute;
    this.idempotencyTtlSeconds = idempotencyTtlSeconds;
    this.replayWindowSeconds = replayWindowSeconds;
    this.now = now;
    this.initialize();
  }

  initialize() {
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS relay_requests (
        key_hash TEXT PRIMARY KEY,
        delivery_id TEXT NOT NULL UNIQUE,
        fingerprint TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('PENDING', 'COMPLETE')),
        http_status INTEGER,
        response_json TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS relay_requests_expiry_idx ON relay_requests (expires_at);
      CREATE TABLE IF NOT EXISTS relay_nonces (
        key_hash TEXT NOT NULL,
        nonce_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (key_hash, nonce_hash)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS relay_nonces_expiry_idx ON relay_nonces (expires_at);
      CREATE TABLE IF NOT EXISTS relay_rate_windows (
        key_hash TEXT NOT NULL,
        window_minute INTEGER NOT NULL,
        request_count INTEGER NOT NULL,
        PRIMARY KEY (key_hash, window_minute)
      ) STRICT;
    `);
  }

  claim({ keyId, nonce, idempotencyKey, deliveryId, fingerprint }) {
    const nowSeconds = Math.floor(this.now() / 1_000);
    const windowMinute = Math.floor(nowSeconds / 60);
    const keyHash = digest(`key:${keyId}`);
    const nonceHash = digest(`nonce:${nonce}`);
    const idempotencyHash = digest(`idempotency:${idempotencyKey}`);

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.cleanup(nowSeconds, windowMinute);
      const nonceInsert = this.database.prepare(`
        INSERT OR IGNORE INTO relay_nonces (key_hash, nonce_hash, expires_at) VALUES (?, ?, ?)
      `).run(keyHash, nonceHash, nowSeconds + this.replayWindowSeconds);
      if (nonceInsert.changes !== 1) return this.commit({ kind: "NONCE_REPLAY" });

      const existing = this.database.prepare(`
        SELECT fingerprint, state, http_status, response_json
        FROM relay_requests
        WHERE key_hash = ? OR delivery_id = ?
        LIMIT 1
      `).get(idempotencyHash, deliveryId);
      if (existing) {
        if (existing.fingerprint !== fingerprint) return this.commit({ kind: "CONFLICT" });
        if (existing.state === "COMPLETE") {
          return this.commit({
            kind: "CACHED",
            response: { status: existing.http_status, body: existing.response_json },
          });
        }
        return this.commit({ kind: "IN_PROGRESS" });
      }

      const rate = this.database.prepare(`
        SELECT request_count FROM relay_rate_windows WHERE key_hash = ? AND window_minute = ?
      `).get(keyHash, windowMinute);
      const count = Number(rate?.request_count ?? 0);
      if (count >= this.rateLimitPerMinute) return this.commit({ kind: "RATE_LIMITED" });
      this.database.prepare(`
        INSERT INTO relay_rate_windows (key_hash, window_minute, request_count)
        VALUES (?, ?, 1)
        ON CONFLICT (key_hash, window_minute)
        DO UPDATE SET request_count = request_count + 1
      `).run(keyHash, windowMinute);
      this.database.prepare(`
        INSERT INTO relay_requests
          (key_hash, delivery_id, fingerprint, state, created_at, expires_at)
        VALUES (?, ?, ?, 'PENDING', ?, ?)
      `).run(idempotencyHash, deliveryId, fingerprint, nowSeconds, nowSeconds + this.idempotencyTtlSeconds);
      return this.commit({ kind: "CLAIMED", keyHash: idempotencyHash });
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  complete(keyHash, response) {
    const nowSeconds = Math.floor(this.now() / 1_000);
    const update = this.database.prepare(`
      UPDATE relay_requests
      SET state = 'COMPLETE', http_status = ?, response_json = ?, completed_at = ?
      WHERE key_hash = ? AND state = 'PENDING'
    `).run(response.status, response.body, nowSeconds, keyHash);
    if (update.changes !== 1) throw new Error("IDEMPOTENCY_COMPLETION_FAILED");
  }

  close() {
    this.database.close();
  }

  cleanup(nowSeconds, currentWindowMinute) {
    this.database.prepare("DELETE FROM relay_requests WHERE expires_at < ?").run(nowSeconds);
    this.database.prepare("DELETE FROM relay_nonces WHERE expires_at < ?").run(nowSeconds);
    this.database.prepare("DELETE FROM relay_rate_windows WHERE window_minute < ?").run(currentWindowMinute - 1);
  }

  commit(result) {
    this.database.exec("COMMIT");
    return result;
  }
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
