"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

// ── Constantes ───────────────────────────────────────────────────────────────
const PLATFORMS = { meta: { label: "Meta Ads", color: "bg-blue-100 text-blue-700", icon: "📘" }, whatsapp: { label: "WhatsApp", color: "bg-green-100 text-green-700", icon: "💬" }, both: { label: "Meta + WA", color: "bg-purple-100 text-purple-700", icon: "🔗" } };
const STATUSES  = {
  draft:     { label: "Brouillon",  color: "bg-gray-100 text-gray-600",    dot: "bg-gray-400" },
  scheduled: { label: "Planifiée", color: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-400" },
  active:    { label: "Active",    color: "bg-green-100 text-green-700",   dot: "bg-green-500 animate-pulse" },
  paused:    { label: "Pausée",    color: "bg-orange-100 text-orange-700", dot: "bg-orange-400" },
  done:      { label: "Terminée", color: "bg-blue-100 text-blue-600",     dot: "bg-blue-400" },
};
const STATUS_ORDER = ["draft", "scheduled", "active", "paused", "done"];
const WORLDS = { all: "Tous", coiffure: "💇 Coiffure", onglerie: "💅 Onglerie" };

function fmt(n) { return Number(n || 0).toLocaleString("fr-DZ"); }
function fmtDate(d) { if (!d) return "—"; return new Date(d).toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", year: "2-digit" }); }

// ── Workflow marketing complet ───────────────────────────────────────────────
const WORKFLOW_STEPS = [
  {
    id: "W1", phase: "ACQUISITION", color: "blue",
    title: "Nouveaux clients — Meta Ads prospection",
    icon: "🎯",
    platform: "Meta Ads",
    trigger: "Manuel (Owner) ou Agent 2 automatique",
    audiences: ["Lookalike 1% DZ (120245471392660520)", "Centres d'intérêt : coiffure, beauté, soins"],
    creative: "Image produit catalogue nc_variants + texte arabe généré par Agent 4",
    objective: "CONVERSIONS → Achat sur www.najmcoiff.com",
    budget: "À définir par l'owner (test : 500–1000 DA/jour)",
    kpis: ["CPO (coût par commande) < 500 DA", "ROAS > 2x", "CTR > 1.5%"],
    agents: ["Agent 2 (Meta Campaigns)", "Agent 4 (Contenu)"],
    tables: ["nc_campaign_plans", "nc_ai_campaigns", "nc_page_events (UTM)"],
  },
  {
    id: "W2", phase: "RETARGETING", color: "orange",
    title: "Visiteurs site non-acheteurs — Retargeting pixel",
    icon: "🔁",
    platform: "Meta Ads",
    trigger: "Automatique : Agent 2 cron quotidien",
    audiences: [
      "Coiffure 7j (120245471426530520)", "Coiffure 30j (120245471426750520)",
      "Onglerie 7j  (120245471426950520)", "Onglerie 30j (120245471427000520)",
    ],
    creative: "Catalogue dynamique (Meta Dynamic Ads) — produits vus par l'utilisateur",
    objective: "CATALOG_SALES → produit spécifique vu",
    budget: "200–500 DA/jour par audience",
    kpis: ["CPO < 300 DA", "ROAS > 3x", "Taux conversion retargeting > 2%"],
    agents: ["Agent 2 (Meta Campaigns)"],
    tables: ["nc_campaign_plans", "nc_ai_campaigns"],
  },
  {
    id: "W3", phase: "ABANDON PANIER", color: "red",
    title: "Paniers abandonnés — WhatsApp J+2h",
    icon: "🛒",
    platform: "WhatsApp (WATI)",
    trigger: "Automatique : Agent 3 cron toutes les 2h",
    template: "najm_cart_v2 (waTemplateId: 1467869854789450) — PENDING",
    condition: "CHECKOUT_START sans ORDER_PLACED dans les 2-4h",
    message: "سلام {{prénom}} 👋\nالمنتجات لي حطيتهم مازالو في السلة...",
    budget: "Inclus dans abonnement WATI",
    kpis: ["Taux récupération abandon > 5%", "CA récupéré par message"],
    agents: ["Agent 3 (WhatsApp Reactivation)"],
    tables: ["nc_page_events", "nc_ai_whatsapp_queue"],
  },
  {
    id: "W4", phase: "RÉACTIVATION", color: "yellow",
    title: "Clients inactifs 30j — Relance WhatsApp",
    icon: "⚡",
    platform: "WhatsApp (WATI)",
    trigger: "Automatique : Agent 3 cron quotidien 10h",
    template: "najm_react30_v2 (waTemplateId: 1657564345575982) — PENDING",
    condition: "Dernière commande il y a 30-60 jours, pas de commande récente",
    message: "سلام {{prénom}} 👋\nرجعنا بعرض قوي 💪\nتخفيضات على كامل الموقع\nكود: REACT30...",
    budget: "Inclus dans abonnement WATI",
    kpis: ["Taux réactivation > 8%", "Coût par réactivation", "CA généré"],
    agents: ["Agent 3 (WhatsApp Reactivation)"],
    tables: ["nc_orders", "nc_ai_whatsapp_queue", "nc_partenaires (REACT30)"],
  },
  {
    id: "W5", phase: "RÉACTIVATION", color: "yellow",
    title: "Clients inactifs 60j — Relance forte WhatsApp",
    icon: "🔥",
    platform: "WhatsApp (WATI)",
    trigger: "Automatique : Agent 3 cron quotidien 10h",
    template: "najm_react60_v2 (waTemplateId: 955608527374472) — PENDING",
    condition: "Dernière commande il y a 60-120 jours",
    message: "سلام {{prénom}} 👋\nرجعنا بعرض قوي 💪\nتخفيضات على كامل الموقع\nكود: REACT60...",
    budget: "Inclus dans abonnement WATI",
    kpis: ["Taux réactivation > 4%", "CA généré par envoi"],
    agents: ["Agent 3 (WhatsApp Reactivation)"],
    tables: ["nc_orders", "nc_ai_whatsapp_queue", "nc_partenaires (REACT60)"],
  },
  {
    id: "W6", phase: "POST-COMMANDE", color: "teal",
    title: "Confirmation expédition — WhatsApp J+0",
    icon: "🚚",
    platform: "WhatsApp (WATI)",
    trigger: "Automatique : webhook ZR Express (injection) ou Agent 3",
    template: "najm_order_v2 (waTemplateId: 968304442329443) — PENDING",
    message: "سلام {{prénom}} 👋\nطلبيتك رقم {{order}} راهي في الطريق 🚚\nتتبعها: www.najmcoiff.com/suivi/{{id}}",
    kpis: ["Taux lecture > 80%", "Réduction appels client -30%"],
    agents: ["Agent 3 (WhatsApp)"],
    tables: ["nc_orders", "nc_suivi_zr", "nc_ai_whatsapp_queue"],
  },
  {
    id: "W7", phase: "POST-LIVRAISON", color: "teal",
    title: "Satisfaction post-livraison — WhatsApp J+3",
    icon: "📦",
    platform: "WhatsApp (WATI)",
    trigger: "Automatique : Agent 3 cron (statut = livré)",
    template: "najm_delivery_v2 (waTemplateId: 961947683463668) — PENDING",
    message: "سلام {{prénom}} 📦\nوصلتلك طلبيتك؟ كلش مليح؟\n⭐ راضي | ❌ كاين مشكل",
    kpis: ["Taux réponse > 20%", "Score satisfaction", "Détection problèmes"],
    agents: ["Agent 3 (WhatsApp)"],
    tables: ["nc_orders", "nc_ai_whatsapp_queue"],
  },
  {
    id: "W8", phase: "VIP", color: "purple",
    title: "Offre exclusive clients VIP — WhatsApp mensuel",
    icon: "👑",
    platform: "WhatsApp (WATI)",
    trigger: "Manuel (Owner) via War Room ou Agent 3 mensuel",
    template: "najm_vip_v2 (waTemplateId: 1517215279934806) — PENDING",
    condition: "Clients avec 3+ commandes ou CA > 5000 DA",
    message: "سلام {{prénom}} 👑\nأنت من زبائننا VIP\nكود: VIPGOLDEN للتخفيضات 48h...",
    kpis: ["Taux conversion VIP > 15%", "CA par envoi VIP"],
    agents: ["Agent 3 (WhatsApp)"],
    tables: ["nc_orders", "nc_ai_whatsapp_queue", "nc_partenaires (VIPGOLDEN)"],
  },
  {
    id: "W9", phase: "INTELLIGENCE", color: "gray",
    title: "Scoring catalogue — Agent 1 quotidien",
    icon: "🤖",
    platform: "Interne",
    trigger: "Cron automatique quotidien 6h",
    description: "Analyse tous les produits nc_variants. Calcule health_score (stock × ventes × marge). Met à jour sort_order. Remonte les produits qui se vendent bien. Alerte si stock critique.",
    tables: ["nc_variants", "nc_ai_product_scores", "nc_orders"],
    agents: ["Agent 1 (Catalog Intelligence)"],
    kpis: ["Score moyen catalogue", "Produits en alerte stock", "Top 10 performers"],
  },
];

const PHASE_COLORS = {
  ACQUISITION:    "border-blue-400 bg-blue-50",
  RETARGETING:    "border-orange-400 bg-orange-50",
  "ABANDON PANIER": "border-red-400 bg-red-50",
  RÉACTIVATION:   "border-yellow-400 bg-yellow-50",
  "POST-COMMANDE":"border-teal-400 bg-teal-50",
  "POST-LIVRAISON":"border-teal-400 bg-teal-50",
  VIP:            "border-purple-400 bg-purple-50",
  INTELLIGENCE:   "border-gray-400 bg-gray-50",
};

// ── KPIs réels Supabase (calculés une fois) ──────────────────────────────────
// Panier moyen boutique : 8130 DA | Marge coiffure : 35.2% | Marge onglerie : 25.5%
// Stock coiffure : 1115/2576 | Stock onglerie : 760/1247
// Taux EUR/DA marché noir : 290 DA = 1 EUR
const KPI_CONSTANTS = {
  panier_moyen_da: 8130,
  marge_coiffure_pct: 35.2,
  marge_onglerie_pct: 25.5,
  marge_globale_pct: 32,
  profit_par_commande_coiffure: Math.round(8130 * 0.352),   // ~2862 DA
  profit_par_commande_onglerie: Math.round(8130 * 0.255),   // ~2073 DA
  eur_to_da: 290,                                            // marché noir
  usd_to_da: 268,                                            // ~290/1.08
  budget_depart_eur: 15,
  budget_depart_da: 15 * 290,                                // 4350 DA/jour
  budget_max_da: Math.round(100 * 268),                      // ~26800 DA (~100 USD)
  cpo_max_coiffure: Math.round(8130 * 0.352 / 2),           // ~1431 DA
  cpo_max_onglerie: Math.round(8130 * 0.255 / 2),           // ~1036 DA
};

const CONFIDENCE_CONFIG = {
  high:   { label: "Confiance élevée",  color: "bg-green-100 text-green-700",   icon: "🟢" },
  medium: { label: "Confiance moyenne", color: "bg-yellow-100 text-yellow-700", icon: "🟡" },
  low:    { label: "Confiance faible",  color: "bg-red-100 text-red-600",       icon: "🔴" },
};

// ── Composant principal ──────────────────────────────────────────────────────
export default function MarketingWarRoom() {
  const router = useRouter();
  const [tab, setTab]             = useState("performance");
  const [data, setData]           = useState(null);
  const [recs, setRecs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [recsLoading, setRecsLoading] = useState(true);
  const [token, setToken]         = useState("");
  const [creating, setCreating]   = useState(false);
  const [newCamp, setNewCamp]     = useState({ title: "", platform: "meta", world: "all", campaign_type: "", budget_da: "", ai_reasoning: "" });
  const [expandedStep, setExpandedStep] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [actioning, setActioning] = useState({});
  const [perfData, setPerfData]   = useState(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [syncing, setSyncing]     = useState(false);

  // ── WhatsApp Campaign Manager ──
  const [waData, setWaData]       = useState(null);
  const [waLoading, setWaLoading] = useState(false);
  const [waForm, setWaForm]       = useState({ segment: "", template_name: "", daily_limit: 50, name: "", schedule_now: true });
  const [waLaunching, setWaLaunching] = useState(false);
  const [waResult, setWaResult]   = useState(null);

  const load = useCallback(async (tk) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/marketing/campaigns?token=${tk}`);
      const d = await r.json();
      setData(d);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const loadPerf = useCallback(async (tk) => {
    setPerfLoading(true);
    try {
      const r = await fetch(`/api/marketing/sync-stats?token=${tk}`);
      const d = await r.json();
      setPerfData(d);
    } catch { /* ignore */ }
    setPerfLoading(false);
  }, []);

  const loadWa = useCallback(async (tk) => {
    setWaLoading(true);
    try {
      const r = await fetch(`/api/marketing/whatsapp-campaigns?token=${tk}`);
      const d = await r.json();
      setWaData(d);
    } catch { /* ignore */ }
    setWaLoading(false);
  }, []);

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await fetch(`/api/marketing/sync-stats?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const d = await r.json();
      if (!d.ok) console.error("sync-stats error:", d);
      await loadPerf(token);
    } catch (e) { console.error("syncNow error:", e); }
    setSyncing(false);
  }

  const loadRecs = useCallback(async (tk) => {
    setRecsLoading(true);
    try {
      const r = await fetch(`/api/marketing/recommendations?token=${tk}`);
      const d = await r.json();
      setRecs(d.recommendations || []);
    } catch { /* ignore */ }
    setRecsLoading(false);
  }, []);

  useEffect(() => {
    const s = getSession();
    if (!s?.token) { router.replace("/"); return; }
    setToken(s.token);
    load(s.token);
    loadRecs(s.token);
    loadPerf(s.token);
    loadWa(s.token);

    // Auto-refresh toutes les 5 minutes
    const interval = setInterval(() => {
      loadPerf(s.token);
      loadWa(s.token);
      loadRecs(s.token);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [router, load, loadRecs, loadPerf, loadWa]);

  async function handleRec(id, action, note = "") {
    setActioning(a => ({ ...a, [id]: action }));
    await fetch("/api/marketing/recommendations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, id, action, owner_note: note }),
    });
    setActioning(a => ({ ...a, [id]: null }));
    loadRecs(token);
  }

  async function updateStatus(id, status) {
    await fetch("/api/marketing/campaigns", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, id, status }),
    });
    load(token);
  }

  async function deleteCampaign(id) {
    if (!confirm("Supprimer cette campagne ?")) return;
    await fetch("/api/marketing/campaigns", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, id }),
    });
    load(token);
  }

  async function createCampaign(e) {
    e.preventDefault();
    setCreating(true);
    await fetch("/api/marketing/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...newCamp, budget_da: Number(newCamp.budget_da) || 0, created_by_ai: false, approved_by_owner: true }),
    });
    setNewCamp({ title: "", platform: "meta", world: "all", campaign_type: "", budget_da: "", ai_reasoning: "" });
    setCreating(false);
    load(token);
  }

  const campaigns = data?.campaigns || [];
  const aiLog     = data?.aiLog     || [];
  const kpis      = data?.kpis      || {};
  const audiences = data?.audiences || [];

  // KPIs WhatsApp globaux (depuis waData)
  const waGlobalKpis = waData?.globalKpis || { total_sent: 0, total_failed: 0, total_revenue: 0, total_cost: 0 };
  const waSegments   = waData?.segments   || {};
  const totalWaContacts = Object.values(waSegments).reduce((s, seg) => s + (seg.total || 0), 0);

  const filtered  = filterStatus === "all" ? campaigns : campaigns.filter(c => c.status === filterStatus);
  const pendingRecs = recs.filter(r => r.status === "pending" && !r.expired);
  const acceptedRecs = recs.filter(r => r.status === "accepted");
  const refusedRecs  = recs.filter(r => r.status === "refused");

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🎯 War Room Marketing</h1>
          <p className="text-sm text-gray-500 mt-0.5">Chambre de pilotage — campagnes Meta Ads + WhatsApp WATI</p>
        </div>
        <button
          onClick={() => { load(token); loadRecs(token); }}
          className="text-sm bg-gray-900 text-white px-4 py-2 rounded-xl hover:bg-gray-700 transition self-start sm:self-auto"
        >
          ↻ Actualiser
        </button>
      </div>

      {/* ── Alerte recommandations en attente ── */}
      {pendingRecs.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-center gap-4">
          <span className="text-2xl shrink-0">🤖</span>
          <div className="flex-1">
            <p className="font-bold text-amber-900">{pendingRecs.length} recommandation{pendingRecs.length > 1 ? "s" : ""} en attente de validation</p>
            <p className="text-xs text-amber-700 mt-0.5">L'IA attend ton accord avant d'agir. Clique sur "Recommandations" pour valider.</p>
          </div>
          <button onClick={() => setTab("recommendations")} className="bg-amber-600 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-amber-700 transition shrink-0">
            Voir →
          </button>
        </div>
      )}

      {/* ── KPIs double bande : Meta + WhatsApp ── */}
      <div className="space-y-3">
        {/* Bande 1 : Meta Ads */}
        <div>
          <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Meta Ads
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Dépensé Meta",     value: `${fmt(perfData?.summary?.total_spend_da || 0)} DA`, icon: "💸", color: "text-red-600" },
              { label: "Achats Meta",       value: perfData?.summary?.total_conversions || 0, icon: "🛒", color: "text-blue-600" },
              { label: "ROAB Meta",         value: (perfData?.summary?.global_roab || 0) > 0 ? `${perfData.summary.global_roab}x` : "—", icon: "📈", color: (perfData?.summary?.global_roab || 0) >= 2 ? "text-green-600" : "text-orange-500" },
              { label: "Bénéfice net Meta", value: `${fmt(perfData?.summary?.total_profit_da || 0)} DA`, icon: "💎", color: (perfData?.summary?.total_profit_da || 0) >= 0 ? "text-green-600" : "text-red-600" },
            ].map(k => (
              <div key={k.label} className="bg-white border border-blue-100 rounded-2xl p-3 shadow-sm">
                <div className="text-xl mb-1">{k.icon}</div>
                <div className={`text-lg font-bold leading-none ${k.color}`}>{k.value}</div>
                <div className="text-xs text-gray-400 mt-1">{k.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bande 2 : WhatsApp */}
        <div>
          <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" /> WhatsApp WATI
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Msgs envoyés",      value: waGlobalKpis.total_sent.toLocaleString(), icon: "📤", color: "text-gray-900" },
              { label: "Msgs échoués",       value: waGlobalKpis.total_failed.toLocaleString(), icon: "❌", color: waGlobalKpis.total_failed > 0 ? "text-red-600" : "text-gray-400" },
              { label: "Coût total WA",      value: `${fmt(waGlobalKpis.total_cost)} DA`, icon: "💰", color: "text-orange-600" },
              { label: "Revenus attribués",  value: `${fmt(waGlobalKpis.total_revenue)} DA`, icon: "💵", color: waGlobalKpis.total_revenue > 0 ? "text-green-600" : "text-gray-400" },
            ].map(k => (
              <div key={k.label} className="bg-white border border-green-100 rounded-2xl p-3 shadow-sm">
                <div className="text-xl mb-1">{k.icon}</div>
                <div className={`text-lg font-bold leading-none ${k.color}`}>{k.value}</div>
                <div className="text-xs text-gray-400 mt-1">{k.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPIs catalogue (constantes réelles Supabase) ── */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        {[
          { label: "Marge coiffure", value: `${KPI_CONSTANTS.marge_coiffure_pct}%`, sub: `≈ ${fmt(KPI_CONSTANTS.profit_par_commande_coiffure)} DA/cmd` },
          { label: "Marge onglerie", value: `${KPI_CONSTANTS.marge_onglerie_pct}%`, sub: `≈ ${fmt(KPI_CONSTANTS.profit_par_commande_onglerie)} DA/cmd` },
          { label: "CPO max coiffure", value: `${fmt(KPI_CONSTANTS.cpo_max_coiffure)} DA`, sub: "50% de la marge" },
          { label: "CPO max onglerie", value: `${fmt(KPI_CONSTANTS.cpo_max_onglerie)} DA`, sub: "50% de la marge" },
        ].map(k => (
          <div key={k.label}>
            <p className="text-xs text-gray-500 font-medium">{k.label}</p>
            <p className="font-bold text-gray-900">{k.value}</p>
            <p className="text-[10px] text-gray-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {[
          { id: "performance", label: "📘 Campagnes Meta" },
          { id: "whatsapp",  label: "💬 WhatsApp Campagnes" },
          { id: "recommendations", label: `🤖 Recommandations${pendingRecs.length > 0 ? ` (${pendingRecs.length})` : ""}` },
          { id: "kanban",   label: "📋 Kanban" },
          { id: "journal",  label: "📖 Journal IA" },
          { id: "audiences",label: "🎯 Audiences" },
          { id: "workflow", label: "⚙️ Workflow" },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition -mb-px border-b-2
              ${tab === t.id ? "border-gray-900 text-gray-900 bg-white" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-gray-200 border-t-gray-900 rounded-full" />
        </div>
      )}

      {/* ══════════════════════ TAB CAMPAGNES META ══════════════════════ */}
      {tab === "performance" && (
        <div className="space-y-5">
          {/* Header + bouton sync */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold text-gray-900">📘 Campagnes Meta — Résultats Live</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {perfData?.summary?.last_synced
                  ? `Dernière sync : ${new Date(perfData.summary.last_synced).toLocaleString("fr-DZ")} · Auto-refresh toutes les 5 min`
                  : "Pas encore synchronisé — clique sur Sync pour voir les résultats"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">Auto ↻ 5 min</span>
              <button
                onClick={syncNow}
                disabled={syncing}
                className="flex items-center gap-2 bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
              >
                {syncing ? <span className="animate-spin inline-block">↻</span> : "↻"} {syncing ? "Sync..." : "Sync maintenant"}
              </button>
            </div>
          </div>

          {perfLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full" />
            </div>
          ) : (
            <>
              {/* KPIs globaux */}
              {perfData?.summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Dépensé total", value: `${fmt(perfData.summary.total_spend_da)} DA`, sub: `≈ ${(perfData.summary.total_spend_da / KPI_CONSTANTS.eur_to_da).toFixed(1)} EUR`, color: "text-red-600", icon: "💸" },
                    { label: "Bénéfice net", value: `${fmt(perfData.summary.total_profit_da)} DA`, sub: perfData.summary.total_profit_da > 0 ? "✅ Positif" : "⚠️ Négatif", color: perfData.summary.total_profit_da > 0 ? "text-green-600" : "text-red-600", icon: "💎" },
                    { label: "Achats Meta", value: perfData.summary.total_conversions, sub: `CPO moy : ${perfData.summary.total_conversions > 0 ? fmt(Math.round(perfData.summary.total_spend_da / perfData.summary.total_conversions)) : "—"} DA`, color: "text-blue-600", icon: "🛒" },
                    { label: "ROAB Global", value: perfData.summary.global_roab > 0 ? `${perfData.summary.global_roab}x` : "—", sub: perfData.summary.global_roab >= 2 ? "🟢 Rentable" : perfData.summary.global_roab > 0 ? "🟡 Marginal" : "⏳ En attente", color: perfData.summary.global_roab >= 2 ? "text-green-600" : "text-orange-600", icon: "📈" },
                  ].map(k => (
                    <div key={k.label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                      <div className="text-xl mb-1">{k.icon}</div>
                      <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
                      <div className="text-xs text-gray-500 mt-1">{k.label}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{k.sub}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Détail par campagne */}
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-700 text-sm">Détail par campagne</h3>
                {(perfData?.campaigns || []).map(c => {
                  const live = perfData?.liveStats?.find(l => l.campaign_id === c.meta_campaign_id);
                  const s7 = live?.last_7d;
                  return (
                    <div key={c.id} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div>
                          <p className="font-bold text-gray-900">{c.campaign_name}</p>
                          <div className="flex gap-2 mt-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.status === "active" ? "bg-green-100 text-green-700" : c.status === "pending_review" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"}`}>
                              {c.status === "active" ? "🟢 Active" : c.status === "pending_review" ? "⏳ En examen" : c.status}
                            </span>
                            <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                              {fmt(Math.round((c.budget_daily_da || 0) / KPI_CONSTANTS.eur_to_da * 100) / 100 * KPI_CONSTANTS.eur_to_da)} DA/jour
                            </span>
                          </div>
                        </div>
                        {(c.roab > 0) && (
                          <div className={`text-center px-3 py-2 rounded-xl ${c.roab >= 2 ? "bg-green-50 border border-green-200" : "bg-orange-50 border border-orange-200"}`}>
                            <div className={`text-xl font-black ${c.roab >= 2 ? "text-green-600" : "text-orange-600"}`}>{c.roab}x</div>
                            <div className="text-[10px] text-gray-500">ROAB</div>
                          </div>
                        )}
                      </div>

                      {/* Stats lifetime */}
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
                        {[
                          { label: "Impressions", value: fmt(c.impressions || 0) },
                          { label: "Clics", value: fmt(c.clicks || 0) },
                          { label: "CTR", value: c.ctr ? `${Number(c.ctr).toFixed(2)}%` : "—" },
                          { label: "Achats", value: c.conversions || 0 },
                          { label: "Dépensé", value: `${fmt(c.budget_spent_da || 0)} DA` },
                          { label: "Bénéfice", value: `${fmt(c.profit_da || 0)} DA` },
                        ].map(k => (
                          <div key={k.label} className="bg-gray-50 rounded-xl p-2 text-center">
                            <div className="font-bold text-gray-900 text-sm">{k.value}</div>
                            <div className="text-[10px] text-gray-400">{k.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Stats 7 derniers jours (live) */}
                      {s7 && (
                        <div className="border-t border-gray-100 pt-3">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">7 derniers jours (live Meta)</p>
                          <div className="grid grid-cols-4 gap-2">
                            {[
                              { label: "Dépensé", value: `${fmt(s7.spend_da)} DA`, sub: `${s7.spend_eur?.toFixed(2)} EUR` },
                              { label: "Clics", value: fmt(s7.clicks) },
                              { label: "Achats", value: s7.purchases },
                              { label: "ROAB 7j", value: s7.roab > 0 ? `${s7.roab}x` : "—", highlight: s7.roab >= 2 ? "green" : s7.roab > 0 ? "orange" : "gray" },
                            ].map(k => (
                              <div key={k.label} className={`rounded-xl p-2 text-center ${k.highlight === "green" ? "bg-green-50" : k.highlight === "orange" ? "bg-orange-50" : "bg-gray-50"}`}>
                                <div className={`font-bold text-sm ${k.highlight === "green" ? "text-green-700" : k.highlight === "orange" ? "text-orange-600" : "text-gray-900"}`}>{k.value}</div>
                                <div className="text-[10px] text-gray-400">{k.label}</div>
                                {k.sub && <div className="text-[9px] text-gray-300">{k.sub}</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Meta ID */}
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-[10px] text-gray-300 font-mono">Campaign ID: {c.meta_campaign_id} | AdSet: {c.meta_adset_id}</p>
                      </div>
                    </div>
                  );
                })}
                {(!perfData?.campaigns || perfData.campaigns.length === 0) && (
                  <div className="text-center py-12 text-gray-400">
                    <div className="text-4xl mb-3">📊</div>
                    <p className="text-sm">Aucune donnée encore.</p>
                    <p className="text-xs mt-1">Clique sur "Sync maintenant" pour récupérer les stats Meta.</p>
                  </div>
                )}
              </div>

              {/* Règle budget dynamique */}
              <div className="bg-gray-900 text-white rounded-2xl p-5">
                <p className="font-bold mb-3">⚙️ Règle budget dynamique (automatique)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {[
                    { icon: "🟢", label: "ROAB ≥ 2x", action: "Budget +20% (max 26 800 DA/j)", desc: "La pub rapporte — on dépense plus" },
                    { icon: "🟡", label: "ROAB 1x–2x", action: "Budget stable — observation 48h", desc: "On surveille avant d'agir" },
                    { icon: "🔴", label: "ROAB < 1x", action: "Budget -30% — alerte owner", desc: "La pub perd de l'argent" },
                  ].map(r => (
                    <div key={r.label} className="bg-white/10 rounded-xl p-3">
                      <p className="font-bold">{r.icon} {r.label}</p>
                      <p className="text-white/80 mt-1">{r.action}</p>
                      <p className="text-white/50 mt-1 text-[10px]">{r.desc}</p>
                    </div>
                  ))}
                </div>
                <p className="text-gray-400 text-[10px] mt-3">Sync auto quotidienne à 4h du matin · Rapport matinal à 8h · Budget max : 100 USD/j · 1 EUR = 290 DA</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════ TAB WHATSAPP CAMPAGNES ══════════════════════ */}
      {tab === "whatsapp" && (() => {
        const SEG_INFO = {
          dormant_30:  { label: "Inactifs 30-60j",  icon: "⚡", template: "najm_react30_v2", color: "#f59e0b", desc: "Clients qui n'ont pas commandé depuis 30 à 60 jours" },
          dormant_60:  { label: "Inactifs 60-90j",  icon: "🔥", template: "najm_react60_v2", color: "#ef4444", desc: "Clients qui n'ont pas commandé depuis 60 à 90 jours" },
          dormant_90:  { label: "Inactifs 90j+",    icon: "💤", template: "najm_react60_v2", color: "#6b7280", desc: "Clients inactifs depuis plus de 3 mois" },
          vip:         { label: "Clients VIP",       icon: "👑", template: "najm_vip_v2",    color: "#8b5cf6", desc: "5+ commandes ou plus de 50 000 DA dépensé" },
          active:      { label: "Actifs récents",   icon: "✅", template: null,              color: "#10b981", desc: "Commandé dans les 30 derniers jours — pas besoin de relancer" },
          cart_abandoned: { label: "Panier abandonné", icon: "🛒", template: "najm_cart_v2", color: "#3b82f6", desc: "Ont rempli le panier mais n'ont pas commandé" },
        };
        const TPL_INFO = {
          najm_react30_v2: { label: "Réactivation 30j",   msg: "سلام {{prénom}} 👋 رجعنا بعرض... كود REACT30", cost: 16 },
          najm_react60_v2: { label: "Réactivation 60j+",  msg: "سلام {{prénom}} 👋 واعر عليك...", cost: 16 },
          najm_vip_v2:     { label: "Offre VIP 👑",       msg: "سلام {{prénom}} 👑 أنت من زبائننا VIP...", cost: 16 },
          najm_cart_v2:    { label: "Panier abandonné 🛒", msg: "سلام {{prénom}} 👋 المنتجات مازالو في السلة...", cost: 16 },
        };
        const segments     = waData?.segments     || {};
        const campaigns    = (waData?.campaigns || []).filter(c => c.total_sent > 0 || c.status !== "draft");
        const tplStats     = waData?.templateStats || [];
        const inbox        = waData?.inbox         || [];
        const msgStats     = waData?.msgStats      || {};
        const globalKpis   = waData?.globalKpis    || {};
        const watiConnected = waData?.wati_connected;
        const watiError     = waData?.wati_error || null;
        const watiTokenBad  = watiError === "token_expired" || watiError === "credentials_missing" || watiError?.includes("401");

        async function launchCampaign(e) {
          e.preventDefault();
          if (!waForm.segment || !waForm.template_name) return;
          setWaLaunching(true);
          setWaResult(null);
          try {
            const r = await fetch("/api/marketing/whatsapp-campaigns", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-owner-token": token },
              body: JSON.stringify(waForm),
            });
            const d = await r.json();
            setWaResult(d);
            loadWa(token);
          } catch { /* ignore */ }
          setWaLaunching(false);
        }

        const totalAvailable = Object.entries(segments)
          .filter(([seg]) => seg !== "active")
          .reduce((s, [, v]) => s + (v.available || 0), 0);

        return (
          <div className="space-y-6">

            {/* ── Alerte : Token WATI invalide ou expiré ── */}
            {waData && watiTokenBad && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0">🔑</span>
                  <div className="flex-1">
                    <p className="font-bold text-amber-900 text-sm">Token WATI invalide — statistiques non synchronisées</p>
                    <p className="text-amber-700 text-xs mt-1">
                      Le token API WATI dans Vercel est expiré ou révoqué. C&apos;est pourquoi les stats Livrés, Lus et Échoués affichent 0.
                    </p>
                    <div className="mt-3 bg-white rounded-xl border border-amber-200 p-3">
                      <p className="text-xs font-bold text-gray-700 mb-2">Comment renouveler le token WATI :</p>
                      <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
                        <li>Aller sur <strong>https://app.wati.io</strong> → Se connecter</li>
                        <li>Menu <strong>Paramètres</strong> → <strong>API</strong></li>
                        <li>Cliquer <strong>&quot;Generate Access Token&quot;</strong> → Copier le token</li>
                        <li>Aller sur <strong>Vercel Dashboard</strong> → projet <em>najmcoiffdashboard</em></li>
                        <li>Settings → <strong>Environment Variables</strong> → modifier <code>WATI_API_TOKEN</code></li>
                        <li>Coller le nouveau token → Save → <strong>Redeploy</strong></li>
                        <li>Revenir ici et cliquer <strong>&quot;Sync statuts WATI&quot;</strong></li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Badge connexion WATI (si connecté) ── */}
            {waData && watiConnected === true && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-700 w-fit">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                WATI connecté — synchronisation active
              </div>
            )}

            {/* ── KPIs Envois 30j ── */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">📊 Statistiques WhatsApp — 30 derniers jours
                {watiTokenBad && <span className="ml-2 text-amber-500 font-normal normal-case">(stats locales uniquement — sync WATI inactive)</span>}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[
                  { label: "Envoyés",   value: msgStats.total     || 0, icon: "📤", color: "text-blue-600",   bg: "bg-blue-50" },
                  { label: "Livrés",    value: msgStats.delivered || 0, icon: "✅", color: "text-green-600",  bg: "bg-green-50" },
                  { label: "Lus",       value: msgStats.read      || 0, icon: "👁️", color: "text-indigo-600", bg: "bg-indigo-50" },
                  { label: "Réponses",  value: msgStats.replied   || (inbox?.length || 0), icon: "💬", color: "text-purple-600", bg: "bg-purple-50" },
                  { label: "Convertis", value: msgStats.converted || 0, icon: "🛒", color: "text-orange-600", bg: "bg-orange-50" },
                  { label: "Échoués",   value: msgStats.failed    || 0, icon: "❌", color: (msgStats.failed || 0) > 0 ? "text-red-600" : "text-gray-300", bg: (msgStats.failed || 0) > 0 ? "bg-red-50" : "bg-gray-50" },
                ].map(k => {
                  const pct = msgStats.total > 0 ? Math.round(k.value / msgStats.total * 100) : 0;
                  return (
                    <div key={k.label} className={`${k.bg} rounded-xl p-3 text-center border border-white shadow-sm`}>
                      <div className="text-base mb-0.5">{k.icon}</div>
                      <div className={`text-xl font-bold ${k.color}`}>{k.value.toLocaleString()}</div>
                      {msgStats.total > 0 && k.label !== "Envoyés" && (
                        <div className="text-[10px] text-gray-400">{pct}%</div>
                      )}
                      <div className="text-[11px] text-gray-500 font-medium">{k.label}</div>
                    </div>
                  );
                })}
              </div>

              {/* Alerte si failed > 5% */}
              {(msgStats.failed || 0) > 0 && msgStats.total > 0 && (
                <div className="mt-2 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                  <span className="text-red-500 text-lg shrink-0">⚠️</span>
                  <div>
                    <p className="text-sm font-bold text-red-800">
                      {msgStats.failed} message{msgStats.failed > 1 ? "s" : ""} non livré{msgStats.failed > 1 ? "s" : ""}
                      {" "}({Math.round(msgStats.failed / msgStats.total * 100)}% du total)
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">
                      Causes possibles : numéros invalides, contacts bloquant les messages, templates non approuvés.
                      Clique "Sync statuts WATI" pour mettre à jour.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Header ── */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">💬 WhatsApp Campaign Manager</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {totalAvailable.toLocaleString()} contacts disponibles (sur {totalWaContacts.toLocaleString()} total) · Anti-spam 30j/template
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">Auto ↻ 5 min</span>
                {/* Badge statut WATI */}
                {waData && (
                  <span className={`text-xs px-2 py-1 rounded-lg font-medium flex items-center gap-1
                    ${watiConnected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                    <span className={`w-2 h-2 rounded-full ${watiConnected ? "bg-green-500" : "bg-red-400"}`} />
                    WATI {watiConnected ? "OK" : watiTokenBad ? "Token expiré" : "Erreur"}
                  </span>
                )}
                <button
                  onClick={async () => {
                    try {
                      const r = await fetch(`/api/marketing/wati-sync-status`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "x-owner-token": token },
                      });
                      const d = await r.json();
                      if (!d.wati_connected) {
                        alert(`❌ WATI non connecté\n${d.wati_error || "Erreur inconnue"}\n\n${d.fix_guide || ""}`);
                      } else {
                        alert(`✅ Sync WATI terminé\n${d.checked} messages vérifiés\n${d.delivered} livrés · ${d.read} lus · ${d.failed} échoués`);
                      }
                      loadWa(token);
                    } catch { alert("Erreur réseau — réessayer"); }
                  }}
                  className={`text-sm px-4 py-2 rounded-xl transition font-medium
                    ${watiConnected ? "bg-green-600 text-white hover:bg-green-700" : "bg-amber-500 text-white hover:bg-amber-600"}`}
                >
                  {watiConnected ? "📬 Sync WATI" : "🔑 Sync (token expiré)"}
                </button>
                <button onClick={() => { loadWa(token); }} className="text-sm bg-gray-900 text-white px-4 py-2 rounded-xl hover:bg-gray-700 transition">
                  ↻ Actualiser
                </button>
              </div>
            </div>

            {/* ── Segments cards ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-700 text-sm">📊 Segments de contacts ({totalWaContacts.toLocaleString()} total)</h3>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">Cliquer = sélectionner</span>
              </div>
              {waLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin w-7 h-7 border-4 border-gray-200 border-t-green-500 rounded-full" />
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {Object.entries(SEG_INFO).map(([seg, info]) => {
                    const stats   = segments[seg] || { total: 0, available: 0 };
                    const isActive = seg === "active";
                    const availPct = stats.total > 0 ? Math.round(stats.available / stats.total * 100) : 0;
                    const isSelected = waForm.segment === seg;
                    return (
                      <div
                        key={seg}
                        onClick={() => !isActive && info.template && setWaForm(f => ({ ...f, segment: seg, template_name: info.template }))}
                        className={`rounded-2xl p-4 border cursor-pointer transition ${isSelected ? "ring-2 ring-green-500 border-green-300 bg-green-50" : "border-gray-200 hover:border-gray-300 bg-white"} ${isActive ? "opacity-60 cursor-default" : ""}`}
                        title={info.desc}
                      >
                        <div className="text-2xl mb-2">{info.icon}</div>

                        {/* Total réel */}
                        <div className="text-xl font-bold text-gray-900">{(stats.total || 0).toLocaleString()}</div>
                        <div className="text-xs text-gray-500 mt-0.5 font-medium">{info.label}</div>

                        {!isActive && (
                          <div className="mt-2 space-y-1">
                            {/* Barre progression disponibles */}
                            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${availPct}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span>
                                <span className="font-bold text-green-700">{(stats.available || 0).toLocaleString()}</span>
                                <span className="text-gray-400"> dispo</span>
                              </span>
                              <span className="text-gray-400">{availPct}%</span>
                            </div>
                          </div>
                        )}
                        {isActive && <div className="mt-2 text-xs text-green-600 font-medium">✅ Actifs récents</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Créateur de campagne ── */}
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
              <h3 className="font-bold text-green-900 mb-4">🚀 Lancer une campagne WhatsApp</h3>
              <form onSubmit={launchCampaign} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">

                  {/* Segment */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">1. Segment cible</label>
                    <select
                      value={waForm.segment}
                      onChange={e => {
                        const seg = e.target.value;
                        const defaultTpl = SEG_INFO[seg]?.template || "";
                        setWaForm(f => ({ ...f, segment: seg, template_name: defaultTpl }));
                      }}
                      required
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                    >
                      <option value="">-- Choisir un segment --</option>
                      {Object.entries(SEG_INFO).filter(([s]) => s !== "active").map(([seg, info]) => {
                        const stats = segments[seg] || { total: 0, available: 0 };
                        return (
                          <option key={seg} value={seg}>
                            {info.icon} {info.label} — {(stats.total || 0).toLocaleString()} total, {(stats.available || 0).toLocaleString()} dispo
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Template */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">2. Template message</label>
                    <select
                      value={waForm.template_name}
                      onChange={e => setWaForm(f => ({ ...f, template_name: e.target.value }))}
                      required
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                    >
                      <option value="">-- Choisir un template --</option>
                      {Object.entries(TPL_INFO).map(([name, info]) => (
                        <option key={name} value={name}>{info.label}</option>
                      ))}
                    </select>
                    {waForm.template_name && TPL_INFO[waForm.template_name] && (
                      <p className="text-xs text-gray-500 mt-1.5 bg-white rounded-lg p-2 border border-gray-100 font-arabic" dir="rtl">
                        {TPL_INFO[waForm.template_name].msg}
                      </p>
                    )}
                  </div>

                  {/* Plafond journalier */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">3. Nombre de messages aujourd'hui</label>
                    <input
                      type="number"
                      min={1}
                      max={segments[waForm.segment]?.available || 1000}
                      value={waForm.daily_limit}
                      onChange={e => setWaForm(f => ({ ...f, daily_limit: Number(e.target.value) }))}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                    />
                    {waForm.template_name && (
                      <p className="text-xs text-green-700 mt-1">
                        Coût estimé : <strong>{(waForm.daily_limit * (TPL_INFO[waForm.template_name]?.cost || 16)).toLocaleString()} DA</strong>
                        {" "}({waForm.daily_limit} × 16 DA/msg)
                      </p>
                    )}
                  </div>

                  {/* Nom campagne */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">4. Nom de la campagne (optionnel)</label>
                    <input
                      type="text"
                      value={waForm.name}
                      onChange={e => setWaForm(f => ({ ...f, name: e.target.value }))}
                      placeholder={`Réactivation ${new Date().toLocaleDateString("fr-DZ")}`}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                    />
                  </div>
                </div>

                {/* Option lancer maintenant vs brouillon */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={waForm.schedule_now}
                      onChange={e => setWaForm(f => ({ ...f, schedule_now: e.target.checked }))}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-gray-700 font-medium">Envoyer immédiatement</span>
                  </label>
                  {!waForm.schedule_now && <span className="text-xs text-gray-500">(sauvegarder comme brouillon)</span>}
                </div>

                <button
                  type="submit"
                  disabled={waLaunching || !waForm.segment || !waForm.template_name}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-green-600 text-white font-bold px-8 py-3 rounded-xl hover:bg-green-700 transition disabled:opacity-50"
                >
                  {waLaunching ? <span className="animate-spin">↻</span> : "🚀"}
                  {waLaunching ? "Envoi en cours..." : waForm.schedule_now ? `Lancer — ${waForm.daily_limit} messages` : "Sauvegarder brouillon"}
                </button>
              </form>

              {/* Résultat envoi */}
              {waResult && (
                <div className={`mt-4 p-4 rounded-xl border ${waResult.ok ? "bg-green-100 border-green-300" : "bg-red-100 border-red-300"}`}>
                  {waResult.ok ? (
                    <div>
                      <p className="font-bold text-green-800">✅ Campagne lancée !</p>
                      <div className="text-sm text-green-700 mt-1 space-y-0.5">
                        <p>✉️ Envoyé : <strong>{waResult.sent}</strong> messages</p>
                        <p>⚠️ Échoué : <strong>{waResult.failed || 0}</strong></p>
                        <p>💰 Coût : <strong>{(waResult.cost_da || 0).toLocaleString()} DA</strong></p>
                        <p>📋 Éligibles disponibles : <strong>{waResult.eligible}</strong> (sur segment {waForm.segment})</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-red-800 font-medium">❌ Erreur : {waResult.error}</p>
                  )}
                </div>
              )}
            </div>

            {/* ── Stats templates ── */}
            <div>
              <h3 className="font-semibold text-gray-700 text-sm mb-3">📈 Performances par template (historique)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-3 text-xs text-gray-500 font-semibold">Template</th>
                      <th className="text-right p-3 text-xs text-gray-500 font-semibold">Envoyés</th>
                      <th className="text-right p-3 text-xs text-gray-500 font-semibold">Livrés</th>
                      <th className="text-right p-3 text-xs text-gray-500 font-semibold">Lus</th>
                      <th className="text-right p-3 text-xs text-gray-500 font-semibold">Répondu</th>
                      <th className="text-right p-3 text-xs text-gray-500 font-semibold">Converti</th>
                      <th className="text-right p-3 text-xs text-gray-500 font-semibold">CA généré</th>
                      <th className="text-right p-3 text-xs text-gray-500 font-semibold">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tplStats.filter(t => t.name.endsWith("_v2")).map(t => {
                      const convRate = t.total_sent > 0 ? Math.round(t.total_converted / t.total_sent * 100) : 0;
                      const readRate = t.total_sent > 0 ? Math.round(t.total_read / t.total_sent * 100) : 0;
                      return (
                        <tr key={t.name} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="p-3">
                            <div className="font-medium text-gray-900">{t.name}</div>
                            {t.is_winner && <span className="text-xs bg-yellow-100 text-yellow-700 rounded px-1">🏆 Meilleur</span>}
                          </td>
                          <td className="p-3 text-right text-gray-700">{t.total_sent || 0}</td>
                          <td className="p-3 text-right text-gray-600">{t.total_delivered || 0}</td>
                          <td className="p-3 text-right">
                            <span className={`font-medium ${readRate > 50 ? "text-green-600" : readRate > 20 ? "text-yellow-600" : "text-gray-400"}`}>
                              {t.total_read || 0} <span className="text-xs">({readRate}%)</span>
                            </span>
                          </td>
                          <td className="p-3 text-right text-gray-600">{t.total_replied || 0}</td>
                          <td className="p-3 text-right">
                            <span className={`font-bold ${convRate > 5 ? "text-green-600" : convRate > 0 ? "text-yellow-600" : "text-gray-400"}`}>
                              {t.total_converted || 0} <span className="text-xs font-normal">({convRate}%)</span>
                            </span>
                          </td>
                          <td className="p-3 text-right font-medium text-gray-900">{(t.revenue_da || 0).toLocaleString()} DA</td>
                          <td className="p-3 text-right">
                            <span className={`font-bold ${t.performance_score > 50 ? "text-green-600" : "text-gray-400"}`}>
                              {t.performance_score || 0}/100
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {tplStats.filter(t => t.name.endsWith("_v2")).length === 0 && (
                      <tr><td colSpan={8} className="p-8 text-center text-gray-400 text-sm">Aucune donnée — lance ta première campagne pour voir les résultats ici</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Historique campagnes ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-700 text-sm">📋 Historique des campagnes ({campaigns.length})</h3>
              </div>
              {campaigns.length === 0 ? (
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 text-center text-gray-400 text-sm">
                  Aucune campagne lancée — utilise le formulaire ci-dessus pour commencer
                </div>
              ) : (
                <div className="space-y-3">
                  {campaigns.map(c => {
                    const segInfo  = SEG_INFO[c.target_segment] || {};
                    const totalReal = (c.total_sent || 0) + (c.total_failed || 0);
                    const delivPct  = totalReal > 0 ? Math.round((c.total_delivered || 0) / totalReal * 100) : 0;
                    const readPct   = totalReal > 0 ? Math.round((c.total_read || 0) / totalReal * 100) : 0;
                    const cvPct     = totalReal > 0 ? Math.round((c.total_converted || 0) / totalReal * 100) : 0;
                    const failedPct = totalReal > 0 ? Math.round((c.total_failed || 0) / totalReal * 100) : 0;
                    const hasIssue  = (c.total_failed || 0) > 0;
                    const statusColors = {
                      active: "bg-green-100 text-green-700",
                      draft:  "bg-gray-100 text-gray-600",
                      paused: "bg-orange-100 text-orange-700",
                      done:   "bg-blue-100 text-blue-600",
                    };
                    return (
                      <div key={c.id} className={`bg-white rounded-2xl p-4 shadow-sm border ${hasIssue ? "border-red-200" : "border-gray-200"}`}>
                        {/* Header */}
                        <div className="flex items-start gap-2 flex-wrap mb-3">
                          <span className="text-xl shrink-0">{segInfo.icon || "💬"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-gray-900 text-sm">{c.name}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[c.status] || "bg-gray-100 text-gray-600"}`}>
                                {c.status === "active" ? "🟢 Active" : c.status === "done" ? "✅ Terminée" : c.status}
                              </span>
                              {hasIssue && (
                                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                                  ⚠️ {c.total_failed} échoués
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                              <span>📅 {c.launched_at ? new Date(c.launched_at).toLocaleDateString("fr-DZ", { day: "2-digit", month: "short" }) : "brouillon"}</span>
                              <span>📝 {c.template_a}</span>
                              <span>👥 {segInfo.label || c.target_segment}</span>
                            </div>
                          </div>
                          {/* Revenue badge */}
                          {Number(c.revenue_da) > 0 && (
                            <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-center shrink-0">
                              <div className="font-bold text-green-700 text-sm">{Number(c.revenue_da).toLocaleString()} DA</div>
                              <div className="text-[10px] text-green-600">Revenue 72h</div>
                            </div>
                          )}
                        </div>

                        {/* Stats grid */}
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {[
                            { label: "Envoyés",   val: c.total_sent || 0,       pct: null,      color: "text-gray-900",   bg: "bg-gray-50" },
                            { label: "Échoués",   val: c.total_failed || 0,     pct: failedPct, color: hasIssue ? "text-red-600" : "text-gray-300", bg: hasIssue ? "bg-red-50" : "bg-gray-50" },
                            { label: "Livrés",    val: c.total_delivered || 0,  pct: delivPct,  color: "text-green-600",  bg: "bg-green-50" },
                            { label: "Lus",       val: c.total_read || 0,       pct: readPct,   color: "text-blue-600",   bg: "bg-blue-50" },
                            { label: "Réponses",  val: c.total_replied || 0,    pct: null,      color: "text-purple-600", bg: "bg-purple-50" },
                            { label: "Convertis", val: c.total_converted || 0,  pct: cvPct,     color: cvPct > 5 ? "text-green-600" : "text-gray-500", bg: cvPct > 0 ? "bg-green-50" : "bg-gray-50" },
                          ].map(k => (
                            <div key={k.label} className={`${k.bg} rounded-xl p-2 text-center`}>
                              <div className={`font-bold text-sm ${k.color}`}>{k.val.toLocaleString()}</div>
                              {k.pct !== null && totalReal > 0 && <div className="text-[9px] text-gray-400">{k.pct}%</div>}
                              <div className="text-[10px] text-gray-400">{k.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Footer coût */}
                        <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                          <span>💰 Coût : <strong className="text-gray-600">{Number(c.total_cost_da || (c.total_sent || 0) * 16).toLocaleString()} DA</strong></span>
                          {Number(c.revenue_da) > 0 && (
                            <span>
                              ROI : <strong className={Number(c.total_cost_da) > 0 && (Number(c.revenue_da) / Number(c.total_cost_da)) > 1 ? "text-green-600" : "text-orange-500"}>
                                {Number(c.total_cost_da) > 0 ? `${(Number(c.revenue_da) / Number(c.total_cost_da)).toFixed(1)}x` : "—"}
                              </strong>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Réponses clients (inbox) ── */}
            {inbox.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-700 text-sm mb-3">💬 Réponses clients ({inbox.length})</h3>
                <div className="space-y-2">
                  {inbox.slice(0, 10).map(m => {
                    const sentColors = { positive: "border-green-200 bg-green-50", negative: "border-red-200 bg-red-50", neutral: "border-gray-200 bg-white" };
                    const sentIcons  = { positive: "😊", negative: "😡", neutral: "💬" };
                    return (
                      <div key={m.id} className={`rounded-xl p-3 border flex items-start gap-3 ${sentColors[m.sentiment] || sentColors.neutral}`}>
                        <span className="text-lg shrink-0">{sentIcons[m.sentiment] || "💬"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-gray-900">{m.customer_name || m.phone}</span>
                            {m.template_replied_to && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">{m.template_replied_to}</span>}
                            <span className="text-[10px] text-gray-400">{new Date(m.created_at).toLocaleString("fr-DZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <p className="text-sm text-gray-700 mt-0.5 leading-relaxed" dir="auto">{m.message_text?.substring(0, 150)}{m.message_text?.length > 150 ? "…" : ""}</p>
                          {m.sentiment_label && m.sentiment_label !== "autre" && (
                            <span className="text-[10px] text-gray-500">🏷️ {m.sentiment_label}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        );
      })()}

      {/* ══════════════════════ TAB RECOMMANDATIONS ══════════════════════ */}
      {tab === "recommendations" && (
        <div className="space-y-6">

          {/* Légende équation budget */}
          <div className="bg-gray-900 text-white rounded-2xl p-4 text-sm">
            <p className="font-bold mb-2">⚙️ Équation budget active</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-gray-300">
              <div><span className="text-white font-bold">Départ :</span> 15 EUR/jour = {fmt(KPI_CONSTANTS.budget_depart_da)} DA <span className="text-gray-400">(290 DA/€)</span></div>
              <div><span className="text-white font-bold">Maximum :</span> ~100 USD/jour ≈ {fmt(KPI_CONSTANTS.budget_max_da)} DA <span className="text-gray-400">(268 DA/$)</span></div>
              <div><span className="text-white font-bold">Décision :</span> après 24h minimum de données</div>
              <div><span className="text-white font-bold">ROAB &gt; 3x (3j)</span> → budget × 1.5</div>
              <div><span className="text-white font-bold">ROAB 2-3x (2j)</span> → budget × 1.3</div>
              <div><span className="text-white font-bold">ROAB &lt; 1x (2j)</span> → budget × 0.6</div>
            </div>
            <p className="text-gray-400 text-xs mt-2">L'IA dépense ton argent comme si c'était le sien — pas d'action urgente, stabilité avant tout.</p>
          </div>

          {/* ── Recommandations PENDING ── */}
          <div>
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              En attente de validation ({pendingRecs.length})
            </h3>

            {recsLoading && <div className="text-center py-8 text-gray-400 text-sm">Chargement…</div>}

            {!recsLoading && pendingRecs.length === 0 && (
              <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center">
                <p className="text-3xl mb-2">✅</p>
                <p className="text-gray-500 text-sm">Aucune recommandation en attente.</p>
                <p className="text-gray-400 text-xs mt-1">L'IA créera une recommandation REC-001 dès que le catalogue Meta sera prêt.</p>
              </div>
            )}

            {pendingRecs.map(rec => (
              <RecCard key={rec.id} rec={rec} onAction={handleRec} actioning={actioning} />
            ))}
          </div>

          {/* ── Historique ── */}
          {(acceptedRecs.length > 0 || refusedRecs.length > 0) && (
            <div>
              <h3 className="font-bold text-gray-700 mb-3 text-sm flex items-center gap-2">
                <span>📖</span> Historique des décisions
              </h3>
              <div className="space-y-2">
                {[...acceptedRecs, ...refusedRecs]
                  .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
                  .map(rec => (
                    <div key={rec.id} className={`rounded-xl p-3 border text-sm ${rec.status === "accepted" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-gray-500">{rec.id}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rec.status === "accepted" ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800"}`}>
                          {rec.status === "accepted" ? "✅ Accepté" : "❌ Refusé"}
                        </span>
                        <span className="text-xs text-gray-400 ml-auto">{new Date(rec.updated_at).toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <p className="font-semibold text-gray-800">{rec.title}</p>
                      {rec.owner_note && <p className="text-xs text-gray-600 mt-1 italic">Note : {rec.owner_note}</p>}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ TAB KANBAN ══════════════════════ */}
      {!loading && tab === "kanban" && (
        <div className="space-y-6">
          {/* Filtres + bouton créer */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setFilterStatus("all")} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${filterStatus === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Tous</button>
              {STATUS_ORDER.map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${filterStatus === s ? "bg-gray-900 text-white" : `${STATUSES[s].color} hover:opacity-80`}`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${STATUSES[s].dot}`} />
                  {STATUSES[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Colonnes Kanban */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {STATUS_ORDER.map(status => {
              const cols = filtered.filter(c => c.status === status);
              return (
                <div key={status} className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <span className={`w-2 h-2 rounded-full ${STATUSES[status].dot}`} />
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{STATUSES[status].label}</span>
                    <span className="text-xs text-gray-400 ml-auto">{cols.length}</span>
                  </div>
                  <div className="space-y-2">
                    {cols.map(c => (
                      <CampaignCard key={c.id} campaign={c} onStatus={updateStatus} onDelete={deleteCampaign} />
                    ))}
                    {cols.length === 0 && (
                      <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400">
                        Aucune campagne
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Formulaire créer campagne */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4">➕ Nouvelle campagne</h3>
            <form onSubmit={createCampaign} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <input
                required value={newCamp.title}
                onChange={e => setNewCamp(p => ({ ...p, title: e.target.value }))}
                placeholder="Titre de la campagne *"
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 col-span-full sm:col-span-2"
              />
              <select value={newCamp.platform} onChange={e => setNewCamp(p => ({ ...p, platform: e.target.value }))} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={newCamp.world} onChange={e => setNewCamp(p => ({ ...p, world: e.target.value }))} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                {Object.entries(WORLDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input value={newCamp.campaign_type} onChange={e => setNewCamp(p => ({ ...p, campaign_type: e.target.value }))} placeholder="Type (acquisition, retargeting...)" className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              <input type="number" value={newCamp.budget_da} onChange={e => setNewCamp(p => ({ ...p, budget_da: e.target.value }))} placeholder="Budget (DA)" className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              <textarea value={newCamp.ai_reasoning} onChange={e => setNewCamp(p => ({ ...p, ai_reasoning: e.target.value }))} placeholder="Pourquoi cette campagne ? (objectif, contexte...)" rows={2} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 col-span-full" />
              <button type="submit" disabled={creating} className="col-span-full bg-gray-900 text-white font-semibold py-3 rounded-xl hover:bg-gray-700 transition disabled:opacity-50">
                {creating ? "Création…" : "Créer la campagne"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════ TAB JOURNAL IA ══════════════════════ */}
      {!loading && tab === "journal" && (() => {
        const AGENT_META = {
          catalog:      { icon: "🤖", label: "Agent 1 — Catalogue",    color: "bg-blue-50 border-blue-200" },
          campaign:     { icon: "📘", label: "Agent 2 — Meta Ads",     color: "bg-indigo-50 border-indigo-200" },
          reactivation: { icon: "💬", label: "Agent 3 — WhatsApp",     color: "bg-green-50 border-green-200" },
          content:      { icon: "✍️", label: "Agent 4 — Contenu",      color: "bg-purple-50 border-purple-200" },
          "sync-stats": { icon: "🔄", label: "Sync Meta Stats",        color: "bg-gray-50 border-gray-200" },
          owner:        { icon: "👤", label: "Action Owner",           color: "bg-yellow-50 border-yellow-200" },
        };
        const IMPACT_COLOR = { high: "text-green-700 bg-green-100", medium: "text-yellow-700 bg-yellow-100", low: "text-gray-600 bg-gray-100" };

        // Filtres
        const [journalFilter, setJournalFilter] = window.__journalFilter !== undefined
          ? [window.__journalFilter, v => { window.__journalFilter = v; }]
          : ["all", () => {}];

        const filtered = aiLog.filter(l => journalFilter === "all" || l.agent === journalFilter);
        const agentCounts = aiLog.reduce((a, l) => { a[l.agent] = (a[l.agent] || 0) + 1; return a; }, {});

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-bold text-gray-900">📖 Journal des décisions IA</h2>
                <p className="text-xs text-gray-500 mt-0.5">{aiLog.length} actions enregistrées — toutes décisions prises par les agents</p>
              </div>
              <button onClick={() => load(token)} className="text-sm bg-gray-900 text-white px-4 py-2 rounded-xl hover:bg-gray-700 transition">↻ Actualiser</button>
            </div>

            {/* Compteurs par agent */}
            <div className="flex flex-wrap gap-2">
              {[["all", "🔍 Tous", aiLog.length], ...Object.entries(agentCounts).map(([a, n]) => [a, (AGENT_META[a]?.icon || "•") + " " + (AGENT_META[a]?.label || a), n])].map(([id, label, n]) => (
                <button
                  key={id}
                  onClick={() => { window.__journalFilter = id; load(token); }}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium border transition ${journalFilter === id ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
                >
                  {label} <span className="opacity-60">({n})</span>
                </button>
              ))}
            </div>

            {/* Lignes journal */}
            {aiLog.length === 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center text-gray-400">
                <p className="text-2xl mb-2">📭</p>
                <p className="font-medium">Aucune action enregistrée</p>
                <p className="text-sm mt-1">Les agents logguent leurs décisions ici automatiquement</p>
              </div>
            )}

            {aiLog.map(log => {
              const meta = AGENT_META[log.agent] || { icon: "•", label: log.agent, color: "bg-gray-50 border-gray-200" };
              const isSuccess = log.success !== false;
              return (
                <div key={log.id} className={`rounded-2xl p-4 border ${meta.color} ${!isSuccess ? "opacity-70" : ""}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{meta.icon}</span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-gray-700">{meta.label}</span>
                          <span className="text-xs text-gray-400 bg-white/70 px-2 py-0.5 rounded-full border border-gray-200">{log.decision_type}</span>
                          {log.impact && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${IMPACT_COLOR[log.impact] || IMPACT_COLOR.low}`}>{log.impact}</span>}
                          {!isSuccess && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">❌ Erreur</span>}
                        </div>
                        <p className="text-sm text-gray-800 mt-1 font-medium">{log.description}</p>
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-400 shrink-0">
                      {new Date(log.created_at).toLocaleString("fr-DZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {log.error_message && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-2 font-mono">⚠️ {log.error_message}</p>
                  )}
                  {log.output_data && Object.keys(log.output_data).length > 0 && (
                    <div className="mt-2 text-xs text-gray-500 bg-white/60 rounded-lg px-3 py-2 border border-white/80">
                      {Object.entries(log.output_data).slice(0, 6).map(([k, v]) => (
                        <span key={k} className="mr-3"><strong>{k}</strong>: {String(v).substring(0, 40)}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ══════════════════════ TAB AUDIENCES ══════════════════════ */}
      {!loading && tab === "audiences" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Toutes les audiences Meta configurées pour NajmCoiff.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Audiences statiques (créées) */}
            {[
              { name: "NajmCoiff Clients Existants", type: "custom_customers", id: "120245469075640520", world: "all", count: "566 contacts", status: "active", icon: "👥" },
              { name: "NajmCoiff Lookalike 1% DZ", type: "lookalike", id: "120245471392660520", world: "all", count: "296k–348k profils", status: "active", icon: "🔮" },
              { name: "NajmCoiff Visiteurs Coiffure 7j", type: "website_retargeting", id: "120245471426530520", world: "coiffure", count: "Pixel 7j", status: "active", icon: "💇" },
              { name: "NajmCoiff Visiteurs Coiffure 30j", type: "website_retargeting", id: "120245471426750520", world: "coiffure", count: "Pixel 30j", status: "active", icon: "💇" },
              { name: "NajmCoiff Visiteurs Onglerie 7j", type: "website_retargeting", id: "120245471426950520", world: "onglerie", count: "Pixel 7j", status: "active", icon: "💅" },
              { name: "NajmCoiff Visiteurs Onglerie 30j", type: "website_retargeting", id: "120245471427000520", world: "onglerie", count: "Pixel 30j", status: "active", icon: "💅" },
            ].map(a => (
              <div key={a.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{a.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{a.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{a.type}</span>
                      <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{a.count}</span>
                      {a.world !== "all" && <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-medium">{a.world}</span>}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5 font-mono">ID: {a.id}</p>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0 mt-1" />
                </div>
              </div>
            ))}
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-800">
            <p className="font-bold mb-1">ℹ️ Pixels Meta actifs</p>
            <p>Coiffure : <code className="bg-blue-100 px-1 rounded font-mono text-xs">1436593504886973</code></p>
            <p className="mt-1">Onglerie : <code className="bg-blue-100 px-1 rounded font-mono text-xs">839178319213103</code></p>
            <p className="mt-1">Compte pub : <code className="bg-blue-100 px-1 rounded font-mono text-xs">act_880775160439589</code></p>
            <p className="mt-1">Business Manager : <code className="bg-blue-100 px-1 rounded font-mono text-xs">301096122408704</code></p>
          </div>
        </div>
      )}

      {/* ══════════════════════ TAB WORKFLOW ══════════════════════ */}
      {!loading && tab === "workflow" && (
        <div className="space-y-4">
          <div className="bg-gray-900 text-white rounded-2xl p-5">
            <h2 className="font-bold text-lg mb-1">⚙️ Plan complet d'automatisation marketing</h2>
            <p className="text-gray-400 text-sm">NajmCoiff — Objectif : 80-100 commandes/jour · 2 500 000 DA bénéfice/mois</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {["Meta Ads", "WhatsApp WATI", "4 Agents IA", "9 automations"].map(t => (
                <span key={t} className="text-xs bg-white/10 px-2.5 py-1 rounded-full font-medium">{t}</span>
              ))}
            </div>
          </div>

          {/* Légende phases */}
          <div className="flex flex-wrap gap-2">
            {[...new Set(WORKFLOW_STEPS.map(s => s.phase))].map(phase => (
              <span key={phase} className={`text-xs font-bold px-3 py-1 rounded-full border-l-4 ${PHASE_COLORS[phase] || "border-gray-400 bg-gray-50"}`}>{phase}</span>
            ))}
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {WORKFLOW_STEPS.map((step, idx) => (
              <div key={step.id} className={`border-l-4 rounded-2xl bg-white shadow-sm overflow-hidden ${PHASE_COLORS[step.phase] || "border-gray-300"}`}>
                <button
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-black/5 transition"
                  onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                >
                  <div className="flex-shrink-0 w-8 h-8 bg-gray-900 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base">{step.icon}</span>
                      <span className="font-bold text-gray-900 text-sm">{step.title}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${step.platform.includes("Meta") ? "bg-blue-100 text-blue-700" : step.platform === "Interne" ? "bg-gray-100 text-gray-600" : "bg-green-100 text-green-700"}`}>
                        {step.platform}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{step.trigger}</p>
                  </div>
                  <span className="text-gray-400 shrink-0">{expandedStep === step.id ? "▲" : "▼"}</span>
                </button>

                {expandedStep === step.id && (
                  <div className="px-4 pb-5 space-y-3 border-t border-gray-100 pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {step.template && (
                        <div className="bg-green-50 rounded-xl p-3">
                          <p className="text-xs font-bold text-green-700 mb-1">📱 Template WATI</p>
                          <p className="text-xs text-green-800 font-mono">{step.template}</p>
                          {step.message && <p className="text-xs text-green-700 mt-2 leading-relaxed border-t border-green-200 pt-2 italic">{step.message}</p>}
                        </div>
                      )}
                      {step.audiences && (
                        <div className="bg-blue-50 rounded-xl p-3">
                          <p className="text-xs font-bold text-blue-700 mb-1">🎯 Audiences</p>
                          {step.audiences.map((a, i) => <p key={i} className="text-xs text-blue-800 font-mono">{a}</p>)}
                        </div>
                      )}
                      {step.condition && (
                        <div className="bg-yellow-50 rounded-xl p-3">
                          <p className="text-xs font-bold text-yellow-700 mb-1">⚡ Condition déclenchement</p>
                          <p className="text-xs text-yellow-800">{step.condition}</p>
                        </div>
                      )}
                      {step.objective && (
                        <div className="bg-purple-50 rounded-xl p-3">
                          <p className="text-xs font-bold text-purple-700 mb-1">🏆 Objectif Meta</p>
                          <p className="text-xs text-purple-800">{step.objective}</p>
                        </div>
                      )}
                      {step.description && (
                        <div className="bg-gray-50 rounded-xl p-3 sm:col-span-2">
                          <p className="text-xs font-bold text-gray-700 mb-1">📝 Description</p>
                          <p className="text-xs text-gray-700 leading-relaxed">{step.description}</p>
                        </div>
                      )}
                      {step.creative && (
                        <div className="bg-indigo-50 rounded-xl p-3">
                          <p className="text-xs font-bold text-indigo-700 mb-1">🎨 Créatif</p>
                          <p className="text-xs text-indigo-800">{step.creative}</p>
                        </div>
                      )}
                      {step.budget && (
                        <div className="bg-emerald-50 rounded-xl p-3">
                          <p className="text-xs font-bold text-emerald-700 mb-1">💰 Budget</p>
                          <p className="text-xs text-emerald-800">{step.budget}</p>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-bold text-gray-600 mb-1.5">📊 KPIs cibles</p>
                        <ul className="space-y-1">
                          {step.kpis.map((k, i) => <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5"><span className="text-green-500 shrink-0">✓</span>{k}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-600 mb-1.5">🤖 Agents IA</p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {step.agents.map((a, i) => <span key={i} className="text-[10px] bg-gray-900 text-white px-2 py-0.5 rounded-full">{a}</span>)}
                        </div>
                        <p className="text-xs font-bold text-gray-600 mb-1.5 mt-2">🗄️ Tables Supabase</p>
                        <div className="flex flex-wrap gap-1">
                          {step.tables.map((t, i) => <code key={i} className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{t}</code>)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Résumé statut actuel */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mt-4">
            <h3 className="font-bold text-amber-900 mb-3">📌 Statut actuel du plan (2026-04-18)</h3>
            <div className="space-y-2">
              {[
                { label: "Templates WATI v2",      status: "⏳", note: "6 templates PENDING — approbation Meta 24-48h" },
                { label: "Audiences Meta",          status: "✅", note: "6 audiences créées (clients, lookalike, 4× retargeting pixel)" },
                { label: "Catalogue Meta",          status: "✅", note: "Feed XML live sur www.najmcoiff.com/api/boutique/meta-feed" },
                { label: "Agent 2 (Meta Ads)",      status: "✅", note: "Prêt — en attente décision owner sur budget et lancement" },
                { label: "Agent 3 (WhatsApp)",      status: "⏳", note: "Prêt — en attente approbation templates v2" },
                { label: "Agent 1 (Catalogue)",     status: "✅", note: "Actif — scoring quotidien nc_ai_product_scores" },
                { label: "Agent 4 (Contenu)",       status: "✅", note: "Actif — génération créatifs dans nc_ai_content_queue" },
                { label: "Pixels + CAPI",           status: "✅", note: "Actifs sur www.najmcoiff.com — PageView + ViewContent + Purchase" },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-3">
                  <span className="text-base shrink-0 w-6 text-center">{item.status}</span>
                  <div>
                    <span className="text-sm font-semibold text-amber-900">{item.label}</span>
                    <span className="text-xs text-amber-700 ml-2">{item.note}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Composant carte recommandation ──────────────────────────────────────────
function RecCard({ rec, onAction, actioning }) {
  const [refuseMode, setRefuseMode] = useState(false);
  const [refuseNote, setRefuseNote] = useState("");
  const conf = CONFIDENCE_CONFIG[rec.confidence] || CONFIDENCE_CONFIG.medium;
  const isActioning = actioning[rec.id];

  return (
    <div className="bg-white border-2 border-amber-200 rounded-2xl p-5 shadow-sm mb-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-gray-900 text-white rounded-xl flex items-center justify-center font-mono font-bold text-xs shrink-0">
            {rec.id}
          </div>
          <div>
            <p className="font-bold text-gray-900 text-base leading-tight">{rec.title}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${conf.color}`}>
                {conf.icon} {conf.label}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${rec.platform === "meta" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                {rec.platform === "meta" ? "📘 Meta Ads" : "💬 WhatsApp"}
              </span>
              {rec.world && rec.world !== "all" && (
                <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-full">
                  {rec.world === "coiffure" ? "💇 Coiffure" : "💅 Onglerie"}
                </span>
              )}
              <span className="text-[10px] text-gray-400">
                Expire {rec.expires_at ? new Date(rec.expires_at).toLocaleDateString("fr-DZ", { day: "2-digit", month: "short" }) : "—"}
              </span>
            </div>
          </div>
        </div>
        {/* Métriques estimées */}
        <div className="flex gap-3 text-center">
          {rec.estimated_budget_da > 0 && (
            <div className="bg-gray-50 rounded-xl px-3 py-2">
              <p className="text-xs text-gray-400">Budget/jour</p>
              <p className="font-bold text-gray-900 text-sm">{Number(rec.estimated_budget_da).toLocaleString()} DA</p>
            </div>
          )}
          {rec.estimated_orders > 0 && (
            <div className="bg-blue-50 rounded-xl px-3 py-2">
              <p className="text-xs text-blue-500">Cmd estimées</p>
              <p className="font-bold text-blue-700 text-sm">{rec.estimated_orders}/j</p>
            </div>
          )}
          {rec.estimated_roab > 0 && (
            <div className="bg-green-50 rounded-xl px-3 py-2">
              <p className="text-xs text-green-500">ROAB estimé</p>
              <p className="font-bold text-green-700 text-sm">{rec.estimated_roab}x</p>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="bg-gray-50 rounded-xl p-4 mb-4 text-sm text-gray-700 leading-relaxed">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Ce que l'IA propose</p>
        <p>{rec.description}</p>
      </div>

      {/* Raisonnement */}
      {rec.reasoning && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-4 text-sm text-indigo-800">
          <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1">🧠 Pourquoi cette décision</p>
          <p className="leading-relaxed text-xs">{rec.reasoning}</p>
        </div>
      )}

      {/* Payload (détails techniques) */}
      {rec.action_payload && (
        <details className="mb-4">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Voir les détails techniques</summary>
          <pre className="text-[10px] bg-gray-100 rounded-lg p-3 mt-2 overflow-auto text-gray-600 max-h-32">
            {JSON.stringify(rec.action_payload, null, 2)}
          </pre>
        </details>
      )}

      {/* Boutons action */}
      {!refuseMode ? (
        <div className="flex gap-3">
          <button
            onClick={() => onAction(rec.id, "accept")}
            disabled={!!isActioning}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isActioning === "accept" ? "Exécution…" : "✅ Accepter — Lancer maintenant"}
          </button>
          <button
            onClick={() => setRefuseMode(true)}
            disabled={!!isActioning}
            className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 font-bold py-3 rounded-xl border border-red-200 transition disabled:opacity-50"
          >
            ❌ Refuser / Négocier
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={refuseNote}
            onChange={e => setRefuseNote(e.target.value)}
            placeholder="Explique pourquoi tu refuses (optionnel — tu peux négocier dans le chat en mentionnant l'ID)..."
            rows={2}
            className="w-full border border-red-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          <div className="flex gap-2">
            <button
              onClick={() => onAction(rec.id, "refuse", refuseNote)}
              disabled={!!isActioning}
              className="flex-1 bg-red-600 text-white font-bold py-2.5 rounded-xl hover:bg-red-700 transition disabled:opacity-50"
            >
              {isActioning === "refuse" ? "Refus…" : "Confirmer le refus"}
            </button>
            <button onClick={() => setRefuseMode(false)} className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition font-medium">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Composant carte campagne ─────────────────────────────────────────────────
function CampaignCard({ campaign: c, onStatus, onDelete }) {
  const p = PLATFORMS[c.platform] || PLATFORMS.meta;
  const s = STATUSES[c.status]   || STATUSES.draft;
  const nextStatuses = STATUS_ORDER.filter(x => x !== c.status);

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm hover:shadow-md transition group">
      <div className="flex items-start gap-2 mb-2">
        <span className="text-base">{p.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-tight truncate" title={c.title}>{c.title}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${p.color}`}>{p.label}</span>
            {c.world && c.world !== "all" && <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full">{WORLDS[c.world] || c.world}</span>}
            {c.created_by_ai && <span className="text-[10px] bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-full">IA</span>}
          </div>
        </div>
      </div>
      {c.ai_reasoning && <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2 mb-2 italic">{c.ai_reasoning}</p>}
      <div className="flex flex-wrap gap-2 text-[10px] text-gray-400 mb-3">
        {Number(c.budget_da) > 0 && <span>💰 {Number(c.budget_da).toLocaleString()} DA</span>}
        {Number(c.orders_generated) > 0 && <span>📦 {c.orders_generated} cmd</span>}
        {Number(c.roas) > 0 && <span className="text-green-600 font-bold">ROAS {c.roas}x</span>}
        <span className="ml-auto">{new Date(c.created_at).toLocaleDateString("fr-DZ", { day: "2-digit", month: "short" })}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 opacity-0 group-hover:opacity-100 transition">
        {nextStatuses.slice(0, 3).map(ns => (
          <button key={ns} onClick={() => onStatus(c.id, ns)} className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg transition ${STATUSES[ns].color} hover:opacity-80`}>
            → {STATUSES[ns].label}
          </button>
        ))}
        <button onClick={() => onDelete(c.id)} className="text-[10px] text-red-500 hover:text-red-700 ml-auto">✕</button>
      </div>
    </div>
  );
}
