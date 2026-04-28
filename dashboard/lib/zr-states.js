// ═══════════════════════════════════════════════════════════════════
//  lib/zr-states.js — Mapping complet des états ZR Express
//  Source : POST /parcels/search confirmé en production (T210b)
//
//  ZR utilise des noms en snake_case français/anglais.
//  États confirmés depuis l'API ZR de NajmCoiff (Avril 2026)
// ═══════════════════════════════════════════════════════════════════

// État ZR → { label affiché, shipping_status nc_orders, final (si terminal) }
export const ZR_STATES = {
  // ── États de création / réception ────────────────────────────
  "created":               { label: "Créé",                  shipping: "expédié"             },
  "commande_recue":        { label: "Commande reçue",         shipping: "expédié"             },
  "pret_a_expedier":       { label: "Prêt à expédier",        shipping: "expédié"             },
  "assigned":              { label: "Assigné",               shipping: "expédié"             },

  // ── Collecte / Enlèvement ────────────────────────────────────
  "picked_up":             { label: "Collecté",              shipping: "collecté"            },
  "collecte":              { label: "Collecté",              shipping: "collecté"            },
  "collecté":              { label: "Collecté",              shipping: "collecté"            },

  // ── Transit ──────────────────────────────────────────────────
  "in_transit":            { label: "En transit",            shipping: "en transit"          },
  "en_cours":              { label: "En transit",            shipping: "en transit"          },
  "vers_wilaya":           { label: "Vers wilaya",           shipping: "en transit"          },

  // ── Livraison ─────────────────────────────────────────────────
  "out_for_delivery":      { label: "En livraison",          shipping: "en livraison"        },
  "en_livraison":          { label: "En livraison",          shipping: "en livraison"        },
  "sortie_en_livraison":   { label: "En livraison",          shipping: "en livraison"        },
  "confirme_au_bureau":    { label: "Au bureau",             shipping: "en livraison"        },

  // ── Livré (états terminaux) ───────────────────────────────────
  "delivered":             { label: "Livré",                 shipping: "livré",              final: "livré" },
  "livre":                 { label: "Livré",                 shipping: "livré",              final: "livré" },
  "livré":                 { label: "Livré",                 shipping: "livré",              final: "livré" },
  "encaisse":              { label: "Encaissé",              shipping: "livré",              final: "livré" },  // ZR a collecté le cash COD auprès du client
  "recouvert":             { label: "Recouvert",             shipping: "livré",              final: "livré" },  // Vendeur a récupéré son argent — clôture financière finale

  // ── Échec livraison ───────────────────────────────────────────
  "failed_delivery":       { label: "Tentative échouée",     shipping: "tentative échouée"   },
  "echec_livraison":       { label: "Tentative échouée",     shipping: "tentative échouée"   },

  // ── Retour (état terminal) ────────────────────────────────────
  "returned":              { label: "Retourné",              shipping: "retourné",           final: "retourné" },
  "retour":                { label: "Retourné",              shipping: "retourné",           final: "retourné" },
  "retourné":              { label: "Retourné",              shipping: "retourné",           final: "retourné" },
  "recupere_par_fournisseur": { label: "Retourné fournisseur", shipping: "retourné",          final: "retourné" },

  // ── Annulé (état terminal) ────────────────────────────────────
  "cancelled":             { label: "Annulé",                shipping: "annulé",             final: "annulé" },
  "annule":                { label: "Annulé",                shipping: "annulé",             final: "annulé" },
  "annulé":                { label: "Annulé",                shipping: "annulé",             final: "annulé" },
};

/**
 * Extrait le stateName depuis le payload ZR (state peut être objet ou string)
 * ZR envoie state comme { id, name, description } ou parfois string directement
 */
export function extractZRStateName(stateField) {
  if (typeof stateField === "object" && stateField !== null) {
    return String(stateField.name || stateField.description || "").toLowerCase().trim();
  }
  return String(stateField || "").toLowerCase().trim();
}

/**
 * Mappe un état ZR → { stateName, label, shipping, final }
 */
export function mapZRState(stateField) {
  const stateName = extractZRStateName(stateField);
  const mapped    = ZR_STATES[stateName] || {};
  return {
    stateName,
    label:    mapped.label    || stateName || "Inconnu",
    shipping: mapped.shipping || null,
    final:    mapped.final    || null,
  };
}
