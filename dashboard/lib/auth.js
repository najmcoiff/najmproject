"use client";

const SESSION_KEY = "nc_session";

export function getSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Lit la session depuis localStorage EN PRIORITÉ, puis sessionStorage en fallback.
 * Garantit la compatibilité avec les anciens tokens stockés en sessionStorage.
 */
export function getRawSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getRawToken() {
  return getRawSession()?.token || null;
}

export function saveSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  // Nettoyer l'ancien sessionStorage pour les sessions existantes
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

export function isLoggedIn() {
  const s = getSession();
  return !!s?.token;
}

/**
 * Retourne le timestamp d'expiration du token (ms), ou 0 si non trouvable.
 */
export function getTokenExpiry() {
  const s = getRawSession();
  if (!s?.token) return 0;
  try {
    const parts = s.token.split(".");
    if (parts.length >= 2) {
      // Format legacy base64.sig (2 parts) → payload = parts[0]
      // Format Supabase JWT (3 parts) → payload = parts[1]
      const payloadPart = parts.length === 2 ? parts[0] : parts[1];
      const raw = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
      const padded = raw + "=".repeat((4 - raw.length % 4) % 4);
      const payload = JSON.parse(atob(padded));
      // Legacy: exp en ms. Supabase JWT: exp en secondes.
      const exp = payload.exp || 0;
      return exp > 1e10 ? exp : exp * 1000;
    }
  } catch { /* ignore */ }
  return 0;
}

/**
 * Retourne true si le token est expiré ou absent.
 */
export function isTokenExpired() {
  const exp = getTokenExpiry();
  if (!exp) return true;
  return exp < Date.now();
}

/**
 * Retourne true si le token expire dans moins de `ms` millisecondes.
 */
export function isTokenExpiringSoon(ms = 5 * 60 * 1000) {
  const exp = getTokenExpiry();
  if (!exp) return true;
  return exp - Date.now() < ms;
}
