// Short-lived HMAC-SHA256 token. Minted by the Worker after it has (a) passed
// rate-limit and (b) reserved a global concurrency slot, then handed to the
// SessionDO which verifies it before running the session. This makes the DO
// endpoint unspawnable except through the Worker's front door, even though the
// DO is internal-only — defense in depth.
//
// The wire form is compact on purpose: the attach token is printed as a QR in
// the demo shell, and every byte in it becomes modules a camera has to resolve.
// A JSON payload put the QR past the terminal's viewport. The binary payload is
// version, scope, a 6-byte expiry (epoch ms), and the session id; the MAC is a
// truncated HMAC over that payload. Field order is the format; change it only
// with every consumer.

const enc = new TextEncoder();
const dec = new TextDecoder();

const TOKEN_VERSION = 1;
const EXP_BYTES = 6;
const MAC_BYTES = 16;
/** Identifies one disposable session; 96 random bits, URL-safe. */
const SID_BYTES = 12;

const SCOPE = { session: 0, attach: 1 } as const;

export interface SessionClaims {
  sid: string; // session id (also the DO name)
  exp: number; // epoch ms expiry
  /**
   * What the token is allowed to do. "session" opens a session (the Worker's
   * own front-door token); "attach" is the single-use pairing code a session
   * hands to a second screen. Absent means "session", which is what every token
   * minted before pairing existed.
   */
  scope?: "session" | "attach";
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A fresh opaque session id, short enough for the pairing QR. */
export function newSessionId(): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(SID_BYTES)));
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// Constant-time comparison to avoid signature-timing oracles.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** The binary payload: version, scope, 6-byte expiry, then the session id. */
function encodePayload(claims: SessionClaims): Uint8Array | null {
  // An unknown scope is minted as an unmistakably invalid byte; verification
  // refuses it, so a caller mistake can never become a usable credential.
  const scope =
    claims.scope === "attach"
      ? SCOPE.attach
      : claims.scope === undefined || claims.scope === "session"
        ? SCOPE.session
        : 0xff;
  if (!Number.isFinite(claims.exp) || claims.exp <= 0) return null;
  const sid = enc.encode(claims.sid);
  if (sid.length === 0 || sid.length > 255) return null;
  const payload = new Uint8Array(3 + EXP_BYTES + sid.length);
  payload[0] = TOKEN_VERSION;
  payload[1] = scope;
  let exp = BigInt(Math.floor(claims.exp));
  for (let i = EXP_BYTES - 1; i >= 0; i--) {
    payload[2 + i] = Number(exp & 0xffn);
    exp >>= 8n;
  }
  payload[2 + EXP_BYTES] = sid.length;
  payload.set(sid, 3 + EXP_BYTES);
  return payload;
}

interface Decoded {
  scope: "session" | "attach";
  exp: number;
  sid: string;
}

function decodePayload(payload: Uint8Array): Decoded | null {
  if (payload.length < 3 + EXP_BYTES || payload[0] !== TOKEN_VERSION) return null;
  const scope = payload[1] === SCOPE.attach ? "attach" : payload[1] === SCOPE.session ? "session" : null;
  if (!scope) return null;
  let exp = 0n;
  for (let i = 0; i < EXP_BYTES; i++) exp = (exp << 8n) | BigInt(payload[2 + i]);
  if (exp > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const sidLength = payload[2 + EXP_BYTES];
  if (sidLength === 0 || payload.length !== 3 + EXP_BYTES + sidLength) return null;
  let sid: string;
  try {
    sid = dec.decode(payload.subarray(3 + EXP_BYTES));
  } catch {
    return null;
  }
  if (sid.length === 0) return null;
  return { scope, exp: Number(exp), sid };
}

export async function mintToken(secret: string, claims: SessionClaims): Promise<string> {
  const payload = encodePayload(claims);
  if (!payload) throw new Error("invalid session claims");
  const key = await importKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  return `${b64urlEncode(payload)}.${b64urlEncode(sig.subarray(0, MAC_BYTES))}`;
}

export async function verifyToken(
  secret: string,
  token: string,
  scope: "session" | "attach" = "session",
): Promise<SessionClaims | null> {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  let payload: Uint8Array;
  let provided: Uint8Array;
  try {
    payload = b64urlDecode(token.slice(0, dot));
    provided = b64urlDecode(token.slice(dot + 1));
  } catch {
    return null;
  }
  if (provided.length !== MAC_BYTES) return null;
  const key = await importKey(secret);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  if (!timingSafeEqual(expected.subarray(0, MAC_BYTES), provided)) return null;
  const claims = decodePayload(payload);
  if (!claims) return null;
  if (Date.now() > claims.exp) return null;
  // A pairing code can never stand in for a session, and vice versa.
  return claims.scope === scope ? claims : null;
}
