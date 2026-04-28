// ============================================================
// lib/utils.js — Utilitaires partagés nc-boutique
// ============================================================

/**
 * Formate un prix en dinars algériens.
 * Ex : 1500 → "1 500 DA"
 */
export function formatPrice(value) {
  const n = Number(value || 0);
  if (isNaN(n)) return "—";
  return n.toLocaleString("fr-FR") + " DA";
}

/**
 * Formate une date en format lisible français.
 * Ex : "2026-04-11T10:30:00Z" → "11/04/2026 à 12:30"
 */
export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d)) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} à ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Formate une date courte.
 * Ex : "2026-04-11T10:30:00Z" → "11/04/2026"
 */
export function formatDateShort(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d)) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Génère un numéro de commande au format NC-YYMMDD-XXXX.
 * Ex : NC-260411-0001
 * La séquence quotidienne est gérée côté serveur (Supabase).
 * Cette fonction génère la partie date uniquement.
 */
export function generateOrderPrefix() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `NC-${yy}${mm}${dd}`;
}

/**
 * Assemble un order_name complet.
 * @param {string} prefix  Ex : "NC-260411"
 * @param {number} seq     Ex : 7
 * @returns {string}       Ex : "NC-260411-0007"
 */
export function buildOrderName(prefix, seq) {
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

/**
 * Transforme un titre de produit en slug URL.
 * Ex : "Shampoing Argan 500ml" → "shampoing-argan-500ml"
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Calcule le total d'un panier.
 * @param {Array} items [{price, qty}]
 * @returns {number}
 */
export function calcCartTotal(items) {
  return items.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
}

/**
 * Calcule le nombre total d'articles dans un panier.
 * @param {Array} items [{qty}]
 * @returns {number}
 */
export function calcCartCount(items) {
  return items.reduce((sum, item) => sum + Number(item.qty), 0);
}

/**
 * Valide un numéro de téléphone algérien.
 * Accepte : 06xxxxxxxx, 07xxxxxxxx, +213xxxxxxxxx, 00213xxxxxxxxx
 */
export function isValidAlgerianPhone(phone) {
  const cleaned = String(phone || "").replace(/\s/g, "");
  return /^(0[567]\d{8}|(\+213|00213)[567]\d{8})$/.test(cleaned);
}

/**
 * Normalise un numéro de téléphone algérien en format 0XXXXXXXXX.
 */
export function normalizePhone(phone) {
  const cleaned = String(phone || "").replace(/\s/g, "");
  if (cleaned.startsWith("+213")) return "0" + cleaned.slice(4);
  if (cleaned.startsWith("00213")) return "0" + cleaned.slice(5);
  return cleaned;
}

/**
 * Tronque un texte à une longueur maximale.
 */
export function truncate(text, maxLength = 100) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

/**
 * Hash SHA-256 d'une chaîne (côté serveur uniquement via Web Crypto API Node.js).
 * Utilisé pour hasher les IPs avant stockage.
 */
export async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Extrait l'IP d'une requête Next.js de manière sûre.
 * @param {Request} request
 * @returns {string}
 */
export function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
