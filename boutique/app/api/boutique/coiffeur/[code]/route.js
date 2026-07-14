import { createServiceClient } from "@/lib/supabase";
import { computeCagnotteLive } from "@/lib/ambassadeur";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/boutique/coiffeur/[code]
 * Données de l'espace coiffeur (le lien = la clé, pas de login).
 *
 * ⚠️ RÈGLES D'AFFICHAGE (non négociables) :
 *   - DA uniquement. JAMAIS de % ni de marge (= coût d'achat déguisé).
 *   - Numéros clients MASQUÉS (0770•••••9), jamais le nom complet ni le numéro entier.
 */

// Masque un numéro (9 derniers chiffres stockés) → 0XXX•••••X
function maskPhone(p) {
  const d = String(p || "").replace(/\D/g, "").slice(-9);
  if (d.length < 9) return "";
  return "0" + d.slice(0, 3) + "•••••" + d.slice(-1);
}

// Initiales à partir d'un nom (2 premières lettres des 2 premiers mots)
function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  const a = parts[0][0] || "";
  const b = parts[1] ? parts[1][0] : "";
  return (a + b).toUpperCase();
}

export async function GET(request, { params }) {
  try {
    const { code } = await params;
    const clean = String(code || "").trim().toUpperCase();
    if (!clean) {
      return NextResponse.json({ error: "Code manquant" }, { status: 400 });
    }

    const sb = createServiceClient();

    // 1) L'ambassadeur (le lien = la clé)
    const { data: amb } = await sb
      .from("nc_ambassadeurs")
      .select("code, phone, full_name, total_filleuls, actif")
      .ilike("code", clean)
      .maybeSingle();

    if (!amb || !amb.actif) {
      return NextResponse.json({ error: "Espace introuvable" }, { status: 404 });
    }

    // 2) Cagnotte + statuts calculés EN DIRECT depuis le statut réel des commandes
    //    (source de vérité = la commande : livrée→validée, annulée→annulée).
    const { dispo, attente, total_gagne, total_depense, commissions } = await computeCagnotteLive(sb, amb.phone);
    const list = commissions.slice(0, 30);

    // 3) Noms clients (pour initiales) via les commandes liées
    const orderIds = [...new Set(list.map((c) => c.order_id).filter(Boolean))];
    const nameByOrder = {};
    if (orderIds.length > 0) {
      const { data: orders } = await sb
        .from("nc_orders")
        .select("order_id, customer_name, full_name")
        .in("order_id", orderIds);
      for (const o of orders || []) {
        nameByOrder[o.order_id] = o.customer_name || o.full_name || "";
      }
    }

    // 4) Stat « ce mois » (somme des commissions créées ce mois-ci)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const thisMonthDa = list.reduce((s, c) => {
      const t = c.created_at ? new Date(c.created_at).getTime() : 0;
      return t >= monthStart ? s + (Number(c.montant_da) || 0) : s;
    }, 0);

    // 5) Historique formaté — nom complet OK (le garde-fou = le numéro masqué).
    //    statut = live_status (dérivé du statut réel de la commande, temps réel).
    const history = list.map((c) => ({
      client_name: nameByOrder[c.order_id] || "",
      initials:    initials(nameByOrder[c.order_id]),
      phone_masked: maskPhone(c.filleul_phone),
      montant_da: Number(c.montant_da) || 0,
      statut:    c.live_status || "en_attente",
      date:      c.created_at,
    }));

    const firstName = (amb.full_name || "").trim().split(/\s+/)[0] || "";

    return NextResponse.json({
      code: amb.code,
      first_name: firstName,
      full_name: amb.full_name || "",
      cagnotte_da: dispo,                 // disponible = utilisable maintenant (livré − dépensé)
      cagnotte_attente_da: attente,       // en attente = commandes pas encore livrées
      total_gagne_da: total_gagne,        // gagné à vie (tout ce qui a été validé)
      total_depense_da: total_depense,    // dépensé à vie (crédit utilisé)
      total_clients: amb.total_filleuls || 0,
      total_commandes: list.length,
      ce_mois_da: thisMonthDa,
      history,
    });
  } catch (err) {
    console.error("[coiffeur GET] Error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
