"use client";
import { useState, useEffect } from "react";
import { getSession } from "@/lib/auth";

function getToken() { return getSession()?.token || ""; }
const SITE = "https://www.najmcoiff.com";

export default function AmbassadeursOwnerPage() {
  const [pending, setPending] = useState([]);
  const [active, setActive]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/ambassadeur/manage", { headers: { Authorization: `Bearer ${getToken()}` } });
      const d = await r.json();
      setPending(d.pending || []);
      setActive(d.active || []);
    } catch {}
    finally { setLoading(false); }
  }

  async function setActif(phone, val) {
    setBusy(phone);
    try {
      await fetch("/api/ambassadeur/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ phone, active: val }),
      });
      await load();
    } catch {}
    finally { setBusy(""); }
  }

  function waLink(row) {
    const phone = String(row.phone || "").replace(/\D/g, "").slice(-9);
    const first = (row.full_name || "").trim().split(/\s+/)[0] || "";
    const space = `${SITE}/coiffeur/${row.code}`;
    const msg =
      `مرحبا ${first} 👑\n` +
      `تم تفعيل حسابك كشريك نجم كواف!\n` +
      `هذا فضاؤك الخاص: ${space}\n` +
      `كودك: ${row.code} — شاركه مع زبائنك وابدأ تربح.`;
    return `https://wa.me/213${phone}?text=${encodeURIComponent(msg)}`;
  }

  if (loading) return <div className="text-gray-400 text-sm">Chargement…</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">👑 Ambassadeurs coiffeurs</h1>
      <p className="text-sm text-gray-500 mb-6">Valide les inscriptions, puis envoie le lien par WhatsApp.</p>

      {/* En attente */}
      <h2 className="text-sm font-bold text-gray-700 mb-3">
        ⏳ En attente <span className="text-gray-400 font-normal">({pending.length})</span>
      </h2>
      {pending.length === 0 ? (
        <p className="text-sm text-gray-400 mb-8">Aucune inscription en attente.</p>
      ) : (
        <div className="space-y-2.5 mb-8">
          {pending.map((r) => (
            <div key={r.phone} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 text-sm">{r.full_name || "—"}</div>
                <div className="text-xs text-gray-500 mt-0.5" dir="ltr">0{r.phone} · {r.salon || "—"}</div>
              </div>
              <button onClick={() => setActif(r.phone, true)} disabled={busy === r.phone}
                className="flex-none bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50">
                {busy === r.phone ? "…" : "Activer"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Actifs */}
      <h2 className="text-sm font-bold text-gray-700 mb-3">
        ✅ Actifs <span className="text-gray-400 font-normal">({active.length})</span>
      </h2>
      {active.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun ambassadeur actif.</p>
      ) : (
        <div className="space-y-2.5">
          {active.map((r) => (
            <div key={r.phone} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 text-sm">{r.full_name || "—"}</div>
                  <div className="text-xs text-gray-500 mt-0.5" dir="ltr">{r.code} · 0{r.phone}</div>
                </div>
                <div className="flex-none text-right">
                  <div className="text-sm font-bold text-gray-900">{(r.cagnotte_da || 0).toLocaleString("fr-FR")} DA</div>
                  <div className="text-[11px] text-gray-400">{r.total_filleuls || 0} clients</div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <a href={waLink(r)} target="_blank" rel="noopener noreferrer"
                  className="flex-1 text-center bg-[#1FA855] hover:brightness-105 text-white text-sm font-semibold rounded-lg py-2">
                  Envoyer WhatsApp
                </a>
                <button onClick={() => setActif(r.phone, false)} disabled={busy === r.phone}
                  className="flex-none border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-300 text-sm rounded-lg px-3 py-2">
                  Désactiver
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
