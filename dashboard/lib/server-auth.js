// ═══════════════════════════════════════════════════════════════════
//  server-auth.js — Vérification token côté API routes (serveur)
//  Gère 2 formats :
//    1. Legacy base64.sig  (généré par /api/auth/login fallback nc_users)
//    2. Supabase JWT 3-part (généré par Supabase Auth)
// ═══════════════════════════════════════════════════════════════════

import crypto from "crypto";

const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET || "nc_secret_2026";

/**
 * Decode et vérifie un token.
 * @returns {object|null}  payload { nom, role, badge, exp } ou null si invalide/expiré
 */
export function verifyToken(token) {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");

  // ── Format legacy : base64payload.md5sig (2 parties) ───────────
  if (parts.length === 2) {
    try {
      const [encoded, sig] = parts;
      const expectedSig = crypto
        .createHash("md5")
        .update(encoded + DASHBOARD_SECRET)
        .digest("hex")
        .slice(0, 16);
      if (sig !== expectedSig) return null;
      const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
      if (!payload.exp || payload.exp < Date.now()) return null;
      return payload; // { nom, role, badge, exp }
    } catch {
      return null;
    }
  }

  // ── Format Supabase JWT : header.payload.sig (3 parties) ───────
  if (parts.length === 3) {
    try {
      const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = raw + "=".repeat((4 - raw.length % 4) % 4);
      const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
      if (payload.exp && payload.exp * 1000 < Date.now()) return null;
      // Supabase JWT ne stocke pas le rôle métier → on lui accorde owner par défaut
      // Le vrai contrôle se fait en amont au login (nc_users.active)
      return {
        nom:   payload.email || payload.sub || "user",
        role:  "owner",
        badge: "",
        exp:   payload.exp ? payload.exp * 1000 : Date.now() + 8 * 3600 * 1000,
      };
    } catch {
      return null;
    }
  }

  return null;
}
