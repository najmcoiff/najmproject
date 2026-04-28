// ═══════════════════════════════════════════════════════════════════
//  POST /api/suivi-zr/search — Recherche live depuis ZR Express API
//
//  Stratégie (confirmée par tests ZR) :
//    GET /parcels/{UUID} → seule méthode fiable (pas le tracking string)
//    POST /parcels/search → pagination pour trouver sans UUID
//
//  Deux modes :
//    • tracking → cherche parcel_id dans nc_suivi_zr puis GET /parcels/{uuid}
//                 sinon POST /parcels/search filtré par trackingNumber
//    • phone    → cherche tous les colis dans nc_suivi_zr par téléphone
//                 appelle GET /parcels/{uuid} pour chaque, + POST /parcels/search
//
//  Body: { token, tracking?, phone? }
//  Réponse: { ok, mode, snapshot, history } ou { ok, mode, parcels[] }
// ═══════════════════════════════════════════════════════════════════

import { NextResponse }      from "next/server";
import { createClient }      from "@supabase/supabase-js";
import { verifyToken }       from "@/lib/server-auth";
import { zrHeaders, ZR_BASE } from "@/lib/zr-express";
import { mapZRState }        from "@/lib/zr-states";

export const maxDuration = 30;

function adminSB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ── Normaliser un numéro de téléphone algérien ─────────────────
function normalizePhone(raw) {
  const digits = String(raw || "").replace(/[^0-9]/g, "");
  if (digits.startsWith("213")) return "+" + digits;
  if (digits.startsWith("0"))   return "+213" + digits.slice(1);
  if (digits.length >= 9)       return "+213" + digits;
  return digits;
}

function phonesMatch(a, b) {
  return a && b && normalizePhone(a) === normalizePhone(b);
}

// ── GET /parcels/{uuid} — seule méthode fiable avec ZR API ─────
async function zrGetByUUID(uuid) {
  const res = await fetch(`${ZR_BASE}/parcels/${uuid}`, { headers: zrHeaders() });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// ── POST /parcels/search filtré par trackingNumber (pagination) ─
async function zrSearchByTracking(trackingNumber) {
  const upper = String(trackingNumber).trim().toUpperCase();
  // Essai 1 : filtre direct (documenté dans certaines versions ZR)
  const r1 = await fetch(`${ZR_BASE}/parcels/search`, {
    method:  "POST",
    headers: zrHeaders(),
    body:    JSON.stringify({ trackingNumber: upper, pageSize: 50, pageNumber: 1 }),
  });
  if (r1.ok) {
    const d = await r1.json().catch(() => null);
    const match = d?.items?.find(
      p => String(p.trackingNumber || "").trim().toUpperCase() === upper
    );
    if (match) return match;
  }

  // Essai 2 : pagination manuelle (pages 1-10)
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`${ZR_BASE}/parcels/search`, {
      method:  "POST",
      headers: zrHeaders(),
      body:    JSON.stringify({ pageNumber: page, pageSize: 100 }),
    });
    if (!r.ok) break;
    const d = await r.json().catch(() => null);
    if (!d?.items?.length) break;
    const match = d.items.find(
      p => String(p.trackingNumber || "").trim().toUpperCase() === upper
    );
    if (match) return match;
    if (!d.hasNext) break;
  }
  return null;
}

// ── Historique des statuts d'un colis ──────────────────────────
async function fetchStateHistory(parcelId) {
  if (!parcelId) return [];
  try {
    const res = await fetch(`${ZR_BASE}/parcels/${parcelId}/state-history`, { headers: zrHeaders() });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    return Array.isArray(data) ? data : (data?.items || []);
  } catch { return []; }
}

// ── Extraire une chaîne depuis un champ ZR (peut être objet hub) ──
// ZR Express renvoie parfois city/district comme objet hub pour les relais :
// { hubId, hubName, hubCity, hubDistrict, type, membership, hubTerritoryCityId }
function extractStr(val, fallback = "—") {
  if (!val) return fallback;
  if (typeof val === "string") return val.trim() || fallback;
  if (typeof val === "object") {
    // Hub / pickup point / bureau
    return String(
      val.hubCity  || val.hubName    || val.cityName  ||
      val.name     || val.districtName ||
      val.hubDistrict || fallback
    ).trim();
  }
  return String(val).trim() || fallback;
}

// ── Formater un colis ZR en snapshot lisible ───────────────────
function formatSnapshot(parcel) {
  const state   = mapZRState(parcel.state || parcel.status);
  const address = parcel.deliveryAddress || {};
  const phone1  = parcel?.customer?.phone?.number1 || "";
  const phone2  = parcel?.customer?.phone?.number2 || "";

  return {
    trackingNumber: String(parcel.trackingNumber || ""),
    parcelId:       String(parcel.id             || ""),
    customerName:   String(parcel?.customer?.name || "—"),
    phone1:         String(phone1),
    phone2:         String(phone2),
    // city et district peuvent être des objets hub pour les points relais
    city:           extractStr(address.city     || address.cityName),
    district:       extractStr(address.district || address.districtName),
    street:         extractStr(address.street, ""),
    deliveryType:   String(parcel.deliveryType   || "home"),
    amount:         Number(parcel.amount  || 0),
    deliveryPrice:  Number(parcel.deliveryPrice || 0),
    stateName:      String(state.stateName || ""),
    stateLabel:     String(state.label     || "Inconnu"),
    stateIsFinal:   !!state.final,
    finalType:      state.final || null,
    attempts:       Number(parcel.failedDeliveriesCount || 0),
    lastUpdate:     parcel.lastStateUpdateAt || parcel.updatedAt || null,
    createdAt:      parcel.createdAt || null,
    externalId:     String(parcel.externalId || ""),
    situation:      String(parcel?.situation?.name || ""),
  };
}

