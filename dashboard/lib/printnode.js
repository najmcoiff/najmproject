// ═══════════════════════════════════════════════════════════════════
//  lib/printnode.js — Utilitaire impression thermique via PrintNode
//  Utilisé par : /api/print/pos · /api/webhooks/shopify · /api/orders/pos-sync
// ═══════════════════════════════════════════════════════════════════

const PRINTNODE_API_KEY    = process.env.PRINTNODE_API_KEY    || "Gt6IIppM8CAkLkVP3JIgATocvWta5PkxW2WzPyntOQo";
const PRINTNODE_PRINTER_ID = Number(process.env.PRINTNODE_PRINTER_ID) || 75188287;

// ── Fenêtre auto-print : 5 minutes ──────────────────────────────
export const AUTO_PRINT_WINDOW_MS = 5 * 60 * 1000;

// ── Logo NAJMCOIFF en commande ESC/POS GS v 0 (200×200px, 1-bit) ─
// Généré via scripts/logo-to-escpos.cjs depuis public/logo.png
const LOGO_ESCPOS_B64 = "HXYwABkAyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//8AAAAAAAAAAAAAAAAAAAAAAAB4AAAAAf//AAAAAeAAAAAAAAAAAAAAAAAA3AAAAAD//AAAAANwAAAAAAAAAAAAAAAAAM4AAAAAP/gAAAAGMAAAAAAAAAAAAAAAAADGAAAAAB/wAAAABjAAAAAAAAAAAAAAAAAAxwAAAAAf4AAAAAxwAAAAAAAAAAAAAAAAAGOAAAAAH/AAAAAcYAAAAAAAAAAAAAAAAABxwAAAAB/wAAAAOMAAAAAAAAAAAAAAAAAAOOAAAAA88AAAAHHAAAAAAAAAAAAAAAAAABhwAAAAODgAAADhgAAAAAAAAAAAAAAAAAAYGAAAACAYAAABw4AAAAAAAAAAAAAAAAAADAwAAABAAAAAAwMAAAAAAAAAAAAAAAAAAAwMAAAAAAAAAAMDAAAAAAAAAAAAAAAAAAAMDgAAAAAAAAAHAwAAAAAAAAAAAAAAAAAADh8AAAAAAAAAD4cAAAAAAAAAAAAAAAAAAAYxgAAAAAAAABzGAAAAAAAAAAAAAAAAAAAD4YAAAAAAAAAYfAAAAAAAAAAAAAAAAAAAAeDAAAAAAAAAOHgAAAAAAAAAAAAAAAAAAADAwAAAAAAAADAwAAAAAAAAAAAAAAAAAAAAYMAAAAAAAAAwMAAAAAAAAAAAAAAAAAAAAGBgAAAAAAAAMGAAAAAAAAAAAAAAAAAAAAAwcAAAAAAAAGDgAAAAAAAAAAAAAAAAAAAAODgAAAAAAADBwAAAAAAAAAAAAAAAAAAAABwcAAAAAAABgYAAAAAAAAAAAAAAAAAAAAAMDgAAAAAABwOAAAAAAAAAAAAAAAAAAAAADgOAAAAAAA4DAAAAAAAAAAAAAAAAAAAAAAYBwAAAAAAcBwAAAAAAAAAAAAAAAAAAAAAHAMAAAAAAOAYAAAAAAAAAAAAAAAAAAAAAAwBgAAAAADAOAAAAAAAAAAAAAAAAAAAAAAMAYAAAAABgDAAAAAAAAAAAAAAAAAAAAAABgGAAAAAAYAwAAAAAAAAAAAAAAAAAAAAAAYfgAAAAAH4YAAAAAAAAAAAAAAAAAAAAAADP+AAAAAB/GAAAAAAAAAAAAAAAAAAAAAAAzDwAAAAB87AAAAAAAAAAAAAAAAAAAAAAAHgOAAAAA4HwAAAAAAAAAAAAAAAAAAAAAAA4BgAAAAcB4AAAAAAAAAAAAAAAAAAAAAAAGAYAAAAGAcAAAAAAAAAAAAAAAAAAAAAAABgGAAAABgDAAAAAAAAAAAAAAAAAAAAAAAAYBgAAAAIAwAAAAAAAAAAAAAAAAAAAAAAAHgMAAAAGAcAAAAAAAAAAAAAAAAAAAAAAAAcDAAAABgeAAAAAAAAAAAAAAAAAAAAAAAADgYAAAAwOAAAAAAAAAAAAAAAAAAAAAAAAAcHAAAAcHAAAAAAAAAAAAAAAAAAAAAAAAADAwAAAGBgAAAAAAAAAAAAAAAAAAAAAAAAAYGAAADAwAAAAAAAAAAAAAAAAAAAAAAAAAHAwAABwcAAAAAAAAAAAAAAAAAAAAAAAAAAwOAAAYGAAAAAAAAAAAAAAAAAAAAAAAAAAGBgAAMDAAAAAAAAAAAAAAAAAAAAAAAAAABgMAAHAwAAAAAAAAAAAAAAAAAAAAAAAAAAMBgADgYAAAAAAAAAAAAAAAAAAAAAAAAAADgcAAwGAAAAAAAAAAAAAAAAAAAAAAAAAAAYDgAYDAAAAAAAAAAAAAAAAAAAAAAAcBwADAcAMBwAAAH+AAAAAAAAAAAAAAAAAHgcAAwDgGAYAAAD/4AAAAAAAAAAAAAAAAB8HAAGAcDAOAAAB4OAAAAAAAAAAAAAAAAAfhwABgDxgDAAAA4AAAAAAAAAAAAAAAAAAG8cAAMAPwBwAAAOAAAAAAAAAAAAAAAAAABnnAADAB4AYAAADgAAAAAAAAAAAAAAAAAAY9wAAwAOAGAAAAwAAAAAAAAAAAAAAAAAAGH8AAMABwBgAAAOAAAAAAAAAAAAAAAAAABg/AADAAMAYAAADgAAAAAAAAAAAAAAAAAAYHwAAwADAGAAAAcBgAAAAAAAAAAAAAAAAGA8AAOAAYBgAAAHz4AAAAAAAAAAAAAAAABwHAADgAeAYAAAA/8AAAAAAAAAAAAAAAAAAAAAA4B/wOAAAAD8AAAAAAAAAAAAAAAAAAAAAAGB/+DgAAAAAAAAAAAAAAAAAAAAAAAAAAAAw8BwwAAAAAAAAAAAAAAAAAAAAAAAAAAAAMMAOYAAAAAAAAAAAAAAAAAAAAAAAAAAAABmABmAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPgAfwAAAAAAAAAAAAAAAAAAAAAAAAAAAAP4AH8AAAAAAAAAAAAAAAAAAAAAAAAAAAAH+ADjgAAAAAAAAAAAAAAAAAAAAAAAAAAABzgBwcAAAAAAAAAAAAAAAAAAAAAAAAAAAAwYB4DwAA4gAAAAAAAAAAAAAAAAAAAAAAAcEB8A////8AAAAAAAAAAAAAAAAAAAM/8A+DD+AB//jzAAAAAAAAAAAAAAAAAAAD////gQBgAYAAYYAAAAAAAAAAAAAAAAAABzgADgEA4AMAAMDAAAAAAAAAAAAAAAAAAA4YAAYAgMAHAACAYAAAAAAAAAAAAAAAAAAMCAADAMPADgAAgHAAAAAAAAAAAAAAAAAAGAgAAYB/gBwAB8AYAAAAAAAAAAAAAAAAADAMAAHAHgAYAH/ADAAAAAAAAAAAAAAAAABgD8AA4A4AMAD4YAcAAAAAAAAAAAAAAAAAwB/4AGAMBjADgGABgAAAAAAAAAAAAAAAA4AYHgBhDAYwBgAgAMAAAAAAAAAAAAAAAAYAEAcAYQwH+AwAIABgAAAAAAAAAAAAAAAMABABgH+MB/w4ADAAfgAAAAAAAAAAAAAAGAAwAOB/hg4f8AAfwB8AAAAAAAAAAAAAAPgAYAB74YMMDAAAAeADgAAAAAAAAAAAAAPwD8AAH8DD+AwAAAB9gYAAAAAAAAAAAAAHAB4AAADA/vAMAAAAH4CAAAAAAAAAAAAABgbwAAAAwHzADAAAAAGBgAAAAAAAAAAAAAwH4AAAAYAIwAYAAAABgYAAAAAAAAAAAAAMBwAAAAGADGAGAAAAAYMAAAAAAAAAAAAABgYAAAABgBhgBgAAAAEDAAAAAAAAAAAAAAYGAAAAAYAYMAYAAAABBgAAAAAAAAAAAAADBgAAAAGAMBgGAAAAAQ4AAAAAAAAAAAAAA4IAAAABgGAMBgAAAAEMAAAAAAAAAAAAAAGCAAAAAYDABAYAAAABCAAAAAAAAAAAAAAAwgAAAAGAwAYGAAAAARgAAAAAAAAAAAAAAEIAAAABgYACAgAAAAMYAAAAAAAAAAAAAABiAAAAAYEAAQMAAAADEAAAAAAAAAAAAAAAYwAAAAECAAEDAAAAAzAAAAAAAAAAAAAAACMAAAADAgAAgwAAAAMwAAAAAAAAAAAAAAAzAAAAAwYAAMGAAAAB4AAAAAAAAAAAAAAAMwAAAAIEAABBgAAAAeAAAAAAAAAAAAAAABoAAAAGDAAAYMAAAADAAAAAAAAAAAAAAAAeAAAABAgAACBAAAADwAAAAAAAAAAAAAAADgAAAAwYAAAgYAAAB4AAAAAAAAAAAAAAAA8AAAAYEAAAMDAAAA2AAAAAAAAAAAAAAAAHwAAAGDAAABAQAAAZgAAAAAAAAAAAAAAABsAAADAgAAAYGAAAOYAAAAAAAAAAAAAAAAZgAAAgIAAACAwAAGOAAAAAAAAAAAAAAAAGMAAAYCAAAAgGAADDAAAAAAAAAAAAAAAAAxgAAMBAAAAMAwABhgAAAAAAAAAAAAAAAAMMAAGAQAAABAHAAYYAAAAAAAAAAAAAAAABhgADAMAAAAQA4ACGAAAAAAAAAAAAAAAAAYYADgDAAAAEADAAxAAAAAAAAAAAAAAAAADGABgAgAAABAA8AMwAAAAAAAAAAAAAAAAAxAB4AIAAAAQAZwDMAAAAAAAAAAAAAAAAAMQA+ACAAAAAAMOAzAAAAAAAAAAAAAAAAADEAYwAgAAAAgOBwMwAAAAAAAAAAAAAAAAARAcPAIAAAAIDAHCMAAAAAAAAAAAAAAAAAEYOAwGAAAABAgA9iAAAAAAAAAAAAAAAAABmPAGBAAAAAcQAD4gAAAAAAAAAAAAAAAAAZvAAggAAAAB8AAHoAAAAAAAAAAAAAAAAAGfgAP4AAAAABgAAeAAAAAAAAAAAAAAAAAAuAAB4AAAAAAPwADwAAAAAAAAAAAAAAAAAPAAHwAAAAAAAP8B2AAAAAAAAAAAAAAAAABgAfgAAAAAAAAP/5gAAAAAAAAAAAAAAAAAcH+AAAAAAAAAAH4YAAAAAAAAAAAAAAAAAD/4AAAAAAAAAAAwDAAAAAAAAAAAAAAAAAAPgAAAAAAAAAAAGAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgYDgAc8DgA+AfgY/8/+AAAAAAAAAAAAAA4GA4AHPA4A/4P+GP/P/gAAAAAAAAAAAAAPBgPABzweAcDHBhjgDgAAAAAAAAAAAAAAD4YHwAc+HgOADgcY4A4AAAAAAAAAAAAAAA3GBuAHPj4DgAwDGOAOAAAAAAAAAAAAAAAM5g5gBzc2AwAMAxj/D/AAAAAAAAAAAAAADHYMcAcz5gOADAMY4Q4QAAAAAAAAAAAAAAw+H/AHM+YDgAwDGOAOAAAAAAAAAAAAAAAMHhg4BzHGAYAOBxjgDgAAAAAAAAAAAAAADA44HIYwxgHAxw4Y4A4AAAAAAAAAAAAAAAwGMB3+OIYA/4P8GOAOAAAAAAAAAAAAAAAAAAAAeAAAAD4A8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

