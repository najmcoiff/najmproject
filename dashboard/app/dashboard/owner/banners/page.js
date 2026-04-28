"use client";
import { useState, useEffect } from "react";
import { getSession } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const sbAnon = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function getToken() { return getSession()?.token || ""; }

export default function BannersPage() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(null);
  const [error,   setError]   = useState("");
  const [newBanner, setNewBanner] = useState({ world: "both", image_url: "", link_url: "", alt_text: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
      // Utiliser fetch direct (service role non dispo côté client)
      const res = await fetch(`${SURL}/rest/v1/nc_banners?select=*&order=sort_order.asc`, {
        headers: { apikey: SKEY, Authorization: `Bearer ${getToken()}` },
      });
      const d = await res.json();
      setRows(Array.isArray(d) ? d : []);
    } catch { setError("Erreur chargement"); }
    finally { setLoading(false); }
  }

  async function create() {
    if (!newBanner.image_url.trim()) { setError("URL image requise"); return; }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/sb-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: getToken(),
          table: "nc_banners",
          data: { ...newBanner, sort_order: rows.length, is_active: true },
        }),
      });
      const d = await res.json();
      if (d.ok || d.id) {
        setNewBanner({ world: "both", image_url: "", link_url: "", alt_text: "" });
        await load();
      } else { setError(d.error || "Erreur"); }
    } catch { setError("Erreur réseau"); }
    finally { setCreating(false); }
  }

  async function toggleBanner(row) {
    setSaving(row.id);
    try {
      await fetch("/api/sb-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: getToken(),
          table: "nc_banners",
          data: { id: row.id, is_active: !row.is_active },
        }),
      });
      setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, is_active: !r.is_active } : r));
    } catch {}
    finally { setSaving(null); }
  }

  if (loading) return <div className="text-gray-400 text-sm">Chargement…</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">🖼️ Bannières boutique</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
          {error} <button onClick={() => setError("")} className="ml-2">✕</button>
        </div>
      )}

      {/* Ajouter une bannière */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
        <h2 className="text-sm font-bold text-gray-700 mb-3">Ajouter une bannière</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Monde</label>
              <select value={newBanner.world} onChange={(e) => setNewBanner({ ...newBanner, world: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="both">Les deux</option>
                <option value="coiffure">Coiffure</option>
                <option value="onglerie">Onglerie</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Alt text</label>
              <input type="text" value={newBanner.alt_text}
                onChange={(e) => setNewBanner({ ...newBanner, alt_text: e.target.value })}
                placeholder="Description image" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">URL image *</label>
            <input type="url" value={newBanner.image_url}
              onChange={(e) => setNewBanner({ ...newBanner, image_url: e.target.value })}
              placeholder="https://..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">URL lien (optionnel)</label>
            <input type="url" value={newBanner.link_url}
              onChange={(e) => setNewBanner({ ...newBanner, link_url: e.target.value })}
              placeholder="https://..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button onClick={create} disabled={creating}
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition disabled:opacity-50">
            {creating ? "Ajout…" : "Ajouter la bannière"}
          </button>
        </div>
      </div>

      {/* Liste bannières */}
      {rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-100">
          Aucune bannière — ajoutez-en une ci-dessus
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id}
              className={`bg-white rounded-xl border p-4 flex items-center gap-4 ${row.is_active ? "border-gray-100" : "border-gray-100 opacity-50"}`}>
              <div className="w-24 h-14 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                {row.image_url ? (
                  <img src={row.image_url} alt={row.alt_text || ""} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">Pas d'image</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{row.alt_text || row.image_url}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    row.world === "coiffure" ? "bg-red-100 text-red-700" :
                    row.world === "onglerie" ? "bg-pink-100 text-pink-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>{row.world}</span>
                  {row.link_url && <span className="text-xs text-blue-500 truncate max-w-[150px]">{row.link_url}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {row.is_active ? "Actif" : "Inactif"}
                </span>
                <button onClick={() => toggleBanner(row)} disabled={saving === row.id}
                  className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition">
                  {saving === row.id ? "…" : row.is_active ? "Désactiver" : "Activer"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
