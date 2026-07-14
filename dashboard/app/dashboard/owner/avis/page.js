"use client";
import { useState, useEffect } from "react";
import { getSession } from "@/lib/auth";

function getToken() { return getSession()?.token || ""; }

export default function AvisOwnerPage() {
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ author_name: "", author_city: "", body: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/ambassadeur/avis", { headers: { Authorization: `Bearer ${getToken()}` } });
      const d = await r.json();
      setPending(d.pending || []);
      setApproved(d.approved || []);
    } catch {}
    finally { setLoading(false); }
  }

  async function act(action, id) {
    await fetch("/api/ambassadeur/avis", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ action, id }),
    });
    await load();
  }
  async function remove(id) {
    if (!window.confirm("Supprimer ce commentaire ?")) return;
    await fetch(`/api/ambassadeur/avis?id=${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
    await load();
  }
  async function create() {
    if (!form.body.trim()) return;
    await fetch("/api/ambassadeur/avis", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ action: "create", ...form }),
    });
    setForm({ author_name: "", author_city: "", body: "" });
    await load();
  }

  if (loading) return <div className="text-gray-400 text-sm">Chargement…</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">💬 Commentaires ambassadeurs</h1>
      <p className="text-sm text-gray-500 mb-6">Valide les avis des coiffeurs, ou crée les tiens. Les approuvés s'affichent sur la page /partenaire.</p>

      {/* Créer un commentaire */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-8">
        <div className="text-sm font-bold mb-3">➕ Créer un commentaire</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input value={form.author_name} onChange={(e) => setForm({ ...form, author_name: e.target.value })} placeholder="Nom (ex: كريم)" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          <input value={form.author_city} onChange={(e) => setForm({ ...form, author_city: e.target.value })} placeholder="Ville (ex: الجزائر)" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        </div>
        <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={2} placeholder="Le commentaire…" dir="rtl" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm mb-2" />
        <button onClick={create} disabled={!form.body.trim()} className="bg-[#9C7A34] text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-40">Publier</button>
      </div>

      {/* En attente */}
      <h2 className="text-sm font-bold text-gray-700 mb-3">⏳ En attente <span className="text-gray-400 font-normal">({pending.length})</span></h2>
      {pending.length === 0 ? <p className="text-sm text-gray-400 mb-8">Aucun avis en attente.</p> : (
        <div className="space-y-2.5 mb-8">
          {pending.map((a) => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-[13px] text-gray-800" dir="rtl">«{a.body}»</div>
              <div className="text-xs text-gray-400 mt-1">— {a.author_name}{a.author_city ? " · " + a.author_city : ""}</div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => act("approve", a.id)} className="flex-1 bg-green-600 text-white text-sm font-semibold rounded-lg py-2">Approuver</button>
                <button onClick={() => act("reject", a.id)} className="flex-none border border-gray-200 text-gray-500 hover:text-red-600 text-sm rounded-lg px-3 py-2">Rejeter</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Publiés */}
      <h2 className="text-sm font-bold text-gray-700 mb-3">✅ Publiés <span className="text-gray-400 font-normal">({approved.length})</span></h2>
      {approved.length === 0 ? <p className="text-sm text-gray-400">Aucun commentaire publié.</p> : (
        <div className="space-y-2.5">
          {approved.map((a) => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] text-gray-800" dir="rtl">«{a.body}»</div>
                <div className="text-xs text-gray-400 mt-1">— {a.author_name}{a.author_city ? " · " + a.author_city : ""} {a.created_by === "owner" ? "(créé)" : ""}</div>
              </div>
              <button onClick={() => remove(a.id)} title="Supprimer" className="flex-none text-gray-300 hover:text-red-600 text-lg">🗑️</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
