"use client";
import { useState, useEffect } from "react";
import { getSession } from "@/lib/auth";

const EMPTY_FORM = { title: "", world: "coiffure", sort_order: "0", image_url: "" };

export default function CollectionsPage() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [modal, setModal]             = useState(null); // null | 'create' | collection_obj
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [msg, setMsg]                 = useState("");
  const [filterWorld, setFilterWorld] = useState("");

  const token = () => getSession()?.token || "";

  async function fetchCollections() {
    setLoading(true);
    try {
      const qs = filterWorld ? `?world=${filterWorld}` : "";
      const r = await fetch(`/api/owner/collections${qs}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const d = await r.json();
      setCollections(d.collections || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCollections(); }, [filterWorld]);

  async function toggleActive(col) {
    setCollections(prev => prev.map(c => c.collection_id === col.collection_id ? { ...c, active: !c.active } : c));
    await fetch(`/api/owner/collections/${col.collection_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ active: !col.active }),
    });
  }

  async function toggleField(col, field) {
    const newVal = !col[field];
    setCollections(prev => prev.map(c => c.collection_id === col.collection_id ? { ...c, [field]: newVal } : c));
    await fetch(`/api/owner/collections/${col.collection_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: newVal }),
    });
  }

  function openCreate() { setForm(EMPTY_FORM); setModal("create"); setMsg(""); }
  function openEdit(col) {
    setForm({ ...col, sort_order: String(col.sort_order || 0) });
    setModal(col); setMsg("");
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/owner/upload?folder=collections", {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) { setMsg(`❌ ${d.error}`); return; }
      setForm(f => ({ ...f, image_url: d.url }));
    } catch {
      setMsg("❌ Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  }

  async function submitForm(e) {
    e.preventDefault();
    setSaving(true); setMsg("");
    try {
      const payload = { ...form, sort_order: Number(form.sort_order) || 0 };
      let r;
      if (modal === "create") {
        r = await fetch("/api/owner/collections", {
          method: "POST",
          headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        r = await fetch(`/api/owner/collections/${modal.collection_id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const d = await r.json();
      if (!r.ok) { setMsg(`❌ ${d.error}`); return; }
      setMsg("✅ Enregistré");
      setTimeout(() => { setModal(null); fetchCollections(); }, 700);
    } finally {
      setSaving(false);
    }
  }

  const coiffureCount = collections.filter(c => c.world === "coiffure").length;
  const onglerieCount = collections.filter(c => c.world === "onglerie").length;

  return (
    <div className="max-w-4xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Collections</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {collections.length} collections — ✂️ {coiffureCount} Coiffure · 💅 {onglerieCount} Onglerie
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
        >
          + Nouvelle collection
        </button>
      </div>

      {/* Filtre monde */}
      <div className="flex gap-2 mb-5">
        {["", "coiffure", "onglerie"].map(w => (
          <button key={w}
            onClick={() => setFilterWorld(w)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${filterWorld === w ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {w === "" ? "Tous" : w === "coiffure" ? "✂️ Coiffure" : "💅 Onglerie"}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-3">
          {Array(6).fill(null).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : collections.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📂</p>
          <p>Aucune collection trouvée</p>
        </div>
      ) : (
        <div className="space-y-2">
          {collections.map(col => (
            <div
              key={col.collection_id}
              className={`flex flex-col sm:flex-row sm:items-center gap-3 bg-white border border-gray-200 rounded-2xl px-4 py-4 transition-opacity ${!col.active ? "opacity-50" : ""}`}
            >
              {/* Ligne supérieure : image + infos + bouton modifier */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Image ou placeholder */}
                <div className="shrink-0 w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
                  {col.image_url
                    ? <img src={col.image_url} alt={col.title} className="w-full h-full object-cover" />
                    : <span className="text-xl">{col.world === "onglerie" ? "💅" : "✂️"}</span>
                  }
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{col.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${col.world === "onglerie" ? "bg-pink-100 text-pink-700" : "bg-red-50 text-red-700"}`}>
                      {col.world === "onglerie" ? "Onglerie" : "Coiffure"}
                    </span>
                    <span className="text-xs text-gray-400">{col.products_count || 0} articles</span>
                    <span className="text-xs text-gray-300">· ordre {col.sort_order || 0}</span>
                  </div>
                </div>

                {/* Modifier — toujours visible à droite des infos */}
                <button
                  onClick={() => openEdit(col)}
                  className="text-xs text-indigo-600 font-semibold px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 transition-colors shrink-0"
                >
                  Modifier
                </button>
              </div>

              {/* Ligne toggles — wrappable */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => toggleActive(col)}
                  title="Visible en boutique"
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${col.active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                >
                  {col.active ? "✅ Visible" : "🚫 Cachée"}
                </button>
                <button
                  onClick={() => toggleField(col, "show_on_homepage")}
                  title="Afficher dans la page du monde (Coiffure / Onglerie)"
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${col.show_on_homepage ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-gray-100 text-gray-400 hover:bg-gray-200"}`}
                >
                  {col.show_on_homepage ? "🌐 Monde" : "🌐 Off"}
                </button>
                <button
                  onClick={() => toggleField(col, "show_in_filter")}
                  title="Afficher dans le filtre catalogue client"
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${col.show_in_filter ? "bg-blue-100 text-blue-700 hover:bg-blue-200" : "bg-gray-100 text-gray-400 hover:bg-gray-200"}`}
                >
                  {col.show_in_filter ? "🔍 Filtre" : "🔍 Off"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {modal === "create" ? "Nouvelle collection" : `Modifier — ${modal.title}`}
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <form onSubmit={submitForm} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nom de la collection *</label>
                <input required className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Monde *</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
                  value={form.world} onChange={e => setForm(f => ({ ...f, world: e.target.value }))}>
                  <option value="coiffure">✂️ Coiffure</option>
                  <option value="onglerie">💅 Onglerie</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Ordre d'affichage</label>
                <input type="number" min="0" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
                  value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} />
                <p className="text-xs text-gray-400 mt-1">0 = affiché en premier</p>
              </div>

              {/* ── Upload image collection ──────────────────────── */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Photo de la collection</label>
                <div className="flex items-center gap-3">
                  {/* Miniature preview */}
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center shrink-0 border border-gray-200">
                    {form.image_url
                      ? <img src={form.image_url} alt="preview" className="w-full h-full object-cover" />
                      : <span className="text-xl">{form.world === "onglerie" ? "💅" : "✂️"}</span>
                    }
                  </div>
                  <div className="flex-1">
                    <label className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border cursor-pointer transition-colors ${uploading ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50 border-gray-200 text-gray-700"}`}>
                      <span>{uploading ? "⏳ Envoi en cours..." : "📷 Choisir une photo"}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        disabled={uploading}
                        onChange={handleImageUpload}
                      />
                    </label>
                    {form.image_url && (
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, image_url: "" }))}
                        className="text-xs text-red-500 hover:underline mt-1 block"
                      >
                        🗑 Supprimer la photo
                      </button>
                    )}
                    <p className="text-xs text-gray-400 mt-1">JPG · PNG · WebP · max 5 Mo</p>
                  </div>
                </div>
              </div>

              {msg && <p className="text-sm font-medium text-center">{msg}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60">
                  {saving ? "Enregistrement..." : modal === "create" ? "Créer" : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