// ── Helpers ESC/POS (Buffer-based) ──────────────────────────────
const ESC  = 0x1B;
const GS   = 0x1D;

function buf(str) { return Buffer.from(str, "latin1"); }
function cmd(...bytes) { return Buffer.from(bytes); }

const B_INIT    = cmd(ESC, 0x40);          // Init
const B_CENTER  = cmd(ESC, 0x61, 0x01);    // Alignement centré
const B_LEFT    = cmd(ESC, 0x61, 0x00);    // Alignement gauche
const B_BOLD_ON  = cmd(ESC, 0x45, 0x01);   // Gras ON
const B_BOLD_OFF = cmd(ESC, 0x45, 0x00);   // Gras OFF
const B_CUT      = cmd(GS,  0x56, 0x00);   // Coupe papier

// ── Logo : Buffer ESC/POS GS v 0 ────────────────────────────────
const LOGO_BUF = Buffer.from(LOGO_ESCPOS_B64, "base64");

// ── Formater un nombre avec espaces ASCII (pas d'espace insécable \xA0) ──
// toLocaleString("fr-FR") produit \xA0 que les imprimantes thermiques affichent "/"
function fmtNum(n) {
  return Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// ── Tronquer + padder un texte à longueur fixe (ASCII safe) ──────
function padEnd(str, len) {
  const s = String(str || "").slice(0, len);
  return s + " ".repeat(Math.max(0, len - s.length));
}
function padStart(str, len) {
  const s = String(str || "").slice(0, len);
  return " ".repeat(Math.max(0, len - s.length)) + s;
}

// ── Construction ticket ESC/POS (Buffer) ─────────────────────────
export function buildPosTicket(order) {
  // order_name = "POS-260415-0001" | shopify_order_name = "#43465" | fallback UUID
  const orderName = order.order_name || order.shopify_order_name || ("#" + (order.order_id || ""));
  const dateStr   = order.order_date
    ? new Date(order.order_date).toLocaleString("fr-DZ", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        timeZone: "Africa/Algiers",
      })
    : "";

  // ── Construire les lignes d'articles ───────────────────────────
  // Priorité : items_json (données complètes) → order_items_summary (fallback)
  const LINE_W = 32; // largeur totale ticket 58mm ≈ 32 chars
  let itemLines = [];

  // Priorité : items_json → order_items_summary
  const rawItems = Array.isArray(order.items_json)
    ? order.items_json
    : (typeof order.items_json === "string"
        ? (() => { try { return JSON.parse(order.items_json); } catch { return []; } })()
        : []);

  if (rawItems.length > 0) {
    for (const item of rawItems) {
      const qty   = Number(item.qty || item.quantity || 1);
      const price = Number(item.price || 0);
      const lineTotal = qty * price;
      const name  = String(item.title || item.display_name || item.variant_id || "Article");
      const priceStr = fmtNum(lineTotal) + " DA";
      const prefix   = String(qty) + " ";
      const avail    = LINE_W - prefix.length - priceStr.length;
      const truncName = name.length > avail ? name.slice(0, Math.max(1, avail - 1)) + "." : name;
      const gap = " ".repeat(Math.max(1, avail - truncName.length));
      itemLines.push(buf(prefix + truncName + gap + priceStr + "\n"));
    }
  } else {
    // Fallback : parser order_items_summary (séparé par " | ")
    const lines = String(order.order_items_summary || "")
      .split(" | ")
      .map(l => l.trim())
      .filter(Boolean);
    for (const l of lines) {
      // Format attendu: "2 x Nom — 4200 DA"
      const parts = l.match(/^(\d+)\s+x\s+(.+?)\s+—\s+([\d\s,.]+\s*DA)$/);
      if (parts) {
        const qty      = parts[1];
        const name     = parts[2];
        // Re-formatter le prix en ASCII pur
        const rawPrice = parts[3].replace(/[^\d]/g, "");
        const priceStr = fmtNum(rawPrice) + " DA";
        const prefix   = qty + " ";
        const avail    = LINE_W - prefix.length - priceStr.length;
        const truncName = name.length > avail ? name.slice(0, Math.max(1, avail - 1)) + "." : name;
        const gap = " ".repeat(Math.max(1, avail - truncName.length));
        itemLines.push(buf(prefix + truncName + gap + priceStr + "\n"));
      } else {
        itemLines.push(buf(l.slice(0, LINE_W) + "\n"));
      }
    }
  }

  const total       = Number(order.order_total || 0);
  const posDiscount = Number(order.pos_discount || 0);
  const subtotal    = posDiscount > 0 ? Number(order.subtotal || (total + posDiscount)) : total;
  const totalStr    = fmtNum(total) + " DA";
  const SEP         = buf("--------------------------------\n");

  // ── Lignes remise (uniquement si remise > 0) ─────────────────
  const discountLines = posDiscount > 0 ? [
    buf("Sous-total: " + padStart(fmtNum(subtotal) + " DA", LINE_W - 12) + "\n"),
    buf("Remise    : " + padStart("-" + fmtNum(posDiscount) + " DA", LINE_W - 12) + "\n"),
    SEP,
  ] : [];

  const parts = [
    B_INIT,
    B_CENTER,
    LOGO_BUF,
    buf("\n"),
    B_BOLD_ON,  buf("NAJMCOIFF\n"),   B_BOLD_OFF,
    buf("najmcoiff\n"),
    buf("birtouta alger, 16000\n"),
    buf("Tel: 0798522820\n"),
    SEP,
    B_CENTER,
    B_BOLD_ON, buf("FACTURE\n"), B_BOLD_OFF,
    SEP,
    B_LEFT,
    buf("N Facture : "), B_BOLD_ON, buf(orderName + "\n"), B_BOLD_OFF,
    dateStr ? buf("Date      : " + dateStr + "\n") : Buffer.alloc(0),
    SEP,
    ...itemLines,
    SEP,
    ...discountLines,
    B_BOLD_ON,
    buf("TOTAL : " + padStart(totalStr, LINE_W - 8) + "\n"),
    B_BOLD_OFF,
    SEP,
    B_CENTER,
    buf("Merci pour votre confiance !\n"),
    buf("\n\n\n\n\n\n"),
    B_CUT,
  ];

  return Buffer.concat(parts);
}

