import crypto from "crypto";

const SECRET = process.env.BOUTIQUE_SECRET || "nc_boutique_default_secret";

// ── Password helpers ──────────────────────────────────────────────────────────

export function generateSalt() {
  return crypto.randomBytes(16).toString("hex");
}

export function hashPassword(password, salt) {
  return crypto.createHmac("sha256", salt).update(password).digest("hex");
}

export function verifyPassword(password, salt, hash) {
  return hashPassword(password, salt) === hash;
}

// ── Token helpers (HMAC JWT-like, 7 jours) ───────────────────────────────────

export function generateToken(customerId) {
  const payload = {
    id: customerId,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(data).digest("hex");
  return `${data}.${sig}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(data)
    .digest("hex");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Extracteur de token depuis headers ───────────────────────────────────────

export function extractToken(request) {
  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}
