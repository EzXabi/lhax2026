import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { audit, customer, DomainError } from "./store";

export const COOKIE = "kbc_home_session";
const TTL = 4 * 60 * 60;
type Session = { sub: string; sid: string; exp: number };
type SecurityState = {
  sessions: Map<string, Session>;
  attempts: Map<string, { count: number; until: number }>;
};
const globalSecurity = globalThis as typeof globalThis & {
  kbcHomeSecurity?: SecurityState;
};
const security = () =>
  (globalSecurity.kbcHomeSecurity ??= {
    sessions: new Map(),
    attempts: new Map(),
  });

function config() {
  const password = process.env.DEMO_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!password || !secret || secret.length < 32)
    throw new DomainError(
      "Demo sign-in is not configured. Set DEMO_PASSWORD and SESSION_SECRET (at least 32 characters) in .env.local, then restart.",
      503,
    );
  return { password, secret };
}
const digest = (value: string) => createHash("sha256").update(value).digest();
function signature(payload: string) {
  return createHmac("sha256", config().secret)
    .update(payload)
    .digest("base64url");
}
export function rateLimit(key: string, maximum: number, duration: number) {
  const now = Date.now();
  for (const [k, value] of security().attempts)
    if (value.until <= now) security().attempts.delete(k);
  let attempt = security().attempts.get(key);
  if (!attempt) {
    attempt = { count: 0, until: now + duration };
    security().attempts.set(key, attempt);
  }
  if (++attempt.count > maximum)
    throw new DomainError(
      "Too many attempts. Please wait a few minutes and try again.",
      429,
    );
}
export function login(personaId: string, password: string) {
  const cfg = config();
  rateLimit("login:global", 40, 15 * 60_000);
  rateLimit(
    `login:${["sofie", "tom", "maria"].includes(personaId) ? personaId : "unknown"}`,
    12,
    15 * 60_000,
  );
  if (
    !timingSafeEqual(digest(password), digest(cfg.password)) ||
    !["sofie", "tom", "maria"].includes(personaId)
  ) {
    audit("anonymous", "session.login", "demo", "denied");
    throw new DomainError(
      "The demo password or selected persona is incorrect.",
      401,
    );
  }
  customer(personaId);
  for (const [sid, session] of security().sessions)
    if (session.exp <= Date.now()) security().sessions.delete(sid);
  const session = {
    sub: personaId,
    sid: randomBytes(24).toString("base64url"),
    exp: Date.now() + TTL * 1000,
  };
  security().sessions.set(session.sid, session);
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  audit(personaId, "session.login", "demo");
  return `${payload}.${signature(payload)}`;
}
export function verifyToken(token?: string): Session | null {
  if (!token || token.length > 2048) return null;
  try {
    const parts = token.split(".");
    if (
      parts.length !== 2 ||
      !timingSafeEqual(digest(parts[1]), digest(signature(parts[0])))
    )
      return null;
    const session = JSON.parse(
      Buffer.from(parts[0], "base64url").toString(),
    ) as Session;
    const active = security().sessions.get(session.sid);
    if (
      !active ||
      active.sub !== session.sub ||
      active.exp !== session.exp ||
      session.exp <= Date.now()
    )
      return null;
    customer(session.sub);
    return session;
  } catch {
    return null;
  }
}
export function requestToken(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
}
export function requireSession(request: Request) {
  const session = verifyToken(requestToken(request));
  if (!session) throw new DomainError("Please sign in to continue.", 401);
  return session;
}
export function logout(request: Request) {
  const session = verifyToken(requestToken(request));
  if (session) {
    security().sessions.delete(session.sid);
    audit(session.sub, "session.logout", "demo");
  }
}
export function expectedOrigin(request: Request) {
  if (process.env.APP_ORIGIN) return new URL(process.env.APP_ORIGIN).origin;
  const url = new URL(request.url);
  // Next's local adapter can normalize request.url to localhost. Host retains the
  // origin the browser actually requested; never trust a forwarded-host override.
  const host = request.headers.get("host");
  if (host) url.host = host;
  return url.origin;
}
export function sessionCookie(request: Request, token: string, clear = false) {
  const secure = new URL(expectedOrigin(request)).protocol === "https:";
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : TTL}${secure ? "; Secure" : ""}`;
}
export function sameOrigin(request: Request) {
  if (
    request.headers.get("origin") !== expectedOrigin(request) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new DomainError(
      "This action must be made from the demo itself.",
      403,
    );
}