// ── Envoi vers PrintNode ─────────────────────────────────────────
export async function sendToPrintNode(ticketBuffer, title = "Ticket POS - NAJMCOIFF") {
  // Accepte Buffer ou string (rétrocompat)
  const content = Buffer.isBuffer(ticketBuffer)
    ? ticketBuffer.toString("base64")
    : Buffer.from(ticketBuffer, "latin1").toString("base64");

  const auth = Buffer.from(PRINTNODE_API_KEY + ":").toString("base64");

  const payload = {
    printerId:   PRINTNODE_PRINTER_ID,
    title,
    contentType: "raw_base64",
    content,
    source:      "NAJMCOIFF_SYSTEM",
  };

  const res = await fetch("https://api.printnode.com/printjobs", {
    method:  "POST",
    headers: {
      "Authorization": "Basic " + auth,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`PrintNode HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const jobId = await res.json();
  return { ok: true, print_job_id: jobId };
}

// ── Impression complète d'un bon POS ────────────────────────────
export async function printPosOrder(order) {
  const ticket = buildPosTicket(order);
  const title  = "Ticket POS " + (order.shopify_order_name || order.order_id);
  return sendToPrintNode(ticket, title);
}

// ── Vérifie si l'auto-print est encore dans la fenêtre des 5min ─
export function isWithinAutoPrintWindow(orderDate) {
  if (!orderDate) return false;
  const created = new Date(orderDate).getTime();
  return Date.now() - created <= AUTO_PRINT_WINDOW_MS;
}
