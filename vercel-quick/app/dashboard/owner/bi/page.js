"use client";
import { useState, useEffect, useCallback } from "react";
import { getSession } from "@/lib/auth";

function getToken() { return getSession()?.token || ""; }

const STATUS = {
  green:  { bg: "bg-emerald-500", text: "text-emerald-400", ring: "ring-emerald-500/60", label: "Excellente santé",   emoji: "🟢" },
  yellow: { bg: "bg-yellow-400",  text: "text-yellow-400",  ring: "ring-yellow-400/60",  label: "À surveiller",       emoji: "🟡" },
  orange: { bg: "bg-orange-500",  text: "text-orange-400",  ring: "ring-orange-500/60",  label: "Attention requise",  emoji: "🟠" },
  red:    { bg: "bg-red-600",     text: "text-red-400",     ring: "ring-red-600/60",     label: "Action immédiate",   emoji: "🔴" },
};

const fmt   = (n) => (n ?? 0).toLocaleString("fr-DZ");
const fmtDA = (n) => `${fmt(n)} DA`;
const fmtPct = (n) => `${(n ?? 0)}%`;

// ── Graphe multi-séries 30 jours ────────────────────────────────────────────
function MultiLineChart({ data }) {
  if (!data?.length) return (
    <p className="text-center text-zinc-600 text-xs py-4">Données en cours d'accumulation...</p>
  );
  const W = 600, H = 160, PAD = { top: 12, right: 8, bottom: 22, left: 8 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;
  const n = data.length;

  const maxConf = Math.max(...data.map(d => d.confirmees), 1);
  const maxBen  = Math.max(...data.map(d => d.benefice), 1);
  const maxPOS  = Math.max(...data.map(d => d.ventes_pos), 1);

  const xStep = n > 1 ? iW / (n - 1) : 0;
  const px = i => PAD.left + i * xStep;
  const py = (v, mx) => PAD.top + iH * (1 - v / mx);

  const mkPath = (fn) => data.map((d, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${fn(d).toFixed(1)}`).join(" ");
  const confPath = mkPath(d => py(d.confirmees, maxConf));
  const benPath  = mkPath(d => py(d.benefice,  maxBen));
  const posPath  = mkPath(d => py(d.ventes_pos, maxPOS));

  const last = data[data.length - 1] || {};

  return (
    <div>
      {/* Légende */}
      <div className="flex gap-4 text-[11px] mb-3 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-indigo-400 inline-block rounded" />✅ Confirmées <span className="text-indigo-300 font-bold">{last.confirmees ?? 0}</span></span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-400 inline-block rounded" />💎 Bénéfice <span className="text-emerald-300 font-bold">{fmt(last.benefice ?? 0)} DA</span></span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-orange-400 inline-block rounded" />💼 POS <span className="text-orange-300 font-bold">{last.ventes_pos ?? 0}</span></span>
        <span className="text-zinc-600 text-[10px] ml-auto self-center">chaque ligne = sa propre échelle</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }}>
        {/* Grille horizontale */}
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f}
            x1={PAD.left} x2={W - PAD.right}
            y1={PAD.top + iH * (1 - f)} y2={PAD.top + iH * (1 - f)}
            stroke="#27272a" strokeWidth="0.5" />
        ))}
        {/* Lignes */}
        <path d={benPath}  fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <path d={posPath}  fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <path d={confPath} fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Points confirmées */}
        {data.map((d, i) => d.confirmees > 0 ? (
          <circle key={i} cx={px(i)} cy={py(d.confirmees, maxConf)} r="3" fill="#818cf8">
            <title>{d.date} · {d.confirmees} conf. · {fmt(d.benefice)} DA bénéf. · {d.ventes_pos} POS</title>
          </circle>
        ) : null)}
        {/* Labels X toutes les 5 journées */}
        {data.map((d, i) => (i === 0 || i === n - 1 || i % 5 === 0) ? (
          <text key={i} x={px(i)} y={H - 2} textAnchor="middle" fontSize="8" fill="#52525b">
            {d.date.slice(5)}
          </text>
        ) : null)}
      </svg>
    </div>
  );
}

function Card({ icon, label, value, sub, valueColor = "text-white", alert = false }) {
  return (
    <div className={`rounded-xl p-3.5 flex flex-col gap-1 ${alert ? "bg-red-950/50 ring-1 ring-red-600/70" : "bg-zinc-800/80"}`}>
      <div className="flex items-center gap-1.5 text-zinc-500 text-xs">{icon && <span>{icon}</span>}<span>{label}</span></div>
      <div className={`font-bold text-lg leading-tight ${valueColor}`}>{value ?? "—"}</div>
      {sub && <div className="text-[11px] text-zinc-600">{sub}</div>}
    </div>
  );
}

function BigCard({ icon, label, value, sub, valueColor = "text-white" }) {
  return (
    <div className="rounded-xl p-4 bg-zinc-800/80 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-zinc-500 text-xs">{icon && <span>{icon}</span>}<span>{label}</span></div>
      <div className={`font-black text-2xl leading-tight ${valueColor}`}>{value ?? "—"}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mt-5">
      <h2 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2">{title}</h2>
      {children}
    </div>
  );
}

function HealthArc({ score, status }) {
  const s = STATUS[status] || STATUS.yellow;
  const r = 52; const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const strokeColor = status === "green" ? "#10b981" : status === "yellow" ? "#facc15" : status === "orange" ? "#f97316" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="#27272a" strokeWidth="11" />
          <circle cx="60" cy="60" r={r} fill="none" stroke={strokeColor} strokeWidth="11"
            strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1.2s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[32px] font-black text-white leading-none">{score}</span>
          <span className="text-[11px] text-zinc-500">/ 100</span>
        </div>
      </div>
      <span className={`text-sm font-semibold ${s.text}`}>{s.emoji} {s.label}</span>
    </div>
  );
}

function ProgressBar({ value, max, color = "bg-emerald-500" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-zinc-700/50 rounded-full h-2.5 overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  );
}


export default function BIPage() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [configOpen, setConfigOpen] = useState(false);
  const [configForm, setConfigForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const token = getToken();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r1 = await fetch(`/api/bi/dashboard?date=${date}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r1.ok) {
        const data = await r1.json();
        setD(data);
        setConfigForm({
          dette_initiale: data.config?.dette_initiale || 0,
          objectif_benefice_mensuel: data.config?.objectif_benefice_mensuel || 250000,
          objectif_commandes_jour: data.config?.objectif_commandes_jour || 20,
        });
      }
    } finally { setLoading(false); }
  }, [date, token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const iv = setInterval(load, 5 * 60 * 1000); return () => clearInterval(iv); }, [load]);

  const saveConfig = async () => {
    setSaving(true);
    const r = await fetch("/api/bi/config", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(configForm),
    });
    const data = await r.json();
    setSaving(false);
    setMsg(data.ok ? "✅ Sauvegardé" : `❌ ${data.error}`);
    if (data.ok) { load(); setConfigOpen(false); }
    setTimeout(() => setMsg(""), 3000);
  };

  const sendReport = async () => {
    setSending(true);
    const r = await fetch("/api/bi/daily-report", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json();
    setSending(false);
    setMsg(data.wati_sent ? "✅ Rapport WhatsApp envoyé !" : "⚠️ Calcul OK — configure WATI_OWNER_PHONE pour activer l'envoi");
    setTimeout(() => setMsg(""), 5000);
  };

  if (loading) return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
      <div className="text-zinc-500 text-sm animate-pulse">Chargement...</div>
    </div>
  );

  const sc = STATUS[d?.health_status] || STATUS.yellow;
  const benef = d?.benefice || {};
  const clients = d?.clients || {};
  const mensuel = d?.mensuel || {};
  const finance = d?.finance || {};
  const stock = d?.stock || {};
  const mkt = d?.marketing || {};
  const wapp = d?.whatsapp || {};
  const j1 = d?.j1 || {};
  const objectif_jour = Math.round((benef.objectif_mensuel || 250000) / 30);
  const recoltes = d?.boutique?.recoltes ?? 0;
  const ca_total_jour = (d?.boutique?.ca_confirme ?? 0) + (d?.pos?.ca_pos ?? 0);

  function Delta({ value, prefix = "", suffix = "" }) {
    if (value === undefined || value === null) return null;
    const pos = value > 0;
    const zero = value === 0;
    return (
      <span className={`text-[11px] font-semibold ${zero ? "text-zinc-500" : pos ? "text-emerald-400" : "text-red-400"}`}>
        {pos ? "▲" : zero ? "▬" : "▼"} {prefix}{Math.abs(value).toLocaleString("fr-DZ")}{suffix} vs J-1
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-white pb-24">

      {/* Header sticky */}
      <div className="sticky top-0 z-20 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 px-4 py-2.5 flex items-center gap-2">
        <div className="flex-1">
          <p className="text-sm font-bold">🏥 Tableau de Bord Opérationnel</p>
          <p className="text-[11px] text-zinc-500">NajmCoiff · rafraîchi toutes les 5 min</p>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-300 w-36" />
        <button onClick={load} className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-400">↺</button>
      </div>

      {msg && <div className="mx-4 mt-2 px-4 py-2 rounded-lg bg-zinc-800 text-sm text-center border border-zinc-700">{msg}</div>}

      <div className="px-4">

        {/* ── Score de santé ─────────────────────────────────── */}
        <div className={`mt-4 rounded-2xl p-4 ring-2 ${sc.ring} bg-zinc-800/60 flex flex-col sm:flex-row items-center gap-5`}>
          <HealthArc score={d?.health_score ?? 0} status={d?.health_status ?? "yellow"} />
          <div className="flex-1 text-center sm:text-left space-y-2">
            <p className={`text-base font-bold ${sc.text}`}>{d?.health_message}</p>
            <p className="text-xs text-zinc-500">Pondéré : confirmation · livraison · bénéfice vs objectif · stock · caisse</p>
            <div className="flex gap-2 flex-wrap justify-center sm:justify-start pt-1">
              <button onClick={sendReport} disabled={sending}
                className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg px-3 py-1.5 font-semibold">
                {sending ? "Envoi..." : "📲 Rapport WhatsApp"}
              </button>
              <button onClick={() => setConfigOpen(!configOpen)}
                className="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-lg px-3 py-1.5">
                ⚙️ Objectifs
              </button>
            </div>
          </div>
        </div>

        {/* Config panel */}
        {configOpen && (
          <div className="mt-2 bg-zinc-800 rounded-xl p-4 border border-zinc-700 space-y-3">
            <p className="text-sm font-semibold text-zinc-300">Configuration</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                ["dette_initiale", "Dette fournisseur (DA)"],
                ["objectif_benefice_mensuel", "Objectif bénéfice mensuel (DA)"],
                ["objectif_commandes_jour", "Objectif commandes/jour"],
              ].map(([k, l]) => (
                <label key={k} className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-400">{l}</span>
                  <input type="number" value={configForm[k] || 0}
                    onChange={(e) => setConfigForm((f) => ({ ...f, [k]: parseFloat(e.target.value) || 0 }))}
                    className="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-1.5 text-sm text-white" />
                </label>
              ))}
            </div>
            <button onClick={saveConfig} disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-lg px-4 py-2 text-sm font-semibold">
              {saving ? "..." : "💾 Sauvegarder"}
            </button>
          </div>
        )}

        {/* ── BÉNÉFICE — moteur principal ─────────────────────── */}
        <Section title="💵 Bénéfice brut (prix vente − prix achat)">
          <div className="grid grid-cols-2 gap-2">
            <BigCard icon="💎" label="Bénéfice total du jour"
              value={fmtDA(benef.total_jour)}
              sub={`Objectif jour ≈ ${fmtDA(objectif_jour)} · marge ${fmtPct(benef.taux_marge_total)}`}
              valueColor={benef.total_jour >= objectif_jour ? "text-emerald-400" : benef.total_jour > 0 ? "text-yellow-400" : "text-red-400"} />
            <BigCard icon="📅" label="Bénéfice mensuel"
              value={fmtDA(mensuel.benefice_mois)}
              sub={`${mensuel.progression_pct}% de l'objectif ${fmtDA(mensuel.objectif_benefice)}`}
              valueColor={mensuel.progression_pct >= 80 ? "text-emerald-400" : mensuel.progression_pct >= 40 ? "text-yellow-400" : "text-orange-400"} />
          </div>
          {/* Barre progression mensuelle */}
          <div className="mt-2 bg-zinc-800/80 rounded-xl p-3 space-y-2">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>Progression bénéfice mensuel</span>
              <span>{mensuel.progression_pct}% · objectif {fmtDA(mensuel.objectif_benefice)}</span>
            </div>
            <ProgressBar value={mensuel.benefice_mois} max={mensuel.objectif_benefice}
              color={mensuel.progression_pct >= 80 ? "bg-emerald-500" : mensuel.progression_pct >= 50 ? "bg-yellow-400" : "bg-orange-500"} />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Card icon="🛒" label="Bénéfice boutique"
              value={fmtDA(benef.boutique)}
              sub={`Marge ${fmtPct(benef.taux_marge_boutique)}`}
              valueColor="text-purple-400" />
            <Card icon="🖥️" label="Bénéfice POS (encaissé)"
              value={fmtDA(benef.pos)}
              sub={`Marge ${fmtPct(benef.taux_marge_pos)}`}
              valueColor="text-blue-400" />
          </div>
        </Section>

        {/* ── Commandes boutique ─────────────────────────────── */}
        <Section title={`📦 Commandes boutique — ${date}`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Card icon="📥" label="Récoltées (boutique)" value={d?.boutique?.recoltes} />
            <Card icon="✅" label="Confirmées"
              value={`${d?.boutique?.confirmees} · ${fmtPct(d?.boutique?.taux_confirmation)}`}
              valueColor={d?.boutique?.taux_confirmation >= 75 ? "text-emerald-400" : d?.boutique?.taux_confirmation >= 60 ? "text-yellow-400" : "text-red-400"}
              alert={d?.boutique?.taux_confirmation < 60} />
            <Card icon="❌" label="Annulées" value={d?.boutique?.annulees} valueColor="text-red-400" />
            <Card icon="⏳" label="En attente" value={d?.boutique?.attente} valueColor="text-yellow-400" />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <Card icon="💰" label="Ventes confirmées" value={fmtDA(d?.boutique?.ca_confirme)} valueColor="text-emerald-400" />
            <Card icon="🛒" label="Panier moyen" value={fmtDA(d?.boutique?.panier_moyen)} />
            <Card icon="🚀" label="Injectés ZR" value={d?.boutique?.injectees} />
          </div>
        </Section>

        {/* ── POS Comptoir ───────────────────────────────────── */}
        <Section title="🖥️ POS Comptoir (encaissé sur place)">
          <div className="grid grid-cols-3 gap-2">
            <Card icon="💼" label="Ventes POS" value={d?.pos?.nb_ventes} valueColor="text-blue-400" />
            <Card icon="💵" label="CA POS" value={fmtDA(d?.pos?.ca_pos)} valueColor="text-blue-400" />
            <Card icon="💎" label="Bénéfice POS" value={fmtDA(benef.pos)} valueColor="text-emerald-400"
              sub={`Marge ${fmtPct(benef.taux_marge_pos)}`} />
          </div>
        </Section>


        {/* ── Clients & Fidélité ─────────────────────────────── */}
        <Section title="👥 Clients & Fidélité">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Card icon="🆕" label="Nouveaux clients" value={clients.nouveaux}
              sub="1ère commande" valueColor="text-emerald-400" />
            <Card icon="🔁" label="Clients fidèles" value={clients.fidelite_count}
              sub="Déjà commandé" valueColor="text-blue-400" />
            <Card icon="❤️" label="Taux fidélité"
              value={fmtPct(clients.taux_fidelite)}
              valueColor={clients.taux_fidelite >= 30 ? "text-emerald-400" : "text-yellow-400"} />
            <Card icon="👤" label="Total clients" value={clients.total_today} sub="Phones uniques" />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Card icon="🆕" label="Panier moyen nouveaux" value={fmtDA(clients.pm_nouveaux)} />
            <Card icon="🔁" label="Panier moyen fidèles"
              value={fmtDA(clients.pm_fidelite)}
              valueColor={clients.pm_fidelite > clients.pm_nouveaux ? "text-emerald-400" : "text-white"} />
          </div>
        </Section>

        {/* ── Mensuel ────────────────────────────────────────── */}
        <Section title="📅 Résumé mensuel">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Card icon="💎" label="Bénéfice mois" value={fmtDA(mensuel.benefice_mois)}
              sub={`Marge ${fmtPct(mensuel.taux_marge_mois)}`} valueColor="text-emerald-400" />
            <Card icon="📦" label="Commandes boutique" value={mensuel.commandes_mois} sub="Confirmées" />
            <Card icon="🖥️" label="Ventes POS mois" value={mensuel.ventes_pos_mois} />
            <Card icon="🛒" label="CA boutique mois" value={fmtDA(mensuel.ca_mois_boutique)} valueColor="text-purple-400" />
            <Card icon="🖥️" label="CA POS mois" value={fmtDA(mensuel.ca_mois_pos)} valueColor="text-blue-400" />
            <Card icon="📊" label="CA total mois" value={fmtDA(mensuel.ca_mois_total)} />
          </div>
        </Section>


        {/* ── Finance ────────────────────────────────────────── */}
        <Section title="💰 Caisse & Finance">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Card icon="⬆️" label="Entrées caisse" value={fmtDA(finance.entrees_caisse)} valueColor="text-emerald-400" />
            <Card icon="⬇️" label="Sorties caisse" value={fmtDA(finance.sorties_caisse)} valueColor="text-red-400" />
            <Card icon="📊" label="Solde net"
              value={fmtDA(finance.solde_net)}
              valueColor={finance.solde_net >= 0 ? "text-emerald-400" : "text-red-400"} />
            <Card icon="🏦" label="Récettes agents" value={fmtDA(finance.recettes_agents)} />
            <Card icon="⚠️" label="Écart caisse"
              value={fmtDA(finance.ecart_recettes)}
              alert={finance.ecart_recettes > 500}
              valueColor={finance.ecart_recettes > 500 ? "text-red-400" : "text-emerald-400"} />
            <Card icon="📉" label="Dette fournisseur"
              value={fmtDA(finance.dette_totale)}
              sub="Initiale + mois courant"
              valueColor={finance.dette_totale > 500000 ? "text-red-400" : "text-yellow-400"} />
          </div>
        </Section>

        {/* ── Stock ──────────────────────────────────────────── */}
        <Section title="📦 Stock">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Card icon="🚨" label="Ruptures"
              value={stock.nb_ruptures}
              alert={stock.nb_ruptures > 50}
              valueColor={stock.nb_ruptures > 100 ? "text-red-400" : stock.nb_ruptures > 50 ? "text-orange-400" : "text-yellow-400"} />
            <Card icon="🏷️" label="Valeur stock (achat)"
              value={`${((stock.valeur_stock_achat || 0) / 1000000).toFixed(2)}M DA`}
              sub={stock.nb_sans_prix_achat > 0
                ? `⚠️ ${stock.nb_sans_prix_achat} articles sans prix achat (${stock.unites_sans_prix_achat} unités non comptées)`
                : "✅ Tous les prix renseignés"}
              valueColor="text-blue-400"
              alert={stock.nb_sans_prix_achat > 0} />
            <Card icon="💼" label="Valeur stock (vente)"
              value={`${((stock.valeur_stock_vente || 0) / 1000000).toFixed(2)}M DA`}
              sub="Si tout vendus au prix catalogue" />
            <Card icon="💎" label="Marge potentielle"
              value={`${((stock.marge_potentielle_stock || 0) / 1000000).toFixed(2)}M DA`}
              sub="Profit si tout vendus"
              valueColor="text-emerald-400" />
          </div>
        </Section>

        {/* ── Agents ─────────────────────────────────────────── */}
        {d?.agents?.length > 0 && (
          <Section title="🤝 Performance Équipe (boutique)">
            <div className="bg-zinc-800/80 rounded-xl p-4">
              <div className="flex justify-between text-[11px] text-zinc-500 pb-2 border-b border-zinc-700/50">
                <span>Agent</span>
                <div className="flex gap-4"><span>Conf/Trait</span><span className="w-11 text-right">Taux</span><span className="w-24 text-right">Ventes</span></div>
              </div>
              {d.agents.map((a) => {
                const color = a.taux >= 75 ? "text-emerald-400" : a.taux >= 50 ? "text-yellow-400" : "text-red-400";
                return (
                  <div key={a.agent} className="flex items-center gap-2 py-2 border-b border-zinc-700/40 last:border-0">
                    <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {(a.agent || "?")[0].toUpperCase()}
                    </div>
                    <span className="text-sm text-white flex-1 truncate">{a.agent}</span>
                    <span className="text-xs text-zinc-400">{a.confirmees}/{a.traitees}</span>
                    <span className={`text-xs font-bold w-11 text-right ${color}`}>{a.taux}%</span>
                    <span className="text-xs text-zinc-500 w-24 text-right">{fmt(a.ca)} DA</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── Boutique en ligne (marketing) ──────────────────── */}
        <Section title="📱 Boutique en ligne">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Card icon="👁" label="Visiteurs uniques" value={mkt.visiteurs_uniques} />
            <Card icon="🎯" label="Taux conversion"
              value={fmtPct(mkt.taux_conversion)}
              valueColor={mkt.taux_conversion >= 2 ? "text-emerald-400" : "text-yellow-400"} />
            <Card icon="🛒" label="Paniers abandonnés" value={mkt.paniers_abandonnes} valueColor="text-orange-400" />
            <Card icon="📣" label="Top source" value={mkt.top_utm || "Organique"} />
          </div>
          {mkt.utm_sources?.length > 0 && (
            <div className="mt-2 bg-zinc-800/80 rounded-xl p-3">
              <p className="text-[11px] text-zinc-500 mb-2 font-semibold uppercase tracking-wide">Sources de trafic</p>
              <div className="flex flex-wrap gap-2">
                {mkt.utm_sources.map(({ source, count }) => (
                  <span key={source} className="text-xs bg-zinc-700 rounded-full px-3 py-1 text-zinc-300">
                    {source} <span className="text-zinc-500">({count})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* ── WhatsApp Marketing ─────────────────────────────── */}
        <Section title="📲 WhatsApp Marketing (campagnes)">
          {wapp.envoyes === 0 ? (
            <div className="bg-zinc-800/60 rounded-xl p-4 text-center text-zinc-500 text-sm">
              Aucun message WhatsApp envoyé aujourd'hui
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Card icon="📤" label="Messages envoyés" value={wapp.envoyes} valueColor="text-blue-400" />
                <Card icon="👁" label="Lus"
                  value={`${wapp.lus} · ${fmtPct(wapp.taux_lecture)}`}
                  valueColor={wapp.taux_lecture >= 70 ? "text-emerald-400" : "text-yellow-400"} />
                <Card icon="🛍️" label="Convertis"
                  value={`${wapp.convertis} · ${fmtPct(wapp.taux_conversion)}`}
                  valueColor={wapp.convertis > 0 ? "text-emerald-400" : "text-zinc-400"} />
              </div>
              <div className="mt-2 bg-zinc-800/80 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">Revenus attribués WhatsApp</p>
                  <p className="text-lg font-black text-emerald-400">{fmtDA(wapp.revenue_da)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500">Taux conversion</p>
                  <p className={`text-2xl font-black ${wapp.taux_conversion >= 5 ? "text-emerald-400" : wapp.taux_conversion > 0 ? "text-yellow-400" : "text-zinc-600"}`}>
                    {fmtPct(wapp.taux_conversion)}
                  </p>
                </div>
              </div>
            </>
          )}
        </Section>

        {/* ── Évolution J-1 ──────────────────────────────────── */}
        <Section title="📈 Évolution vs hier (J-1)">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-zinc-800/80 rounded-xl p-3 flex flex-col gap-1">
              <p className="text-xs text-zinc-500">📦 Récoltées</p>
              <p className="text-lg font-black text-white">{recoltes} <span className="text-sm font-normal text-zinc-500">auj.</span></p>
              <Delta value={j1.delta_recoltes} suffix=" cmd" />
            </div>
            <div className="bg-zinc-800/80 rounded-xl p-3 flex flex-col gap-1">
              <p className="text-xs text-zinc-500">✅ Confirmées</p>
              <p className="text-lg font-black text-white">{d?.boutique?.confirmees} <span className="text-sm font-normal text-zinc-500">auj.</span></p>
              <Delta value={j1.delta_confirmees} suffix=" cmd" />
            </div>
            <div className="bg-zinc-800/80 rounded-xl p-3 flex flex-col gap-1">
              <p className="text-xs text-zinc-500">💰 CA total</p>
              <p className="text-lg font-black text-white">{fmtDA(ca_total_jour)}</p>
              <Delta value={j1.delta_ca} prefix="" suffix=" DA" />
            </div>
            <div className="bg-zinc-800/80 rounded-xl p-3 flex flex-col gap-1">
              <p className="text-xs text-zinc-500">💎 Bénéfice</p>
              <p className="text-lg font-black text-emerald-400">{fmtDA(benef.total_jour)}</p>
              <Delta value={j1.delta_benefice} suffix=" DA" />
            </div>
          </div>
        </Section>

        {/* ── Graphe 30 jours ────────────────────────────────── */}
        <Section title="📊 Évolution 30 jours (confirmées · bénéfice · POS)">
          <div className="bg-zinc-800/80 rounded-xl p-4">
            <MultiLineChart data={d?.byDay30} />
          </div>
        </Section>

      </div>
    </div>
  );
}