// ── Formatage historique ────────────────────────────────────────
function formatHistory(rawHistory) {
  return (rawHistory || []).map(h => ({
    state:    String(h.newState?.name || h.state?.name || "—"),
    label:    String(mapZRState(h.newState || h.state).label || "Inconnu"),
    location: extractStr(h.location, ""),
    date:     h.createdAt || h.date || null,
  })).reverse();
}

// ════════════════════════════════════════════════════════════════
//  HANDLER
// ════════════════════════════════════════════════════════════════
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!verifyToken(body.token)) {
      return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });
    }

    const tracking = String(body.tracking || "").trim().toUpperCase();
    const phone    = String(body.phone    || "").trim();

    if (!tracking && !phone) {
      return NextResponse.json({ ok: false, error: "Fournir tracking ou téléphone" }, { status: 400 });
    }

    const supabase = adminSB();

    // ════════════════════════════════════════════════════════════
    //  MODE TRACKING
    // ════════════════════════════════════════════════════════════
    if (tracking) {
      let parcelData = null;

      // Étape 1 : chercher le parcel_id (UUID) dans nc_suivi_zr
      const { data: suiviRows } = await supabase
        .from("nc_suivi_zr")
        .select("parcel_id, tracking, customer_name, order_id")
        .ilike("tracking", tracking)
        .limit(1);

      const parcelId = suiviRows?.[0]?.parcel_id || null;

      // Étape 2a : GET /parcels/{uuid} — le plus fiable
      if (parcelId) {
        parcelData = await zrGetByUUID(parcelId);
      }

      // Étape 2b : POST /parcels/search par trackingNumber
      if (!parcelData) {
        parcelData = await zrSearchByTracking(tracking);
      }

      if (!parcelData) {
        // Renvoyer les infos Supabase si ZR ne répond pas
        if (suiviRows?.[0]) {
          return NextResponse.json({
            ok:      false,
            mode:    "tracking",
            error:   "Colis introuvable sur ZR Express (peut être livré ou archivé)",
            supabase: suiviRows[0],
          });
        }
        return NextResponse.json({
          ok:    false,
          mode:  "tracking",
          error: "Colis introuvable — vérifier le numéro de tracking",
        });
      }

      const snapshot = formatSnapshot(parcelData);
      const rawHist  = await fetchStateHistory(snapshot.parcelId || parcelId);
      const history  = formatHistory(rawHist);

      // Enrichir avec les infos nc_suivi_zr si disponibles
      if (suiviRows?.[0]) {
        snapshot._orderId    = suiviRows[0].order_id || "";
      }

      return NextResponse.json({ ok: true, mode: "tracking", snapshot, history });
    }

    // ════════════════════════════════════════════════════════════
    //  MODE TÉLÉPHONE
    // ════════════════════════════════════════════════════════════
    if (phone) {
      const normalized = normalizePhone(phone);
      const phoneShort = normalized.replace(/^\+213/, "0");

      // Étape 1 : chercher dans nc_suivi_zr par téléphone
      const { data: suiviRows } = await supabase
        .from("nc_suivi_zr")
        .select("parcel_id, tracking, customer_name, customer_phone, order_id, statut_livraison, wilaya")
        .or(`customer_phone.ilike.%${phoneShort.slice(-9)}%`)
        .limit(20);

      const matchedDB = (suiviRows || []).filter(r =>
        phonesMatch(r.customer_phone, phone)
      );

      // Étape 2 : récupérer chaque colis depuis ZR via parcel_id
      const zrResults = [];
      for (const row of matchedDB) {
        if (row.parcel_id) {
          const data = await zrGetByUUID(row.parcel_id);
          if (data) zrResults.push(data);
        }
      }

      // Étape 3 : si aucun résultat ZR, essayer POST /parcels/search avec phone
      if (!zrResults.length) {
        const r = await fetch(`${ZR_BASE}/parcels/search`, {
          method:  "POST",
          headers: zrHeaders(),
          body:    JSON.stringify({ phone: normalized, pageSize: 50, pageNumber: 1 }),
        });
        if (r.ok) {
          const d = await r.json().catch(() => null);
          const items = (d?.items || []).filter(p =>
            phonesMatch(p?.customer?.phone?.number1, phone) ||
            phonesMatch(p?.customer?.phone?.number2, phone)
          );
          zrResults.push(...items);
        }
      }

      // Étape 4 : si toujours rien, renvoyer les infos Supabase
      if (!zrResults.length) {
        if (matchedDB.length) {
          return NextResponse.json({
            ok:      false,
            mode:    "phone",
            error:   `${matchedDB.length} commande(s) trouvée(s) en DB mais ZR ne répond pas`,
            supabase: matchedDB.map(r => ({
              tracking:        r.tracking,
              customerName:    r.customer_name,
              phone:           r.customer_phone,
              statut:          r.statut_livraison,
              wilaya:          r.wilaya,
              orderId:         r.order_id,
            })),
          });
        }
        return NextResponse.json({
          ok:    false,
          mode:  "phone",
          error: "Aucun colis trouvé pour ce numéro de téléphone",
        });
      }

      const parcels = zrResults.map(p => formatSnapshot(p));
      return NextResponse.json({ ok: true, mode: "phone", count: parcels.length, parcels });
    }

  } catch (err) {
    console.error("SUIVI_ZR_SEARCH_ERROR", err);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
