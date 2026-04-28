// ═══════════════════════════════════════════════════════════════════
//  lib/zr-express.js — Client ZR Express API v1 (server-side)
//  Portage de 📦 ZR EXPRESS API.js (GAS)
//  Utilisé par : /api/inject/single, /api/inject/batch, /api/webhooks/zr
// ═══════════════════════════════════════════════════════════════════

export const ZR_BASE      = "https://api.zrexpress.app/api/v1";
export const ZR_HUB_ID    = "774f0116-43a5-4dc5-a878-11b8b4eb1380"; // Alger Birkhadem

// ── Headers ZR ─────────────────────────────────────────────────
export function zrHeaders() {
  return {
    "X-API-KEY":      process.env.ZR_API_KEY    || "",
    "X-Tenant":       process.env.ZR_TENANT_ID  || "",
    "Content-Type":   "application/json",
  };
}

// ── Normalisation nom wilaya/commune pour ZR (supprime les diacritiques) ──
// "Boumerdès" → "Boumerdes", "Bordj Menaïel" → "Bordj Menael"
function normalizeGeoName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// ── Recherche territoire (wilaya/commune → UUID) ─────────────
export async function zrSearchTerritory(keyword, level = "city") {
  if (!keyword) return null;
  const normalizedKeyword = normalizeGeoName(keyword);
  try {
    const res = await fetch(`${ZR_BASE}/territories/search`, {
      method: "POST",
      headers: zrHeaders(),
      body: JSON.stringify({ keyword: normalizedKeyword, pageSize: 10, pageNumber: 1 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.items || [];
    const filtered = level ? items.filter(t => t.level === level) : items;
    // Chercher d'abord une correspondance exacte (normalisée), sinon prendre le premier résultat
    const exact = filtered.find(
      t => normalizeGeoName(t.name).toLowerCase() === normalizedKeyword.toLowerCase()
    );
    return exact || filtered[0] || null;
  } catch { return null; }
}

// ── Trouver le hub ZR pour une wilaya (commandes bureau/stopdesk) ──
// Cherche dans /hubs/search le hub dont cityTerritoryId correspond à la wilaya
// Cache en mémoire (réutilisé pour le même processus Vercel)
let _hubsCache = null;
async function _getAllHubs() {
  if (_hubsCache) return _hubsCache;
  try {
    const res = await fetch(`${ZR_BASE}/hubs/search`, {
      method: "POST",
      headers: zrHeaders(),
      body: JSON.stringify({ name: "", pageSize: 200, pageNumber: 1 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    _hubsCache = data?.items || [];
    return _hubsCache;
  } catch { return []; }
}

export async function zrFindHubForWilaya(wilayaName, cityTerritoryId) {
  const hubs = await _getAllHubs();
  if (!hubs.length) return null;
  // Priorité 1 : match exact par cityTerritoryId (le plus fiable)
  const byTerritory = hubs.find(h => h.address?.cityTerritoryId === cityTerritoryId && h.isPickupPoint);
  if (byTerritory) return byTerritory;
  // Priorité 2 : match par nom de ville normalisé (fallback)
  const normalizedWilaya = normalizeGeoName(wilayaName).toLowerCase();
  return hubs.find(
    h => h.isPickupPoint && normalizeGeoName(h.address?.city || "").toLowerCase() === normalizedWilaya
  ) || null;
}

// ── Récupérer tracking depuis UUID parcel ─────────────────────
export async function zrGetTracking(parcelId) {
  try {
    const res = await fetch(`${ZR_BASE}/parcels/${parcelId}`, {
      headers: zrHeaders(),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data?.trackingNumber || "";
  } catch { return ""; }
}

import { mapZRState } from "@/lib/zr-states";

function _extractStateLabel(stateObj) {
  const { stateName, label } = mapZRState(stateObj);
  return { stateName, stateLabel: label };
}

// ── Récupérer statut actuel d'un colis depuis ZR API ──────────
// ⚠️ ZR ne supporte PAS GET /parcels/tracking/{n} — seul POST /parcels/search marche
// Stratégie :
//   1. GET /parcels/{parcelId} si parcelId UUID connu
//   2. Sinon : POST /parcels/search page 1 → chercher trackingNumber dans les résultats
// Retourne : { ok, stateName, stateLabel, attempts, parcelId, raw }
export async function zrGetParcelStatus(parcelId, trackingNumber) {
  try {
    let data = null;

    // Méthode 1 : GET /parcels/{uuid} — le plus fiable si on a le UUID
    if (parcelId) {
      const res = await fetch(`${ZR_BASE}/parcels/${parcelId}`, { headers: zrHeaders() });
      if (res.ok) data = await res.json().catch(() => null);
    }

    // Méthode 2 : POST /parcels/search page 1 — chercher par trackingNumber
    if (!data && trackingNumber) {
      const trackUpper = String(trackingNumber).trim().toUpperCase();
      // On cherche dans la première page uniquement pour inject immédiat (colis récent = page 1)
      const searchRes = await fetch(`${ZR_BASE}/parcels/search`, {
        method:  "POST",
        headers: zrHeaders(),
        body:    JSON.stringify({ pageNumber: 1, pageSize: 50 }),
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json().catch(() => null);
        const match = searchData?.items?.find(
          p => String(p.trackingNumber || "").trim().toUpperCase() === trackUpper
        );
        if (match) data = match;
      }
    }

    if (!data) return { ok: false, error: "Colis non trouvé dans ZR API" };

    const { stateName, stateLabel } = _extractStateLabel(data.state || data.status);
    const attempts  = Number(data?.failedDeliveriesCount || data?.attempts || 0);
    const pid       = data?.id || parcelId || "";

    return { ok: true, stateName, stateLabel, attempts, parcelId: pid, raw: data };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

// ── Helper : appel API ZR pour créer un colis (payload déjà construit) ──
async function _zrPostParcel(payload) {
  const res  = await fetch(`${ZR_BASE}/parcels`, {
    method: "POST",
    headers: zrHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// ── Créer un colis ZR ─────────────────────────────────────────
// Stratégie district (commune) :
//   1. Chercher la commune dans ZR
//   2. Vérifier que le parentId correspond bien à la wilaya (évite DistrictDoesNotBelongToCity)
//   3. Si invalide ou introuvable → utiliser le wilayaTerritory.id comme fallback
export async function zrCreateParcel(orderData) {
  const t0 = Date.now();

  const wilayaTerritory  = await zrSearchTerritory(orderData.wilaya, "wilaya");
  if (!wilayaTerritory) {
    return { ok: false, error: `Wilaya introuvable: ${orderData.wilaya}` };
  }

  // Recherche commune — stratégie en cascade :
  // 1. Chercher par nom de commune exact
  // 2. Si pas trouvé → chercher une commune du même nom que la wilaya (ex: "Skikda" commune sous wilaya Skikda)
  // 3. Si introuvable → utiliser wilayaTerritory.id comme fallback (mais ZR peut rejeter)
  let communeTerritory = await zrSearchTerritory(orderData.commune, "commune");
  if (!communeTerritory && orderData.commune !== orderData.wilaya) {
    communeTerritory = await zrSearchTerritory(orderData.wilaya, "commune");
  }
  // Valider que la commune appartient bien à la wilaya (parentId doit correspondre)
  const validCommune = communeTerritory && (
    !communeTerritory.parentId || communeTerritory.parentId === wilayaTerritory.id
  );
  const districtId = validCommune ? communeTerritory.id : wilayaTerritory.id;

  const phone = String(orderData.customer_phone || "").replace(/[^0-9+]/g, "");
  const phoneIntl = phone.startsWith("+") ? phone : phone.replace(/^0/, "+213");
  const productId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

  const isPickupPoint = /pickup|stopdesk|pickpoint|bureau|office/i.test(
    orderData.shopify_delivery_mode || orderData.delivery_mode || orderData.delivery_type || ""
  );

  // Pour bureau : trouver le hub ZR du wilaya client (pas le hub fournisseur Birkhadem)
  let hubId = ZR_HUB_ID; // Alger Birkhadem = hub fournisseur (toujours pour home)
  if (isPickupPoint) {
    const clientHub = await zrFindHubForWilaya(orderData.wilaya, wilayaTerritory.id);
    if (clientHub) {
      hubId = clientHub.id;
      console.log(`ZR_HUB pickup-point: ${clientHub.address?.city} (${clientHub.name}) → ${hubId}`);
    } else {
      console.warn(`ZR_HUB pickup-point: aucun hub trouvé pour ${orderData.wilaya} → fallback Birkhadem`);
    }
  }

  const buildPayload = (districtTerritoryId) => ({
    customer: {
      customerId: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      name:  String(orderData.customer_name || "Client"),
      phone: { number1: phoneIntl, number2: "", number3: "" },
    },
    deliveryAddress: {
      cityTerritoryId:     wilayaTerritory.id,
      districtTerritoryId,
      street: String(orderData.adresse || orderData.commune || ""),
    },
    orderedProducts: [{
      productId,
      productName: String(orderData.order_items_summary || "Commande #" + orderData.order_id)
        .replace(/[|<>]/g, "-").slice(0, 200),
      productSku:  "CMD-" + orderData.order_id,
      unitPrice:   Number(orderData.order_total || 0),
      quantity:    1,
      stockType:   "local",
    }],
    hubId,
    deliveryType: isPickupPoint ? "pickup-point" : "home",
    description:  "Commande #" + orderData.order_id,
    amount:       Number(orderData.order_total || 0),
    externalId:   String(orderData.order_id),
  });

  try {
    // Tentative 1 : avec le districtId calculé (commune ou wilaya fallback)
    let { status, body } = await _zrPostParcel(buildPayload(districtId));

    // Tentative 2 : si ZR rejette DistrictDoesNotBelongToCity → retry avec la commune "wilaya" comme district
    // (cas : districtId=communeUUID invalide ou districtId=wilayaUUID refusé)
    if (status === 400 && String(JSON.stringify(body)).includes("DistrictDoesNotBelongToCity")) {
      // Chercher une commune de repli avec le nom de la wilaya (garantit parentId valide)
      const fallbackCommune = await zrSearchTerritory(orderData.wilaya, "commune");
      const fallbackDistrictId = (fallbackCommune && fallbackCommune.parentId === wilayaTerritory.id)
        ? fallbackCommune.id
        : null;
      if (fallbackDistrictId && fallbackDistrictId !== districtId) {
        console.warn(`ZR_CREATE_PARCEL retry avec commune-wilaya (${orderData.wilaya}) order=${orderData.order_id}`);
        ({ status, body } = await _zrPostParcel(buildPayload(fallbackDistrictId)));
      }
    }

    if ((status === 200 || status === 201) && body.id) {
      const tracking = await zrGetTracking(body.id);
      console.log(`ZR_CREATE_PARCEL OK id=${body.id} tracking=${tracking} ${Date.now() - t0}ms`);
      return { ok: true, parcel_id: body.id, tracking };
    }

    const errMsg = status === 403
      ? "HTTP 403 — SupplierAdminRole requis (contacter ZR support)"
      : `HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`;
    return { ok: false, error: errMsg };

  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

// ── Enregistrer endpoint webhook ZR (Svix) ───────────────────
export async function zrRegisterWebhook(url) {
  try {
    const res = await fetch(`${ZR_BASE}/webhooks/endpoints`, {
      method: "POST",
      headers: zrHeaders(),
      body: JSON.stringify({ url, description: "NajmCoiff Vercel Webhook" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${JSON.stringify(body)}` };
    return { ok: true, endpoint_id: body.id, signing_secret: body.signingSecret || body.secret || "" };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

// ── Lister endpoints webhook ZR ─────────────────────────────
export async function zrListWebhooks() {
  try {
    const res = await fetch(`${ZR_BASE}/webhooks/endpoints`, { headers: zrHeaders() });
    const body = await res.json().catch(() => ({}));
    return body;
  } catch (err) {
    return { error: String(err.message || err) };
  }
}
