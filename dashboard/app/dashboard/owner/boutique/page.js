"use client";
import { useState, useEffect } from "react";
import { getSession } from "@/lib/auth";

const LABELS = {
  whatsapp_number:      { label: "Numéro WhatsApp",         hint: "Format : 213XXXXXXXXX", type: "text" },
  promo_banner_text:    { label: "Texte barre promo",        hint: "Laisser vide pour désactiver", type: "text" },
  promo_banner_active:  { label: "Barre promo active",       hint: "true ou false", type: "select", opts: ["true","false"] },
  site_name:            { label: "Nom du site",              hint: "Affiché dans le header", type: "text" },
  facebook_coiffure:    { label: "Lien Facebook Coiffure",   hint: "https://fb.com/...", type: "text" },
  instagram_handle:     { label: "Handle Instagram",         hint: "@najmcoiff", type: "text" },
  meta_pixel_coiffure:  { label: "Pixel Facebook Coiffure",  hint: "ID numérique (15 chiffres)", type: "text" },
  meta_pixel_onglerie:  { label: "Pixel Facebook Onglerie",  hint: "ID numérique (15 chiffres)", type: "text" },
};

export default function BoutiqueConfigPage() {
  const [config, setConfig]   = useState({});
  const [saving, setSaving]   = useState(null);
  const [saved,  setSaved]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,  setError]    = useState("");

  function getToken() {
    const s = getSession();
    return s?.token || "";
  }

  useEffect(() => {
    fetch("/api/owner/config", {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((d) => {
        const map = {};
        (d.config || []).forEach((row) => { map[row.key] = row.value; });
        setConfig(map);
      })
      .catch(() => setError("Erreur de chargement"))
      .finally(() => setLoading(false));
  }, []);

  async function save(key, value) {
    setSaving(key);
    setSaved(null);
    try {
      const res = await fetch("/api/owner/config", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body:    JSON.stringify({ key, value }),
      });
      const d = await res.json();
      if (d.ok) {
        setConfig((c) => ({ ...c, [key]: value }));
        setSaved(key);
        setTimeout(() => setSaved(null), 2500);
      } else {
        setError(d.error || "Erreur");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="text-gray-400 text-sm">Chargement…</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">⚙️ Paramètres boutique</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-5">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(LABELS).map(([key, meta]) => (
          <ConfigRow
            key={key}
            keyName={key}
            value={config[key] ?? ""}
            meta={meta}
            saving={saving === key}
            saved={saved === key}
            onSave={save}
          />
        ))}
      </div>
    </div>
  );
}

function ConfigRow({ keyName, value, meta, saving, saved, onSave }) {
  const [local, setLocal] = useState(value);
  const dirty = local !== value;

  useEffect(() => { setLocal(value); }, [value]);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <label className="block text-sm font-semibold text-gray-800 mb-1">
            {meta.label}
          </label>
          <p className="text-xs text-gray-400 mb-2">{meta.hint}</p>
          {meta.type === "select" ? (
            <select
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
            >
              {(meta.opts || []).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && dirty) onSave(keyName, local); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
              dir={keyName === "site_name" ? "rtl" : "ltr"}
            />
          )}
        </div>
        <div className="flex items-end pb-0.5">
          {saved ? (
            <span className="text-xs text-green-600 font-semibold">✓ Sauvegardé</span>
          ) : (
            <button
              onClick={() => onSave(keyName, local)}
              disabled={!dirty || saving}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${
                dirty && !saving
                  ? "bg-gray-900 text-white hover:bg-gray-700"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {saving ? "…" : "Sauvegarder"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
