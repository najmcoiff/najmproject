"use client";
import { useState, useEffect } from "react";
import { getSession } from "@/lib/auth";

function getToken() { return getSession()?.token || ""; }

export default function LivraisonPage() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(null);
  const [error,   setError]   = useState("");
  const [search,  setSearch]  = useState("");
  const [editing, setEditing] = useState(null); // { id, price_home, price_office }

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/owner/livraison", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const d = await r.json();
      setRows(d.rows || []);
    } catch { setError("Erreur de chargement"); }
    finally { setLoading(false); }
  }

  async function saveRow(row) {
    setSaving(row.id);
    try {
      const res = await fetch("/api/owner/livraison", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(row),
      });
      const d = await res.json();
      if (d.ok) {
        setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, ...row } : r));
        setEditing(null);
      } else { setError(d.error || "Erreur"); }
    } catch { setError("Erreur réseau"); }
    finally { setSaving(null); }
  }

  async function toggleActive(row) {
    setSaving(row.id);
    try {
      const res = await fetch("/api/owner/livraison", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ ...row, is_active: !row.is_active }),
      });
      const d = await res.json();
      if (d.ok) setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, is_active: !r.is_active } : r));
    } catch {}
    finally { setSaving(null); }
  }

  const filtered = rows.filter((r) =>
    !search || r.wilaya_name.toLowerCase().includes(search.toLowerCase()) ||
    String(r.wilaya_code).includes(search)
  );

  // Grouper par wilaya
  const groups = {};
  filtered.forEach((r) => {
    if (!groups[r.wilaya_code]) groups[r.wilaya_code] = { name: r.wilaya_name, rows: [] };
    groups[r.wilaya_code].rows.push(r);
  });

  if (loading) return <div className="text-gray-400 text-sm">Chargement…</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">🚚 Prix livraison</h1>
        <span className="text-sm text-gray-500">{rows.length} zones configurées</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une wilaya…"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gray-400"
        />
      </div>

      <div className="space-y-3">
        {Object.entries(groups).map(([code, { name, rows: groupRows }]) => (
          <div key={code} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-700">{code} — {name}</span>
              <span className="text-xs text-gray-400">{groupRows.length} zone{groupRows.length > 1 ? "s" : ""}</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-50">
                  <th className="text-left px-4 py-2 font-medium">Commune</th>
                  <th className="text-right px-4 py-2 font-medium">Domicile</th>
                  <th className="text-right px-4 py-2 font-medium">Bureau</th>
                  <th className="text-right px-4 py-2 font-medium">Statut</th>
                  <th className="text-right px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {groupRows.map((row) => (
                  <tr key={row.id} className={row.is_active ? "" : "opacity-40"}>
                    <td className="px-4 py-2.5 text-gray-700">{row.commune_name || <span className="text-gray-400 italic">Toute la wilaya</span>}</td>
                    {editing?.id === row.id ? (
                      <>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            value={editing.price_home}
                            onChange={(e) => setEditing({ ...editing, price_home: Number(e.target.value) })}
                            className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            value={editing.price_office}
                            onChange={(e) => setEditing({ ...editing, price_office: Number(e.target.value) })}
                            className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right"
                          />
                        </td>
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => saveRow({ ...row, ...editing })}
                            disabled={saving === row.id}
                            className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg mr-1 hover:bg-gray-700 transition"
                          >
                            {saving === row.id ? "…" : "✓"}
                          </button>
                          <button onClick={() => setEditing(null)} className="text-xs text-gray-400 hover:text-gray-600">
                            ✕
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-800">{row.price_home} DA</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-800">{row.price_office} DA</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {row.is_active ? "Actif" : "Inactif"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right space-x-1">
                          <button
                            onClick={() => setEditing({ id: row.id, price_home: row.price_home, price_office: row.price_office })}
                            className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition"
                          >
                            Modifier
                          </button>
                          <button
                            onClick={() => toggleActive(row)}
                            disabled={saving === row.id}
                            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition"
                          >
                            {row.is_active ? "Désactiver" : "Activer"}
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
