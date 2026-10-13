import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Db } from "../db/db.ts";
import type { Config } from "../config.ts";
import { newId, randomToken, sha256 } from "../lib/crypto.ts";
import { unauthorized } from "../lib/errors.ts";

export interface SessionUser {
  userId: string;
  sessionId: string;
}

export type AppEnv = { Variables: { user: SessionUser } };

export const cookieName = (cfg: Config) => (cfg.env === "production" ? "__Host-ncw_session" : "ncw_session");

export async function createSession(db: Db, cfg: Config, c: Context, userId: string): Promise<void> {
  const token = randomToken();
  const now = Date.now();
  await db.query(
    "INSERT INTO sessions (id, token_hash, user_id, expires_at, idle_expires_at) VALUES ($1, $2, $3, $4, $5)",
    [newId(), sha256(token), userId, new Date(now + cfg.sessionTtlHours * 3_600_000), new Date(now + cfg.sessionIdleMinutes * 60_000)],
  );
  setCookie(c, cookieName(cfg), token, {
    httpOnly: true,
    secure: cfg.env === "production",
    sameSite: "Strict",
    path: "/",
    maxAge: cfg.sessionTtlHours * 3600,
  });
}

/** Header waarmee de web-app de sessie controleert zonder hem te verlengen (achtergrondcontrole, geen activiteit). */
export const SESSION_CHECK_HEADER = "x-kern-session-check";

/**
 * Valideert de sessie (absolute én inactiviteitstermijn) en verlengt de inactiviteitstermijn.
 * Uitzondering: een GET met `x-kern-session-check: 1` verlengt niet. Anders zou de periodieke controle van de
 * web-app de sessie eeuwig levend houden zolang een tabblad open staat (ADR-0005: verlopen na inactiviteit).
 */
export function requireSession(db: Db, cfg: Config): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = getCookie(c, cookieName(cfg));
    if (!token || token.length > 128) throw unauthorized();
    const passive = c.req.method === "GET" && c.req.header(SESSION_CHECK_HEADER) === "1";
    const rows = passive
      ? await db.query<{ id: string; user_id: string }>(
          `SELECT id, user_id FROM sessions
           WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() AND idle_expires_at > now()`,
          [sha256(token)],
        )
      : await db.query<{ id: string; user_id: string }>(
          `UPDATE sessions SET idle_expires_at = $2
           WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() AND idle_expires_at > now()
           RETURNING id, user_id`,
          [sha256(token), new Date(Date.now() + cfg.sessionIdleMinutes * 60_000)],
        );
    const s = rows[0];
    if (!s) throw unauthorized();
    c.set("user", { userId: s.user_id, sessionId: s.id });
    await next();
  };
}

export async function revokeSession(db: Db, cfg: Config, c: Context, sessionId: string): Promise<void> {
  await db.query("UPDATE sessions SET revoked_at = now() WHERE id = $1", [sessionId]);
  deleteCookie(c, cookieName(cfg), { path: "/", secure: cfg.env === "production" });
}
