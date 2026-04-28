"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getSession } from "@/lib/auth";

const EMPTY_FORM = {
  product_title: "", price: "", cost_price: "", compare_at_price: "", inventory_quantity: "",
  image_url: "", sku: "", barcode: "", vendor: "NajmCoiff", description: "",
  world: "coiffure", tags: "", collections_titles: "", status: "active",
  collection_ids: [], collections: [],
};

const SORT_OPTIONS = [
  { value: "recent",     label: "Plus récents" },
  { value: "oldest",     label: "Plus anciens" },
  { value: "price_asc",  label: "Prix ↑" },
  { value: "price_desc", label: "Prix ↓" },
  { value: "name_asc",   label: "Nom A→Z" },
  { value: "stock_desc", label: "Stock ↑" },
  { value: "stock_asc",  label: "Stock ↓" },
  { value: "pinned",     label: "📌 Pinés d'abord" },
];

export default function CataloguePage() {
  const [articles, setArticles]     = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [collections, setCollections] = useState([]);

  // Filtres
  const [search, setSearch]           = useState("");
  const [filterWorld, setFilterWorld] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCol, setFilterCol]     = useState("");
  const [sort, setSort]               = useState("recent");
  const [dateFrom, setDateFrom]       = useState("");
  const [dateTo, setDateTo]           = useState("");
  const [offset, setOffset]           = useState(0);
  const LIMIT = 50;

  // Modal édition
  const [modal, setModal]   = useState(null);
  const [form, setForm]     = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");

  // Modal suppression
  const [deleteTarget,  setDeleteTarget]  = useState(null); // article à supprimer
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMsg,     setDeleteMsg]     = useState("");

  // Upload image
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadFile, setUploadFile]       = useState(null);
  const [uploading, setUploading]         = useState(false);
  const fileInputRef = useRef(null);

  // Inline stock/price edit
  const [editCell, setEditCell] = useState(null);

  const token = () => getSession()?.token || "";

  const fetchArticles = useCallback(async (extra = {}) => {
    setLoading(true);
    try {
      const vals = {
        search:       extra.search      !== undefined ? extra.search      : search,
        filterWorld:  extra.filterWorld !== undefined ? extra.filterWorld : filterWorld,
        filterStatus: extra.filterStatus !== undefined ? extra.filterStatus : filterStatus,
        filterCol:    extra.filterCol   !== undefined ? extra.filterCol   : filterCol,
        sort:         extra.sort        !== undefined ? extra.sort        : sort,
        dateFrom:     extra.dateFrom    !== undefined ? extra.dateFrom    : dateFrom,
        dateTo:       extra.dateTo      !== undefined ? extra.dateTo      : dateTo,
        offset:       extra.offset      !== undefined ? extra.offset      : offset,
      };

      const qs = new URLSearchParams({ limit: LIMIT, offset: vals.offset, status: vals.filterStatus, sort: vals.sort });
      if (vals.search)      qs.set("search",        vals.search);
      if (vals.filterWorld) qs.set("world",          vals.filterWorld);
      if (vals.filterCol)   qs.set("collection_id",  vals.filterCol);
      if (vals.dateFrom)    qs.set("date_from",       vals.dateFrom);
      if (vals.dateTo)      qs.set("date_to",         vals.dateTo);

      const r = await fetch(`/api/owner/catalogue?${qs}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.status === 403) {
        // Token expiré → nettoyer la session et rediriger vers le login
        try { localStorage.removeItem("nc_session"); sessionStorage.removeItem("nc_session"); } catch { /* ignore */ }
        if (typeof window !== "undefined") window.location.href = "/?session_expired=1";
        return;
      }
      const d = await r.json();
      if (!r.ok) {
        console.error("[catalogue] API error:", d.error);
        setArticles([]);
        setTotal(0);
        return;
      }
      setArticles(d.articles || []);
      setTotal(d.total || 0);
    } finally {
      setLoading(false);
    }
  }, [search, filterWorld, filterStatus, filterCol, sort, dateFrom, dateTo, offset]);

  useEffect(() => {
    fetchArticles();
    fetch("/api/owner/collections", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => setCollections(d.collections || []));
  }, []);

  function applyFilter(key, val) {
    const extra = { [key]: val, offset: 0 };
    if (key === "search")        setSearch(val);
    if (key === "filterWorld")   setFilterWorld(val);
    if (key === "filterStatus")  setFilterStatus(val);
    if (key === "filterCol")     setFilterCol(val);
    if (key === "sort")          setSort(val);
    if (key === "dateFrom")      setDateFrom(val);
    if (key === "dateTo")        setDateTo(val);
    setOffset(0);
    fetchArticles(extra);
  }

  function clearDates() {
    setDateFrom(""); setDateTo(""); setOffset(0);
    fetchArticles({ dateFrom: "", dateTo: "", offset: 0 });
  }

  // ── Suppression définitive (hard delete) ─────────────────────────
  async function handleDelete(article) {
    if (!article || deleteLoading) return;
    setDeleteLoading(true);
    setDeleteMsg("");
    try {
      const res = await fetch(`/api/owner/catalogue/${article.variant_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.ok) {
        setArticles(prev => prev.filter(a => a.variant_id !== article.variant_id));
        setTotal(t => t - 1);
        setDeleteTarget(null);
        setDeleteMsg("");
      } else {
        setDeleteMsg(data.error || "Erreur suppression");
      }
    } catch (e) {
      setDeleteMsg("Erreur réseau : " + e.message);
    } finally {
      setDeleteLoading(false);
    }
  }

  // ── Toggle status rapide ─────────────────────────────────────────
  async function toggleStatus(article) {
    const newStatus = article.status === "active" ? "inactive" : "active";
    setArticles(prev => prev.map(a => a.variant_id === article.variant_id ? { ...a, status: newStatus } : a));
    await fetch(`/api/owner/catalogue/${article.variant_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  // ── Pin / Unpin article (sort_order) ─────────────────────────────
  // Pinés = sort_order 1–998, apparaissent en premier dans la boutique.
  // Unpin = remet sort_order à 999 (ordre par défaut).
  async function togglePin(article) {
    const isPinned = Number(article.sort_order) < 999;
    let newOrder;
    if (isPinned) {
      newOrder = 999;
    } else {
      // Prochain rang = max des pinés visibles + 1 (min 1)
      const pinned = articles.filter(a => Number(a.sort_order) < 999 && a.world === article.world);
      newOrder = pinned.length > 0 ? Math.max(...pinned.map(a => Number(a.sort_order))) + 1 : 1;
    }
    setArticles(prev => prev.map(a => a.variant_id === article.variant_id ? { ...a, sort_order: newOrder } : a));
    await fetch(`/api/owner/catalogue/${article.variant_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sort_order: newOrder }),
    });
  }

  // ── Inline edit ──────────────────────────────────────────────────
  async function saveInlineEdit() {
    if (!editCell) return;
    const { id, field, value } = editCell;
    setArticles(prev => prev.map(a => a.variant_id === id ? { ...a, [field]: value } : a));
    setEditCell(null);
    await fetch(`/api/owner/catalogue/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: Number(value) }),
    });
  }

  // ── Image upload ─────────────────────────────────────────────────
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
  }

  async function uploadImage() {
    if (!uploadFile) return form.image_url;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      const r = await fetch("/api/owner/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur upload");
      return d.url;
    } finally {
      setUploading(false);
    }
  }

  // ── Formulaire create/edit ───────────────────────────────────────
  function openCreate() {
    setForm(EMPTY_FORM);
    setUploadPreview(null);
    setUploadFile(null);
    setModal("create");
    setMsg("");
  }

  function openEdit(article) {
    setForm({
      ...article,
      tags: Array.isArray(article.tags) ? article.tags.join(", ") : (article.tags || ""),
      cost_price:       article.cost_price || "",
      compare_at_price: article.compare_at_price || "",
      collection_ids: Array.isArray(article.collection_ids) ? article.collection_ids : [],
      collections:    Array.isArray(article.collections)    ? article.collections    : [],
    });
    setUploadPreview(article.image_url || null);
    setUploadFile(null);
    setModal(article);
    setMsg("");
  }

  async function submitForm(e) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      // Upload photo si nouveau fichier sélectionné
      let imageUrl = form.image_url;
      if (uploadFile) {
        try { imageUrl = await uploadImage(); }
        catch (err) { setMsg(`❌ Upload: ${err.message}`); return; }
      }

      const payload = {
        ...form,
        image_url:          imageUrl || null,
        price:              Number(form.price),
        cost_price:         form.cost_price ? Number(form.cost_price) : null,
        compare_at_price:   form.compare_at_price ? Number(form.compare_at_price) : null,
        inventory_quantity: Number(form.inventory_quantity),
        tags:               form.tags ? form.tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean) : [],
        collection_ids:     Array.isArray(form.collection_ids) ? form.collection_ids : [],
        collections:        Array.isArray(form.collections)    ? form.collections    : [],
        collections_titles: form.collections_titles || "",
      };

      let r;
      if (modal === "create") {
        r = await fetch("/api/owner/catalogue", {
          method: "POST",
          headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        r = await fetch(`/api/owner/catalogue/${modal.variant_id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const d = await r.json();
      if (!r.ok) { setMsg(`❌ ${d.error}`); return; }
      setMsg("✅ Enregistré");
      setTimeout(() => { setModal(null); fetchArticles(); }, 800);
    } finally {
      setSaving(false);
    }
  }

  const totalPages  = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <div className="max-w-7xl mx-auto">

      {/* ── En-tête ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock articles</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} articles</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
        >
          + Nouvel article
        </button>
      </div>

      {/* ── Filtres principaux ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-3 flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Rechercher un article..."
          className="w-full sm:flex-1 sm:min-w-48 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300"
          value={search}
          onChange={e => applyFilter("search", e.target.value)}
        />
        <select className="px-3 py-2 text-sm border border-gray-200 rounded-xl"
          value={filterWorld} onChange={e => applyFilter("filterWorld", e.target.value)}>
          <option value="">Tous les mondes</option>
          <option value="coiffure">✂️ Coiffure</option>
          <option value="onglerie">💅 Onglerie</option>
        </select>
        <select className="px-3 py-2 text-sm border border-gray-200 rounded-xl"
          value={filterStatus} onChange={e => applyFilter("filterStatus", e.target.value)}>
          <option value="all">Tous statuts</option>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
        </select>
        <select className="px-3 py-2 text-sm border border-gray-200 rounded-xl max-w-[200px]"
          value={filterCol} onChange={e => applyFilter("filterCol", e.target.value)}>
          <option value="">Toutes collections</option>
          {collections.map(c => (
            <option key={c.collection_id} value={c.collection_id}>{c.title}</option>
          ))}
        </select>
        <select className="px-3 py-2 text-sm border border-gray-200 rounded-xl"
          value={sort} onChange={e => applyFilter("sort", e.target.value)}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value === sort ? "⇅ " : ""}{o.label}</option>)}
        </select>
      </div>

      {/* ── Filtres de date ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 mb-5 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date modif.</span>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Du</label>
          <input type="date" className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
            value={dateFrom} onChange={e => applyFilter("dateFrom", e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Au</label>
          <input type="date" className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
            value={dateTo} onChange={e => applyFilter("dateTo", e.target.value)} />
        </div>
        {/* Raccourcis rapides */}
        {[
          { label: "Aujourd'hui",    days: 0 },
          { label: "7 derniers j.",  days: 7 },
          { label: "30 derniers j.", days: 30 },
        ].map(({ label, days }) => (
          <button key={label}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors"
            onClick={() => {
              const to   = new Date().toISOString().slice(0, 10);
              const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
              setDateFrom(from); setDateTo(to); setOffset(0);
              fetchArticles({ dateFrom: from, dateTo: to, offset: 0 });
            }}
          >
            {label}
          </button>
        ))}
        {(dateFrom || dateTo) && (
          <button onClick={clearDates} className="text-xs text-red-500 hover:underline">✕ Effacer dates</button>
        )}
      </div>

      {/* ── Vue mobile : cartes (< md) ──────────────────────────────── */}
      <div className="md:hidden space-y-3">
        {loading ? (
          Array(5).fill(null).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-14 h-14 bg-gray-100 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))
        ) : articles.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-200">
            Aucun article trouvé
          </div>
        ) : articles.map(a => (
          <div key={a.variant_id} className={`bg-white rounded-2xl border border-gray-200 p-4 ${a.status !== "active" ? "opacity-60" : ""}`}>
            <div className="flex gap-3">
              {/* Photo */}
              <div className="flex-shrink-0">
                {a.image_url
                  ? <img src={a.image_url} alt={a.product_title} className="w-14 h-14 rounded-xl object-cover border border-gray-100" />
                  : <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 text-xl">📦</div>
                }
              </div>
              {/* Infos */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm leading-snug">{a.product_title}</p>
                <p className="text-xs text-gray-400 truncate mt-0.5">{a.collections_titles || "—"}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${a.world === "onglerie" ? "bg-pink-100 text-pink-700" : "bg-red-50 text-red-700"}`}>
                    {a.world === "onglerie" ? "💅" : "✂️"} {a.world === "onglerie" ? "Onglerie" : "Coiffure"}
                  </span>
                  <button onClick={() => toggleStatus(a)}
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-colors ${a.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {a.status === "active" ? "Actif" : "Inactif"}
                  </button>
                </div>
              </div>
            </div>
            {/* Prix + Stock */}
            <div className="grid grid-cols-3 gap-2 mt-3 bg-gray-50 rounded-xl p-3">
              <div className="text-center">
                <p className="text-[10px] text-gray-400 mb-0.5">Vente</p>
                <p className="text-sm font-bold text-indigo-600">{Number(a.price).toLocaleString("fr-DZ")} DA</p>
              </div>
              <div className="text-center border-x border-gray-200">
                <p className="text-[10px] text-gray-400 mb-0.5">Achat</p>
                <p className="text-sm font-bold text-orange-600">{a.cost_price ? `${Number(a.cost_price).toLocaleString("fr-DZ")} DA` : "—"}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-400 mb-0.5">Stock</p>
                <p className={`text-sm font-bold ${Number(a.inventory_quantity) === 0 ? "text-red-500" : Number(a.inventory_quantity) <= 3 ? "text-orange-500" : "text-green-600"}`}>
                  {a.inventory_quantity}
                </p>
              </div>
            </div>
            {/* Actions */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => togglePin(a)}
                title={Number(a.sort_order) < 999 ? "Dépiner" : "Piner en tête"}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                  Number(a.sort_order) < 999
                    ? "bg-amber-100 text-amber-600 hover:bg-amber-200"
                    : "bg-gray-100 text-gray-400 hover:bg-amber-50 hover:text-amber-500"
                }`}
              >
                {Number(a.sort_order) < 999 ? `📌 #${a.sort_order}` : "📌"}
              </button>
              <button
                data-testid="btn-modifier"
                onClick={() => openEdit(a)}
                className="flex-1 text-sm text-indigo-600 font-semibold py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 transition-colors">
                ✏️ Modifier
              </button>
              <button
                data-testid="btn-supprimer"
                onClick={() => { setDeleteTarget(a); setDeleteMsg(""); }}
                className="flex-1 text-sm text-red-500 font-semibold py-2 rounded-xl bg-red-50 hover:bg-red-100 transition-colors">
                🗑️
              </button>
            </div>
          </div>
        ))}

        {/* Pagination mobile */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-2 py-3">
            <p className="text-xs text-gray-500">Page {currentPage}/{totalPages}</p>
            <div className="flex gap-2">
              <button disabled={offset === 0}
                onClick={() => { const o = offset - LIMIT; setOffset(o); fetchArticles({ offset: o }); }}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 bg-white">
                ← Préc.
              </button>
              <button disabled={currentPage >= totalPages}
                onClick={() => { const o = offset + LIMIT; setOffset(o); fetchArticles({ offset: o }); }}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 bg-white">
                Suiv. →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Tableau desktop (≥ md) ───────────────────────────────────── */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-14">Photo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Article</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-28">Prix vente (DA)</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-28">Prix achat (DA)</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-20">Stock</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-24">Monde</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-28">Modifié</th>
                <th className="text-center px-3 py-3 font-semibold text-gray-600 w-16" title="Position en boutique">📌</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-24">Statut</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array(8).fill(null).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="w-10 h-10 bg-gray-100 rounded-lg" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-48" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-16" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-16" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-12" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-16" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-20" /></td>
                    <td className="px-4 py-3"><div className="h-6 bg-gray-100 rounded-full w-16" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-14" /></td>
                  </tr>
                ))
              ) : articles.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">Aucun article trouvé</td></tr>
              ) : articles.map(a => (
                <tr key={a.variant_id} className={`hover:bg-gray-50 transition-colors ${a.status !== "active" ? "opacity-50" : ""}`}>
                  {/* Photo */}
                  <td className="px-4 py-3">
                    {a.image_url
                      ? <img src={a.image_url} alt={a.product_title} className="w-10 h-10 rounded-lg object-cover border border-gray-100" />
                      : <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs">📦</div>
                    }
                  </td>

                  {/* Nom + collection */}
                  <td className="px-4 py-3 max-w-xs">
                    <p className="font-semibold text-gray-900 truncate">{a.product_title}</p>
                    <p className="text-xs text-gray-400 truncate">{a.collections_titles || "—"}</p>
                  </td>

                  {/* Prix vente inline */}
                  <td className="px-4 py-3">
                    {editCell?.id === a.variant_id && editCell?.field === "price" ? (
                      <input autoFocus type="number"
                        className="w-24 px-2 py-1 border border-indigo-400 rounded-lg text-sm focus:outline-none"
                        value={editCell.value}
                        onChange={e => setEditCell({ ...editCell, value: e.target.value })}
                        onBlur={saveInlineEdit}
                        onKeyDown={e => { if (e.key === "Enter") saveInlineEdit(); if (e.key === "Escape") setEditCell(null); }}
                      />
                    ) : (
                      <span className="cursor-pointer hover:text-indigo-600 font-medium"
                        title="Cliquer pour modifier"
                        onClick={() => setEditCell({ id: a.variant_id, field: "price", value: a.price })}>
                        {Number(a.price).toLocaleString("fr-DZ")} DA
                        {a.compare_at_price && <span className="block text-xs text-gray-400 line-through">{Number(a.compare_at_price).toLocaleString("fr-DZ")}</span>}
                      </span>
                    )}
                  </td>

                  {/* Prix achat inline */}
                  <td className="px-4 py-3">
                    {editCell?.id === a.variant_id && editCell?.field === "cost_price" ? (
                      <input autoFocus type="number"
                        className="w-24 px-2 py-1 border border-orange-400 rounded-lg text-sm focus:outline-none"
                        value={editCell.value}
                        onChange={e => setEditCell({ ...editCell, value: e.target.value })}
                        onBlur={saveInlineEdit}
                        onKeyDown={e => { if (e.key === "Enter") saveInlineEdit(); if (e.key === "Escape") setEditCell(null); }}
                      />
                    ) : (
                      <span className="cursor-pointer hover:text-orange-600 font-medium text-orange-700"
                        title="Cliquer pour modifier le prix d'achat"
                        onClick={() => setEditCell({ id: a.variant_id, field: "cost_price", value: a.cost_price || 0 })}>
                        {a.cost_price ? `${Number(a.cost_price).toLocaleString("fr-DZ")} DA` : <span className="text-gray-300 text-xs">— cliquer</span>}
                      </span>
                    )}
                  </td>

                  {/* Stock inline */}
                  <td className="px-4 py-3">
                    {editCell?.id === a.variant_id && editCell?.field === "inventory_quantity" ? (
                      <input autoFocus type="number"
                        className="w-16 px-2 py-1 border border-indigo-400 rounded-lg text-sm focus:outline-none"
                        value={editCell.value}
                        onChange={e => setEditCell({ ...editCell, value: e.target.value })}
                        onBlur={saveInlineEdit}
                        onKeyDown={e => { if (e.key === "Enter") saveInlineEdit(); if (e.key === "Escape") setEditCell(null); }}
                      />
                    ) : (
                      <span className={`cursor-pointer font-medium hover:text-indigo-600 ${Number(a.inventory_quantity) === 0 ? "text-red-500" : Number(a.inventory_quantity) <= 3 ? "text-orange-500" : "text-green-600"}`}
                        title="Cliquer pour modifier"
                        onClick={() => setEditCell({ id: a.variant_id, field: "inventory_quantity", value: a.inventory_quantity })}>
                        {a.inventory_quantity}
                      </span>
                    )}
                  </td>

                  {/* Monde */}
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${a.world === "onglerie" ? "bg-pink-100 text-pink-700" : "bg-red-50 text-red-700"}`}>
                      {a.world === "onglerie" ? "💅" : "✂️"} {a.world === "onglerie" ? "Onglerie" : "Coiffure"}
                    </span>
                  </td>

                  {/* Date modif */}
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-400">
                      {a.updated_at ? new Date(a.updated_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
                    </span>
                  </td>

                  {/* Pin boutique */}
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => togglePin(a)}
                      title={Number(a.sort_order) < 999 ? `Pîné #${a.sort_order} — cliquer pour dépiner` : "Piner en tête de boutique"}
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-all text-sm font-bold ${
                        Number(a.sort_order) < 999
                          ? "bg-amber-100 text-amber-600 hover:bg-amber-200 ring-2 ring-amber-300"
                          : "text-gray-300 hover:text-amber-400 hover:bg-amber-50"
                      }`}
                    >
                      {Number(a.sort_order) < 999 ? a.sort_order : "📌"}
                    </button>
                  </td>

                  {/* Statut toggle */}
                  <td className="px-4 py-3">
                    <button onClick={() => toggleStatus(a)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${a.status === "active" ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                      {a.status === "active" ? "Actif" : "Inactif"}
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        data-testid="btn-modifier"
                        onClick={() => openEdit(a)}
                        className="text-xs text-indigo-600 hover:underline font-medium">
                        Modifier
                      </button>
                      <button
                        data-testid="btn-supprimer"
                        onClick={() => { setDeleteTarget(a); setDeleteMsg(""); }}
                        className="text-xs text-red-500 hover:underline font-medium">
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-sm text-gray-500">Page {currentPage}/{totalPages} — {total} articles</p>
            <div className="flex gap-2">
              <button disabled={offset === 0}
                onClick={() => { const o = offset - LIMIT; setOffset(o); fetchArticles({ offset: o }); }}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition-colors">
                ← Préc.
              </button>
              <button disabled={currentPage >= totalPages}
                onClick={() => { const o = offset + LIMIT; setOffset(o); fetchArticles({ offset: o }); }}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition-colors">
                Suiv. →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal formulaire ────────────────────────────────────────── */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4 pb-10 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {modal === "create" ? "Nouvel article" : `Modifier — ${modal.product_title}`}
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <form onSubmit={submitForm} className="p-6 grid grid-cols-2 gap-4">

              {/* Nom */}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nom de l'article *</label>
                <input required className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={form.product_title} onChange={e => setForm(f => ({ ...f, product_title: e.target.value }))} />
              </div>

              {/* Prix */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Prix (DA) *</label>
                <input required type="number" min="0" step="1" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </div>

              {/* Prix barré */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Prix barré (DA)</label>
                <input type="number" min="0" step="1" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
                  value={form.compare_at_price} onChange={e => setForm(f => ({ ...f, compare_at_price: e.target.value }))} />
              </div>

              {/* Prix d'achat */}
              <div>
                <label className="block text-xs font-semibold text-orange-700 mb-1">Prix d'achat / Coût (DA)</label>
                <input
                  data-testid="input-cost-price"
                  type="number" min="0" step="1"
                  className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-orange-50"
                  value={form.cost_price}
                  onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))}
                  placeholder="0"
                />
              </div>

              {/* Stock */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Stock *</label>
                <input required type="number" min="0" step="1" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={form.inventory_quantity} onChange={e => setForm(f => ({ ...f, inventory_quantity: e.target.value }))} />
              </div>

              {/* Monde */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Monde *</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
                  value={form.world} onChange={e => setForm(f => ({ ...f, world: e.target.value }))}>
                  <option value="coiffure">✂️ Coiffure</option>
                  <option value="onglerie">💅 Onglerie</option>
                </select>
              </div>

              {/* Photo — upload + URL */}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-2">Photo de l'article</label>
                <div className="flex items-start gap-4">
                  {/* Aperçu */}
                  <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden shrink-0 bg-gray-50">
                    {(uploadPreview || form.image_url)
                      ? <img src={uploadPreview || form.image_url} alt="aperçu" className="w-full h-full object-cover" />
                      : <span className="text-2xl">📷</span>
                    }
                  </div>
                  <div className="flex-1 space-y-2">
                    {/* Bouton choisir fichier */}
                    <div>
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                      <button type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700">
                        {uploading ? "Upload en cours..." : "📁 Choisir une photo"}
                      </button>
                      {uploadFile && <span className="ml-2 text-xs text-green-600">✓ {uploadFile.name}</span>}
                    </div>
                    {/* URL manuelle */}
                    <input type="url" placeholder="Ou coller une URL https://..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
                      value={form.image_url}
                      onChange={e => { setForm(f => ({ ...f, image_url: e.target.value })); if (!uploadFile) setUploadPreview(e.target.value); }}
                    />
                  </div>
                </div>
              </div>

              {/* Collections — multi-select checkboxes */}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-2">
                  Collections
                  {form.collection_ids?.length > 0 && (
                    <span className="ml-2 text-indigo-600 font-normal">({form.collection_ids.length} sélectionnée{form.collection_ids.length > 1 ? "s" : ""})</span>
                  )}
                </label>
                {collections.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Aucune collection disponible</p>
                ) : (
                  <div className="border border-gray-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-gray-50">
                    {collections.map(c => {
                      const checked = (form.collection_ids || []).includes(c.collection_id);
                      return (
                        <label
                          key={c.collection_id}
                          className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-indigo-50 transition-colors ${checked ? "bg-indigo-50" : ""}`}
                        >
                          <input
                            type="checkbox"
                            data-testid={`col-check-${c.collection_id}`}
                            checked={checked}
                            onChange={() => {
                              const ids    = form.collection_ids || [];
                              const titles = form.collections    || [];
                              let newIds, newTitles;
                              if (checked) {
                                newIds    = ids.filter(x => x !== c.collection_id);
                                newTitles = titles.filter(t => t !== c.title);
                              } else {
                                newIds    = [...ids, c.collection_id];
                                newTitles = [...titles, c.title];
                              }
                              setForm(f => ({
                                ...f,
                                collection_ids:     newIds,
                                collections:        newTitles,
                                collections_titles: newTitles.join(", "),
                              }));
                            }}
                            className="rounded accent-indigo-600"
                          />
                          <span className="text-sm text-gray-700">{c.title}</span>
                          {checked && <span className="ml-auto text-indigo-500 text-xs font-bold">✓</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
                {form.collection_ids?.length > 0 && (
                  <p className="mt-1.5 text-xs text-gray-400 truncate">
                    {form.collections_titles}
                  </p>
                )}
              </div>

              {/* Statut */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Statut</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
                  value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="active">Actif</option>
                  <option value="inactive">Inactif</option>
                </select>
              </div>

              {/* SKU / Barcode */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">SKU</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
                  value={form.sku || ""} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Barcode</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
                  value={form.barcode || ""} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} />
              </div>

              {/* Tags */}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Tags (séparés par virgule)</label>
                <input placeholder="promo, bestseller, awakhir" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
                  value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
              </div>

              {msg && <p className="col-span-2 text-sm font-medium text-center py-1">{msg}</p>}

              <div className="col-span-2 flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">
                  Annuler
                </button>
                <button type="submit" disabled={saving || uploading}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60">
                  {saving || uploading ? "En cours..." : modal === "create" ? "Créer l'article" : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal suppression définitive ─────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className="bg-red-50 border-b border-red-100 px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Supprimer l'article</h3>
                <p className="text-xs text-red-600 font-semibold">Cette action est irréversible</p>
              </div>
            </div>

            {/* Corps */}
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-gray-700">
                L'article <span className="font-semibold">"{deleteTarget.product_title}"</span> sera supprimé définitivement de la base de données.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <p className="text-xs text-amber-800">
                  Stock actuel : <span className="font-bold">{deleteTarget.inventory_quantity}</span> unités ·
                  Prix : <span className="font-bold">{Number(deleteTarget.price).toLocaleString("fr-DZ")} DA</span>
                </p>
              </div>
              {deleteMsg && <p className="text-xs text-red-600 font-medium">{deleteMsg}</p>}
            </div>

            {/* Boutons */}
            <div className="px-5 pb-5 space-y-2">
              <button
                data-testid="btn-confirmer-suppression"
                onClick={() => handleDelete(deleteTarget)}
                disabled={deleteLoading}
                className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {deleteLoading
                  ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : "🗑️ Supprimer définitivement"
                }
              </button>
              <button
                onClick={() => { setDeleteTarget(null); setDeleteMsg(""); }}
                disabled={deleteLoading}
                className="w-full py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
