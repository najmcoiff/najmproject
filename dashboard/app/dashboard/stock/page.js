"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { smartMatch } from "@/lib/smart-search";

// ── Helpers ──────────────────────────────────────────────────────
function fmtPrice(v) {
  const n = Number(v || 0);
  return isNaN(n) ? "—" : n.toLocaleString("fr-FR") + " DA";
}
function fmtDate(val) {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d)) return String(val);
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function genPoId() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `PO-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
}
function stockColor(qty) {
  const n = Number(qty);
  if (n < 0)  return "text-red-900 font-bold";
  if (n === 0) return "text-red-600 font-bold";
  if (n <= 3)  return "text-orange-600 font-semibold";
  return "text-green-700 font-semibold";
}

// ════════════════════════════════════════════════════════════════
//  ONGLET 1 — CRÉER UN BON DE COMMANDE
// ════════════════════════════════════════════════════════════════
// panier et poId viennent maintenant du parent (persistent entre onglets)
function BonTab({ variants, showToast, session, panier, setPanier, poId, setPoId }) {
  const [search,   setSearch]   = useState("");
  const [saving,   setSaving]   = useState(false);
  const [injecting,setInjecting]= useState(false);
  const [showPdf,  setShowPdf]  = useState(false);

  const results = search.trim()
    ? variants.filter(r =>
        smartMatch(search, [r.display_name, r.product_title, r.vendor, r.sku, r.barcode, r.collections_titles])
      ).slice(0, 20)
    : [];

  const addToPanier = (r) => {
    const vid = String(r.variant_id);
    setPanier(prev => {
      if (prev.find(p => p.variant_id === vid)) {
        showToast("Article déjà dans le bon", "error");
        return prev;
      }
      return [...prev, {
        variant_id:     vid,
        display_name:   String(r.display_name || r.product_title || ""),
        product_title:  String(r.product_title || r.display_name || ""),
        barcode:        String(r.barcode || ""),
        image_url:      String(r.image_url || ""),
        qty_add:        1,
        purchase_price: Number(r.cost_price || 0),
        sell_price:     Number(r.price || 0),
        note:           "",
        collections_titles_pick: r.collections_titles || "",
      }];
    });
    setSearch("");
  };

  const updateLine = (vid, field, val) => {
    setPanier(prev => prev.map(p => p.variant_id === vid ? { ...p, [field]: val } : p));
  };
  const removeLine = (vid) => setPanier(prev => prev.filter(p => p.variant_id !== vid));

  const totalCout   = panier.reduce((s, p) => s + Number(p.purchase_price || 0) * Number(p.qty_add || 0), 0);
  const totalVente  = panier.reduce((s, p) => s + Number(p.sell_price   || 0) * Number(p.qty_add || 0), 0);
  const totalQty    = panier.reduce((s, p) => s + Number(p.qty_add || 0), 0);

  const handleSave = async () => {
    if (!panier.length) return;
    setSaving(true);
    try {
      const res = await api.addPOLines(poId, panier);
      if (res.ok) {
        showToast(`Bon ${poId} sauvegardé (${res.lines_added} ligne(s)) ✓`);
        setPanier([]);
        setPoId(genPoId());
      } else showToast(res.error || "Erreur", "error");
    } catch (_) { showToast("Erreur réseau", "error"); }
    finally { setSaving(false); }
  };

  const handleSaveAndInject = async () => {
    if (!panier.length) return;
    setSaving(true);
    try {
      const saveRes = await api.addPOLines(poId, panier);
      if (!saveRes.ok) { showToast(saveRes.error || "Erreur sauvegarde", "error"); return; }
      const savedPoId = poId;
      showToast(`Bon ${savedPoId} sauvegardé ✓ — Injection en cours…`);
      setPanier([]);
      setPoId(genPoId());
      setInjecting(true);
      const injRes = await api.runInjectPO(savedPoId);
      if (injRes.ok) showToast(injRes.message || `Stock mis à jour dans la base — ${injRes.lignes_ok} article(s) ✓`);
      else           showToast(injRes.error || injRes.message || "Erreur injection", "error");
    } catch (_) { showToast("Erreur réseau", "error"); }
    finally { setSaving(false); setInjecting(false); }
  };

  return (
    <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
      {/* ── Recherche + ajout ─────────────────────────────── */}
      <div className="w-full md:w-80 flex-shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-gray-200 bg-white max-h-[220px] md:max-h-none">
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="font-bold text-gray-900 text-sm mb-3">Ajouter des articles</h3>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par nom, SKU, code-barre…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {results.length === 0 && search.trim() && (
            <div className="text-xs text-gray-400 p-4 text-center">Aucun résultat</div>
          )}
          {results.map(r => (
            <div key={String(r.variant_id)}
              className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
              onClick={() => addToPanier(r)}>
              <div className="w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                {r.image_url
                  ? <img src={String(r.image_url)} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display="none"} />
                  : <span className="w-full h-full flex items-center justify-center text-gray-300">📦</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-800 truncate">{String(r.display_name || "—")}</div>
                <div className="text-xs text-gray-400 flex gap-2">
                  <span className={stockColor(r.inventory_quantity)}>Stock: {Number(r.inventory_quantity)}</span>
                  <span>{fmtPrice(r.price)}</span>
                </div>
              </div>
              <span className="text-gray-400 text-lg">+</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Panier ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {/* Header bon */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <div>
            <label className="text-xs text-gray-500 block">N° Bon</label>
            <input type="text" value={poId} onChange={e => setPoId(e.target.value)}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 w-52"
            />
          </div>
          <div className="ml-auto text-right text-xs text-gray-500">
            <div><span className="font-semibold">{panier.length}</span> article(s) · <span className="font-semibold">{totalQty}</span> unité(s)</div>
            <div>Coût : <span className="font-semibold text-gray-800">{fmtPrice(totalCout)}</span> · Vente : <span className="font-semibold text-green-700">{fmtPrice(totalVente)}</span></div>
          </div>
        </div>

        {/* Lignes panier */}
        <div className="flex-1 overflow-y-auto p-4">
          {panier.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-12">
              Recherchez des articles à gauche pour les ajouter au bon
            </div>
          ) : panier.map(p => (
            <div key={p.variant_id} className="bg-white rounded-xl border border-gray-200 p-3 mb-3 flex items-start gap-3">
              <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                {p.image_url
                  ? <img src={p.image_url} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display="none"} />
                  : <span className="w-full h-full flex items-center justify-center text-gray-300 text-xl">📦</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-800 mb-2 truncate">{p.display_name}</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Qté", field: "qty_add",       type: "number", min: 1 },
                    { label: "Prix achat", field: "purchase_price", type: "number", min: 0 },
                    { label: "Prix vente", field: "sell_price",     type: "number", min: 0 },
                  ].map(({ label, field, type, min }) => (
                    <div key={field}>
                      <label className="text-xs text-gray-400 block mb-0.5">{label}</label>
                      <input type={type} min={min}
                        value={p[field]}
                        onChange={e => updateLine(p.variant_id, field, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-gray-900"
                      />
                    </div>
                  ))}
                </div>
                <input type="text" placeholder="Note…" value={p.note}
                  onChange={e => updateLine(p.variant_id, "note", e.target.value)}
                  className="mt-2 w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
              <button onClick={() => removeLine(p.variant_id)} className="text-gray-300 hover:text-red-500 text-xl leading-none mt-1">×</button>
            </div>
          ))}
        </div>

        {/* Actions */}
        {panier.length > 0 && (
          <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <button onClick={() => setShowPdf(true)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-400 transition-colors">
              🖨️ PDF
            </button>
            <button onClick={handleSave} disabled={saving || injecting}
              className="flex-1 py-2.5 border border-gray-900 text-gray-900 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-40 transition-colors">
              {saving ? "Sauvegarde…" : "💾 Sauvegarder"}
            </button>
            <button onClick={handleSaveAndInject} disabled={saving || injecting}
              className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors">
              {injecting ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Injection…</> : "⚡ Sauvegarder & Injecter"}
            </button>
          </div>
        )}
      </div>

      {/* ── Modal PDF ─────────────────────────────────────── */}
      {showPdf && (
        <ModalPDF poId={poId} panier={panier} session={session} onClose={() => setShowPdf(false)} />
      )}
    </div>
  );
}

// ── Modal PDF ─────────────────────────────────────────────────────
function ModalPDF({ poId, panier, session, onClose }) {
  const totalCout  = panier.reduce((s, p) => s + Number(p.purchase_price || 0) * Number(p.qty_add || 0), 0);
  const totalVente = panier.reduce((s, p) => s + Number(p.sell_price   || 0) * Number(p.qty_add || 0), 0);
  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const handlePrint = () => {
    const printContent = document.getElementById("po-print-area").innerHTML;
    const win = window.open("", "_blank");
    win.document.write(`
      <html><head><title>Bon de commande ${poId}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 20px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: bold; }
        .right { text-align: right; }
        .total-row { background: #f9f9f9; font-weight: bold; }
        @media print { button { display: none; } }
      </style></head><body>${printContent}</body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-gray-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <h2 className="text-white font-bold">🖨️ Bon de commande — {poId}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div id="po-print-area">
            <h1>Bon de commande</h1>
            <div className="meta" style={{marginBottom: "12px"}}>
              <strong>N° :</strong> {poId} &nbsp;|&nbsp;
              <strong>Date :</strong> {today} &nbsp;|&nbsp;
              <strong>Agent :</strong> {session?.nom || "—"}
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Article</th>
                  <th>SKU / Code-barre</th>
                  <th className="right">Qté</th>
                  <th className="right">Prix achat</th>
                  <th className="right">Prix vente</th>
                  <th className="right">Total achat</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {panier.map((p, i) => (
                  <tr key={p.variant_id}>
                    <td>{i + 1}</td>
                    <td>{p.display_name}</td>
                    <td style={{fontFamily: "monospace", fontSize: "10px"}}>{p.barcode || "—"}</td>
                    <td className="right">{p.qty_add}</td>
                    <td className="right">{fmtPrice(p.purchase_price)}</td>
                    <td className="right">{fmtPrice(p.sell_price)}</td>
                    <td className="right">{fmtPrice(Number(p.purchase_price) * Number(p.qty_add))}</td>
                    <td>{p.note || ""}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={3}><strong>TOTAL</strong></td>
                  <td className="right"><strong>{panier.reduce((s,p)=>s+Number(p.qty_add),0)}</strong></td>
                  <td colSpan={2}></td>
                  <td className="right"><strong>{fmtPrice(totalCout)}</strong></td>
                  <td></td>
                </tr>
              </tbody>
            </table>
            <div style={{marginTop: "12px", fontSize: "11px", color: "#666"}}>
              Total vente estimé : {fmtPrice(totalVente)} &nbsp;|&nbsp; Marge : {fmtPrice(totalVente - totalCout)}
            </div>
          </div>
        </div>
        <div className="border-t border-gray-200 px-6 py-4 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-400">Fermer</button>
          <button onClick={handlePrint} className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700">🖨️ Imprimer / PDF</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  ONGLET 3 — HISTORIQUE PO
// ════════════════════════════════════════════════════════════════
function HistoriqueTab({ showToast, variants }) {
  const [lines,     setLines]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState(null);
  const [injecting, setInjecting] = useState(null); // po_id en cours

  useEffect(() => {
    api.getPOLines().then(res => {
      if (res.ok) setLines(res.rows || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Index variants par variant_id pour lookup rapide
  const variantMap = {};
  variants.forEach(v => { variantMap[String(v.variant_id)] = v; });

  // Grouper par po_id
  const groups = {};
  lines.forEach(l => {
    const k = String(l.po_id || "");
    if (!groups[k]) groups[k] = [];
    groups[k].push(l);
  });
  const poList = Object.entries(groups).map(([poId, rows]) => ({
    poId,
    rows,
    date: rows[0]?.created_at || "",
    agent: rows[0]?.agent || "—",
    totalQty: rows.reduce((s, r) => s + Number(r.qty_add || 0), 0),
    totalCout: rows.reduce((s, r) => s + Number(r.purchase_price || 0) * Number(r.qty_add || 0), 0),
  })).sort((a, b) => new Date(b.date) - new Date(a.date));

  const handleInjectOne = async (poId) => {
    if (!confirm(`Injecter le bon ${poId} dans la base de stock ?`)) return;
    setInjecting(poId);
    try {
      const res = await api.runInjectPO(poId);
      if (res.ok) showToast(res.message || `Stock mis à jour dans la base — ${res.lignes_ok} article(s) ✓`);
      else        showToast(res.error || res.message || "Erreur", "error");
    } catch (_) { showToast("Erreur réseau", "error"); }
    finally { setInjecting(null); }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
      {/* Header */}
      <div className="mb-4">
        <h3 className="font-bold text-gray-900">Historique des bons de commande</h3>
        <p className="text-xs text-gray-500 mt-0.5">{poList.length} bon(s) · {lines.length} ligne(s)</p>
      </div>

      {loading ? (
        <div className="space-y-2">{Array(5).fill(0).map((_, i) => <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}</div>
      ) : poList.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-12">Aucun bon de commande trouvé</div>
      ) : (
        <div className="space-y-3">
          {poList.map(po => (
            <div key={po.poId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Entête PO */}
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 cursor-pointer" onClick={() => setExpanded(expanded === po.poId ? null : po.poId)}>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm font-mono text-gray-900">{po.poId}</span>
                    <span className="text-xs text-gray-500">{po.rows.length} article(s) · {po.totalQty} unité(s)</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 flex gap-3">
                    <span>📅 {fmtDate(po.date)}</span>
                    <span>👤 {po.agent}</span>
                    <span>💰 {fmtPrice(po.totalCout)}</span>
                  </div>
                </div>
                {/* Bouton injection individuel */}
                <button
                  onClick={() => handleInjectOne(po.poId)}
                  disabled={injecting === po.poId}
                  className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 flex items-center gap-1.5 transition-colors flex-shrink-0">
                  {injecting === po.poId
                    ? <><svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>…</>
                    : "⚡ Injecter"}
                </button>
                <span className="text-gray-400 cursor-pointer" onClick={() => setExpanded(expanded === po.poId ? null : po.poId)}
                  style={{ transform: expanded === po.poId ? "rotate(90deg)" : "", transition: "transform 0.15s" }}>›</span>
              </div>
              {/* Lignes détail */}
              {expanded === po.poId && (
                <div className="border-t border-gray-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        {["Article", "Qté", "Prix achat", "Prix vente", "Note"].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {po.rows.map((l, i) => {
                        const vid = String(l.variant_id || "").replace("gid://shopify/ProductVariant/", "");
                        const v   = variantMap[vid] || variantMap[String(l.variant_id || "")] || null;
                        return (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {v?.image_url
                                  ? <img src={String(v.image_url)} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" onError={e => e.target.style.display="none"} />
                                  : <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0"><span className="text-gray-300 text-sm">📦</span></div>}
                                <span className="text-gray-800 font-medium truncate max-w-xs">{v?.display_name || String(l.variant_id || "—")}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 font-semibold">{l.qty_add}</td>
                            <td className="px-3 py-2">{fmtPrice(l.purchase_price)}</td>
                            <td className="px-3 py-2">{fmtPrice(l.sell_price)}</td>
                            <td className="px-3 py-2 text-gray-500">{l.note || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  PAGE PRINCIPALE STOCK
// ════════════════════════════════════════════════════════════════
export default function StockPage() {
  const [session,  setSession]  = useState(null);
  const [variants, setVariants] = useState([]);
  const [tab,      setTab]      = useState("bon");
  const [toast,    setToast]    = useState(null);

  // Panier partagé — persiste lors des changements d'onglet
  const [panier,   setPanier]   = useState([]);
  const [poId,     setPoId]     = useState(() => genPoId());

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const s = getSession();
    setSession(s?.user || null);
    api.getVariantsCache().then(res => {
      if (res.ok) setVariants(res.rows || []);
    }).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-40 px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-sm
          ${toast.type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* Onglets */}
      <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
        {[
          { key: "bon",        label: "📦 Bon de commande", badge: panier.length || null },
          { key: "historique", label: "📜 Historique PO",   badge: null },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2
              ${tab === t.key ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
            {t.badge != null && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full
                ${t.key === "bon" && panier.length > 0
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-500"}`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {tab === "bon" && (
        <BonTab
          variants={variants}
          showToast={showToast}
          session={session}
          panier={panier}
          setPanier={setPanier}
          poId={poId}
          setPoId={setPoId}
        />
      )}

      {tab === "historique" && (
        <HistoriqueTab showToast={showToast} variants={variants} />
      )}
    </div>
  );
}
