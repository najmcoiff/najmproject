"use client";
import { useState, useEffect } from "react";
import { getSession } from "@/lib/auth";

function getToken() { return getSession()?.token || ""; }

export default function PartenairesOwnerPage() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState({ code: "", nom: "", percentage: 50 });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/partenaires", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const d = await r.json();
      setRows(d.partenaires || d || []);
    } catch { setError("Erreur chargement"); }
    finally { setLoading(false); }
  }

  async function toggle(row) {
    try {
      const res = await fetch("/api/partenaires", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ ...row, active: !row.active }),
      });
      const d = await res.json();
      if (d.ok || d.id) {
        setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, active: !r.active } : r));
      }
    } catch {}
  }

  async function create() {
    if (!newCode.code.trim()) { setError("Code requis"); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/partenaires", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ ...newCode, code: newCode.code.toUpperCase().trim() }),
      });
      const d = await res.json();
      if (d.ok || d.id || d.code) {
        setSuccess("Code créé !");
        setNewCode({ code: "", nom: "", percentage: 50 });
        await load();
        setTimeout(() => setSuccess(""), 3000);
      } else { setError(d.error || "Erreur"); }
    } catch { setError("Erreur réseau"); }
    finally { setCreating(false); }
  }

  if (loading) return <div className="text-gray-400 text-sm">Chargement…</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">🤝 Codes partenaires</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
          {error} <button onClick={() => setError("")} className="ml-2">✕</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 mb-4">
          ✓ {success}
        </div>
      )}

      {/* Formulaire nouveau code */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
        <h2 className="text-sm font-bold text-gray-700 mb-3">Nouveau code partenaire</h2>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Code (ex: PARTNER10)</label>
            <input type="text" value={newCode.code}
              onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })}
              placeholder="PARTNER10" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nom partenaire</label>
            <input type="text" value={newCode.nom}
              onChange={(e) => setNewCode({ ...newCode, nom: e.target.value })}
              placeholder="Ali Salon" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Remise (%)</label>
            <input type="number" value={newCode.percentage} min="1" max="100"
              onChange={(e) => setNewCode({ ...newCode, percentage: Number(e.target.value) })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button onClick={create} disabled={creating}
          className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition disabled:opacity-50">
          {creating ? "Création…" : "Créer le code"}
        </button>
      </div>

      {/* Liste codes */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-2.5 font-medium">Code</th>
              <th className="text-left px-4 py-2.5 font-medium">Partenaire</th>
              <th className="text-center px-4 py-2.5 font-medium">Remise</th>
              <th className="text-center px-4 py-2.5 font-medium">Statut</th>
              <th className="text-right px-4 py-2.5 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">Aucun code</td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className={row.active ? "" : "opacity-50"}>
                <td className="px-4 py-3 font-mono font-bold text-gray-800">{row.code}</td>
                <td className="px-4 py-3 text-gray-600">{row.nom || "—"}</td>
                <td className="px-4 py-3 text-center">
                  <span className="font-bold text-amber-600">{row.percentage}%</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {row.active ? "Actif" : "Inactif"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => toggle(row)}
                    className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition">
                    {row.active ? "Désactiver" : "Activer"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
