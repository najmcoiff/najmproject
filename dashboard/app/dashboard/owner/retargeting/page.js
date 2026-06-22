"use client";
import { useState, useEffect, useCallback } from "react";
import { getSession } from "@/lib/auth";

function getToken() { return getSession()?.token || ""; }
const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");
const fmtDA = (n) => `${fmt(Math.round(n ?? 0))} DA`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—";

const SEG_LABELS = {
  vip: "VIP", active: "Actifs",
  dormant_30: "Dormant 30j", dormant_60: "Dormant 60j", dormant_90: "Dormant 90j+",
};

function Kpi({ label, value, sub, tone = "white" }) {
  const tones = {
    white: "bg-white border-gray-200",
    green: "bg-green-50 border-green-100",
    red:   "bg-red-50 border-red-100",
    blue:  "bg-blue-50 border-blue-100",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="text-2xl font-bold text-gray-900 leading-none">{value}</div>
      <div className="text-xs font-medium text-gray-600 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function RetargetingPage() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/marketing/retargeting-stats", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Erreur");
      setData(d);
    } catch (e) { setError(String(e.message || e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-gray-400 text-sm">Chargement des statistiques…</div>;
  if (error)   return <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>;
  if (!data)   return null;

  const { reach, segments, audience, codes, templates, generated_at, sending_enabled } = data;
  const campaignCodes = codes.filter((c) => c.is_campaign);
  const partnerCodes  = codes.filter((c) => !c.is_campaign && c.orders_total > 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">🎯 Retargeting & Codes promo</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Mis à jour {new Date(generated_at).toLocaleString("fr-FR")}
          </p>
        </div>
        <button onClick={load} className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700">
          ↻ Rafraîchir
        </button>
      </div>

      {/* Bandeau état des relances auto */}
      <div className={`rounded-xl border px-4 py-3 text-sm ${sending_enabled ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
        {sending_enabled
          ? "✅ Relances WhatsApp automatiques ACTIVES."
          : "⛔ Relances WhatsApp automatiques COUPÉES (react30/react60). La segmentation continue. Réactivation prévue avec un nouveau plan."}
      </div>

      {/* Portée globale */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Numéros uniques contactés" value={fmt(reach.unique_contacted)} sub="tous templates" />
        <Kpi label="Messages envoyés (total)" value={fmt(reach.total_messages)} />
        <Kpi label="Codes avec ventes" value={fmt(codes.filter((c) => c.orders_total > 0).length)} />
        <Kpi label="Clients réels (avec tél.)" value={fmt(audience?.total_customers)} sub="boutique + anciens" />
      </div>

      {/* Codes de campagne (retargeting) */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Campagnes retargeting</h2>
        <div className="space-y-3">
          {campaignCodes.map((c) => <CodeCard key={c.code} c={c} />)}
        </div>
      </section>

      {/* Audience réelle & cibles */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Audience réelle (calculée en direct)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Kpi label="Actifs (<30j)"   value={fmt(audience?.active)} tone="green" />
          <Kpi label="Dormant 30-60j"  value={fmt(audience?.dormant_30)} />
          <Kpi label="Dormant 60-90j"  value={fmt(audience?.dormant_60)} />
          <Kpi label="Dormant 90j+"    value={fmt(audience?.dormant_90)} tone="red" />
          <Kpi label="VIP (≥5 cmd / >50k)" value={fmt(audience?.vip)} sub={`${fmt(audience?.vip_eligible)} éligibles`} tone="blue" />
        </div>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          💡 <b>Réservoir à réactiver</b> : {fmt(audience?.anciens)} anciens clients (ère Shopify, 90j+),
          dont <b>{fmt(audience?.anciens_eligible)}</b> jamais recontactés → c'est la vraie cible de win-back
          (envoi unique recommandé, après batch test).
        </div>
      </section>

      {/* Codes partenaires (avec ventes) */}
      {partnerCodes.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Codes partenaires (avec ventes)</h2>
          <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-3 py-2.5 font-medium">Code</th>
                  <th className="text-right px-3 py-2.5 font-medium">Cmd</th>
                  <th className="text-right px-3 py-2.5 font-medium">Confirmées</th>
                  <th className="text-right px-3 py-2.5 font-medium">CA confirmé</th>
                  <th className="text-right px-3 py-2.5 font-medium">Remise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {partnerCodes.map((c) => (
                  <tr key={c.code}>
                    <td className="px-3 py-2.5 font-mono font-bold text-gray-800">{c.code}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmt(c.orders_total)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmt(c.confirmed)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-800">{fmtDA(c.ca_confirmed)}</td>
                    <td className="px-3 py-2.5 text-right text-amber-600">{fmtDA(c.discount_confirmed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Détail des envois par template */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Envois par template</h2>
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 font-medium">Template</th>
                <th className="text-right px-3 py-2.5 font-medium">Numéros uniques</th>
                <th className="text-right px-3 py-2.5 font-medium">Messages</th>
                <th className="text-right px-3 py-2.5 font-medium">Dernier envoi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {templates.map((t) => (
                <tr key={t.template_name}>
                  <td className="px-3 py-2.5 font-mono text-gray-700">{t.template_name}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{fmt(t.sent_unique)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{fmt(t.sent_total)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-400">{fmtDate(t.last_sent_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-gray-400">
        Attribution par code promo posé sur la commande. Marge nette estimée ≈ remise accordée
        (la remise = 50 % de la marge). Profit net = marge nette − coût des messages ({data.msg_cost_da} DA/msg).
        N'inclut pas frais de livraison ni retours COD.
      </p>
    </div>
  );
}

function CodeCard({ c }) {
  const profit = c.net_profit_est;
  const profitTone = profit > 0 ? "text-green-600" : profit < 0 ? "text-red-600" : "text-gray-500";
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-gray-900">{c.code}</span>
          {c.percentage != null && <span className="text-xs text-amber-600 font-medium">−{c.percentage}% marge</span>}
          {c.active === false && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">inactif</span>}
        </div>
        <div className={`text-sm font-bold ${profitTone}`}>
          {profit >= 0 ? "+" : ""}{fmtDA(profit)} <span className="text-xs font-normal text-gray-400">profit net est.</span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <Mini label="Contactés" value={fmt(c.sent_unique)} sub={c.sent_total > c.sent_unique ? `${fmt(c.sent_total)} msg` : null} />
        <Mini label="Ont acheté" value={fmt(c.buyers_unique)} sub={c.conversion_pct != null ? `${c.conversion_pct}% conv.` : null} />
        <Mini label="Commandes" value={fmt(c.orders_total)} sub={`${fmt(c.confirmed)} conf. · ${fmt(c.cancelled)} annul.`} />
        <Mini label="CA confirmé" value={fmtDA(c.ca_confirmed)} sub={`panier ${fmtDA(c.avg_basket)}`} />
      </div>
      <div className="mt-2 text-xs text-gray-400">
        Remise donnée : {fmtDA(c.discount_confirmed)} · Coût messages : {fmtDA(c.msg_cost)}
        {c.last_sent_at && ` · Dernier envoi : ${fmtDate(c.last_sent_at)}`}
      </div>
    </div>
  );
}

function Mini({ label, value, sub }) {
  return (
    <div>
      <div className="text-lg font-bold text-gray-900 leading-none">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
