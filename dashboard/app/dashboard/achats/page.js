"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { smartMatch } from "@/lib/smart-search";
import { getRawSession } from "@/lib/auth";

// ── Constantes ────────────────────────────────────────────────────
const DEMANDES_CAS = [
  "Suggestion nouveau produit",
  "Article demandé fréquemment (non dispo)",
  "Demande récurrente d'un nouveau produit",
];

const TABS = [
  { key: "acheter",  label: "À Acheter",      icon: "🔴" },
  { key: "dispo",    label: "Dispo Non Vendu", icon: "📦" },
  { key: "nodispo",  label: "Non Dispo",       icon: "🚫" },
  { key: "demandes", label: "Demandes",        icon: "💬" },
];

// ── Helpers ───────────────────────────────────────────────────────
function scoreLabel(s) {
  if (!s) return null;
  const n = Number(s);
  // La vue Supabase retourne un score entre 0 et 1
  if (n >= 0.8)  return { label: "CRITIQUE", cls: "bg-red-100 text-red-700 border border-red-200" };
  if (n >= 0.5)  return { label: "URGENT",   cls: "bg-orange-100 text-orange-700 border border-orange-200" };
  if (n >= 0.2)  return { label: "MOYEN",    cls: "bg-yellow-100 text-yellow-700 border border-yellow-200" };
  return               { label: "FAIBLE",    cls: "bg-blue-100 text-blue-600 border border-blue-200" };
}

function fmt(n, decimals = 0) {
  if (n === undefined || n === null || n === "") return "—";
  const num = Number(n);
  if (isNaN(num)) return "—";
  return num.toLocaleString("fr-DZ", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDate(d) {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }); }
  catch { return ""; }
}

function genPoId() {
  const now = new Date();
  const ymd = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BC-${ymd}-${rand}`;
}

function getSession() {
  return getRawSession() || {};
}

// ── Composant Image produit ───────────────────────────────────────
function ProductImage({ src, title, size = "w-16 h-16" }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className={`${size} rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0 text-indigo-600 font-bold text-xl`}>
        {(title || "?")[0].toUpperCase()}
      </div>
    );
  }
  return (
    <img src={src} alt={title} className={`${size} rounded-xl object-cover flex-shrink-0`} onError={() => setErr(true)} />
  );
}

// ── Card À Acheter ────────────────────────────────────────────────
function CardAcheter({ article, selected, qty, onToggle, onQtyChange, isOwner }) {
  const badge    = scoreLabel(article.score_urgence);
  const isAchete = article.Achetee === true || article.Achetee === "TRUE" || article.Achetee === "true";
  const qteRef   = Number(article.quantite_a_commander) || 0; // référence BQ (lecture seule)

  return (
    <div
      className={`relative bg-white rounded-2xl border-2 transition-all duration-200 p-4 cursor-pointer select-none
        ${selected ? "border-indigo-500 shadow-md shadow-indigo-100" : "border-gray-100 hover:border-gray-300"}
        ${isAchete ? "opacity-60" : ""}`}
      onClick={() => onToggle(article.variant_id)}
    >
      {isAchete && (
        <div className="absolute top-3 right-3 bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-green-200">
          ✓ Commandé
        </div>
      )}
      <div className="flex gap-3">
        <ProductImage src={article.image_url} title={article.product_title} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            {badge && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
                {badge.label} {Math.round(Number(article.score_urgence) * 100)}%
              </span>
            )}
          </div>
          <p className="font-semibold text-gray-800 text-sm mt-1 line-clamp-2 leading-snug">
            {article.product_title}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs text-gray-500">
            <span>📦 Stock : <strong className="text-gray-700">{fmt(article.stock_actuel)}</strong></span>
            <span>⏱ J restants : <strong className={`${Number(article.jours_restants) <= 3 ? "text-red-600" : "text-gray-700"}`}>{fmt(article.jours_restants)}</strong></span>
            <span>🚀 Vitesse : <strong className="text-gray-700">{fmt(article.vitesse_par_jour, 1)}/j</strong></span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500">
            <span>📅 J dispo : <strong className="text-gray-700">{fmt(article.jours_disponibilite)}</strong></span>
            <span>🛒 Vendus : <strong className="text-gray-700">{fmt(article.quantite_vendue)}</strong></span>
            <span>📋 Commandes : <strong className="text-gray-700">{fmt(article.nb_commandes)}</strong></span>
          </div>
          {/* Prix visibles par tous */}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500">
            <span>💰 Achat : <strong className="text-gray-700">{fmt(article.cost_price)} DA</strong></span>
            <span>🏷 Vente : <strong className="text-indigo-600">{fmt(article.price)} DA</strong></span>
          </div>
          {/* KPI financiers : owner uniquement */}
          {isOwner && (article.benefice_60j || article.perte_estimee_rupture) && (
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs">
              {article.benefice_60j && <span className="text-green-600">📈 Bénéfice 60j : {fmt(article.benefice_60j)} DA</span>}
              {article.perte_estimee_rupture && <span className="text-red-500">⚠️ Perte rupture : {fmt(article.perte_estimee_rupture)} DA</span>}
            </div>
          )}
        </div>
      </div>

      {/* Zone quantité */}
      <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Ligne qté suggérée */}
        {qteRef > 0 && (
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100">
            <span className="text-[11px] text-gray-400">Qté suggérée</span>
            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg">{fmt(qteRef)} unités</span>
          </div>
        )}
        {/* Ligne qté achetée */}
        <div className="flex items-center gap-3 px-3 py-2">
          <span className="text-xs text-gray-600 font-medium flex-shrink-0">Qté achetée</span>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={e => onQtyChange(article.variant_id, e.target.value)}
            onClick={e => { e.stopPropagation(); if (!selected) onToggle(article.variant_id); }}
            className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center font-bold focus:border-indigo-400 focus:outline-none bg-white"
            placeholder="0"
          />
          <label className="flex items-center gap-1.5 ml-auto cursor-pointer" onClick={e => { e.stopPropagation(); onToggle(article.variant_id); }}>
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors
              ${selected ? "bg-indigo-600 border-indigo-600" : "border-gray-300 bg-white"}`}>
              {selected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            </div>
            <span className="text-xs text-gray-600">Sélectionner</span>
          </label>
        </div>
      </div>
    </div>
  );
}

// ── Card Dispo / Non Dispo ────────────────────────────────────────
function CardJamaisVendu({ article, dispo, selected, qty, onToggle, onQtyChange }) {
  return (
    <div
      className={`relative bg-white rounded-2xl border-2 transition-all duration-200 p-4 cursor-pointer select-none
        ${selected ? "border-indigo-500 shadow-md shadow-indigo-100" : "border-gray-100 hover:border-gray-300"}`}
      onClick={() => onToggle(article.variant_id)}
    >
      <div className="flex gap-3">
        <ProductImage src={article.image_url} title={article.product_title} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            {dispo ? (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                EN STOCK
              </span>
            ) : (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                RUPTURE
              </span>
            )}
            {article.type_produit && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {article.type_produit}
              </span>
            )}
          </div>
          <p className="font-semibold text-gray-800 text-sm mt-1 line-clamp-2 leading-snug">
            {article.product_title}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs text-gray-500">
            {dispo && <span>📦 Stock : <strong className="text-green-700">{fmt(article.stock_actuel)}</strong></span>}
            {dispo && article.valeur_stock && <span>💵 Valeur stock : <strong className="text-gray-700">{fmt(article.valeur_stock)} DA</strong></span>}
            <span>💰 Achat : <strong className="text-gray-700">{fmt(article.cost_price)} DA</strong></span>
            <span>🏷 Vente : <strong className="text-indigo-600">{fmt(article.price)} DA</strong></span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2" onClick={e => e.stopPropagation()}>
        <label className="text-xs text-gray-500 font-medium flex-shrink-0">Qté achetée :</label>
        <input
          type="number"
          min="1"
          value={qty}
          onChange={e => onQtyChange(article.variant_id, e.target.value)}
          onClick={e => { e.stopPropagation(); if (!selected) onToggle(article.variant_id); }}
          className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center font-semibold focus:border-indigo-400 focus:outline-none bg-white"
          placeholder="0"
        />
        <label className="flex items-center gap-1.5 ml-auto cursor-pointer" onClick={e => { e.stopPropagation(); onToggle(article.variant_id); }}>
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors
            ${selected ? "bg-indigo-600 border-indigo-600" : "border-gray-300 bg-white"}`}>
            {selected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </div>
          <span className="text-xs text-gray-600">Sélectionner</span>
        </label>
      </div>
    </div>
  );
}

// ── Card Demande ──────────────────────────────────────────────────
function CardDemande({ rapport }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 mb-2">
            {rapport.cas}
          </span>
          {rapport.product_name && (
            <p className="font-semibold text-gray-800 text-sm">{rapport.product_name}</p>
          )}
          {rapport.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-3">{rapport.description}</p>
          )}
          <div className="flex gap-3 mt-2 text-xs text-gray-400">
            <span>👤 {rapport.agent}</span>
            <span>📅 {fmtDate(rapport.created_at)}</span>
          </div>
        </div>
        {rapport["piece jointe"] && (
          <img src={rapport["piece jointe"]} alt="pj" className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-gray-100" />
        )}
      </div>
    </div>
  );
}

// ── Modal Bon de Commande ─────────────────────────────────────────
function ModalBC({ selection, allArticles, onClose, onConfirm, creating }) {
  const [lines, setLines] = useState(() =>
    Object.entries(selection).map(([vid, item]) => {
      const src = allArticles.find(a => String(a.variant_id) === vid) || {};
      return {
        variant_id:     vid,
        product_title:  item.product_title || src.product_title || vid,
        image_url:      item.image_url || src.image_url || "",
        qty:            item.qty,
        purchase_price: item.purchase_price !== undefined ? item.purchase_price : (src.cost_price || 0),
        sell_price:     item.sell_price     !== undefined ? item.sell_price     : (src.price || 0),
        note:           item.note || "",
        barcode:        src.barcode || "",
        collections_titles_pick: src.collections_titles || "",
      };
    })
  );

  const totalArticles = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const totalValeur   = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.purchase_price || 0), 0);

  function updateLine(vid, field, val) {
    setLines(prev => prev.map(l => l.variant_id === vid ? { ...l, [field]: val } : l));
  }

  function removeLine(vid) {
    setLines(prev => prev.filter(l => l.variant_id !== vid));
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-800">📋 Nouveau bon de commande</h2>
            <p className="text-xs text-gray-400 mt-0.5">{lines.length} article{lines.length > 1 ? "s" : ""} · {fmt(totalArticles)} unités · Valeur ~{fmt(totalValeur)} DA</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">✕</button>
        </div>

        {/* Lines */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {lines.length === 0 && (
            <p className="text-center text-gray-400 py-8">Aucun article sélectionné</p>
          )}
          {lines.map(line => (
            <div key={line.variant_id} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex gap-3 mb-2">
                <ProductImage src={line.image_url} title={line.product_title} size="w-10 h-10" />
                <p className="text-sm font-semibold text-gray-800 line-clamp-2 flex-1">{line.product_title}</p>
                <button onClick={() => removeLine(line.variant_id)} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 self-start text-lg leading-none">
                  🗑
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-gray-400">Qté</label>
                  <input type="number" min="1" value={line.qty}
                    onChange={e => updateLine(line.variant_id, "qty", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center font-semibold focus:border-indigo-400 focus:outline-none bg-white"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-gray-400">Prix achat</label>
                  <input type="number" min="0" value={line.purchase_price}
                    onChange={e => updateLine(line.variant_id, "purchase_price", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:border-indigo-400 focus:outline-none bg-white"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-gray-400">Prix vente</label>
                  <input type="number" min="0" value={line.sell_price}
                    onChange={e => updateLine(line.variant_id, "sell_price", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:border-indigo-400 focus:outline-none bg-white"
                  />
                </div>
                <div className="flex flex-col gap-0.5 col-span-2 sm:col-span-1">
                  <label className="text-xs text-gray-400">Note</label>
                  <input type="text" value={line.note} placeholder="Optionnel…"
                    onChange={e => updateLine(line.variant_id, "note", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none bg-white"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} disabled={creating}
            className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
            Annuler
          </button>
          <button onClick={() => onConfirm(lines)} disabled={creating || lines.length === 0}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2">
            {creating ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Création…</>
            ) : (
              <>✅ Créer le bon de commande</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Historique BC ─────────────────────────────────────────────────
function HistoriqueBC({ poLines, onClose }) {
  // Grouper par po_id
  const grouped = useMemo(() => {
    const map = {};
    poLines.forEach(l => {
      const id = l.po_id || "—";
      if (!map[id]) map[id] = { po_id: id, created_at: l.created_at, lines: [] };
      map[id].lines.push(l);
    });
    return Object.values(map).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [poLines]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">📂 Historique des bons de commande</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {grouped.length === 0 && <p className="text-center text-gray-400 py-8">Aucun bon de commande</p>}
          {grouped.map(g => (
            <div key={g.po_id} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-sm text-gray-800">{g.po_id}</span>
                  <span className="text-xs text-gray-400 ml-3">📅 {fmtDate(g.created_at)}</span>
                </div>
                <span className="text-xs text-gray-500">{g.lines.length} article{g.lines.length > 1 ? "s" : ""}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {g.lines.map((l, i) => (
                  <div key={i} className="px-4 py-2 flex items-center gap-3 text-sm">
                    <span className="text-gray-700 flex-1 line-clamp-1">{l.product_title || l.variant_id}</span>
                    <span className="text-indigo-600 font-semibold w-12 text-right">{fmt(l.qty_add)}</span>
                    <span className="text-gray-400 w-24 text-right text-xs">{fmt(l.purchase_price)} DA</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Impression étiquettes barcodes ───────────────────────────────
function printBarcodeLabels(lines) {
  const valid = lines.filter(l => String(l.barcode || "").trim() && Number(l.qty_add) > 0);
  if (valid.length === 0) {
    alert("Aucune ligne avec code-barre valide trouvée.");
    return;
  }
  const totalLabels = valid.reduce((s, l) => s + Number(l.qty_add), 0);
  if (totalLabels > 800 && !confirm(`⚠️ ${totalLabels} étiquettes à imprimer. Continuer ?`)) return;

  let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Étiquettes</title>
<style>
  @page { size: 40mm 20mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; }
  .label {
    width: 40mm; height: 20mm;
    display: flex; flex-direction: column;
    justify-content: center; align-items: center;
    page-break-after: always; padding: 1mm; overflow: hidden;
  }
  .title {
    font-size: 7px; font-weight: 500; text-align: center;
    max-width: 38mm; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; margin-bottom: 1mm;
  }
  .barcode-img { height: 10mm; width: auto; max-width: 36mm; }
  .price { font-size: 11px; font-weight: bold; margin-top: 1mm; }
</style>
</head><body>`;

  valid.forEach(line => {
    const qty    = Number(line.qty_add);
    const code   = String(line.barcode).trim();
    const title  = (line.product_title || "—").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const price  = line.sell_price ? `${line.sell_price} DA` : "";
    const imgUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(code)}&scale=3&height=10`;
    for (let i = 0; i < Math.min(qty, 200); i++) {
      html += `<div class="label">
  <div class="title">${title}</div>
  <img class="barcode-img" src="${imgUrl}" alt="${code}" onerror="this.style.display='none'">
  <div class="price">${price}</div>
</div>`;
    }
  });

  html += `<script>
window.onload=function(){
  var imgs=document.querySelectorAll('img'),total=imgs.length,loaded=0;
  if(!total){window.print();return;}
  function check(){loaded++;if(loaded>=total)window.print();}
  imgs.forEach(function(img){if(img.complete)check();else{img.onload=check;img.onerror=check;}});
};<\/script></body></html>`;

  const win = window.open("", "_blank", "width=800,height=600");
  if (!win) { alert("Veuillez autoriser les fenêtres pop-up pour imprimer."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
}

// ── Modal impression barcodes ─────────────────────────────────────
function ModalPrintBarcodes({ poLines, onClose }) {
  const grouped = useMemo(() => {
    const map = {};
    poLines.forEach(l => {
      const id = l.po_id || "—";
      if (!map[id]) map[id] = { po_id: id, created_at: l.created_at, lines: [] };
      map[id].lines.push(l);
    });
    return Object.values(map).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [poLines]);

  const validAll    = poLines.filter(l => String(l.barcode || "").trim() && Number(l.qty_add) > 0);
  const totalLabels = validAll.reduce((s, l) => s + Number(l.qty_add), 0);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-800">🏷 Imprimer étiquettes barcodes</h2>
            <p className="text-xs text-gray-400 mt-0.5">{validAll.length} articles · {totalLabels} étiquettes total</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">✕</button>
        </div>

        {/* Tout imprimer */}
        <div className="px-6 py-3 bg-purple-50 border-b border-purple-100 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-purple-900">Tous les bons de commande</p>
            <p className="text-xs text-purple-500">{grouped.length} BC · {totalLabels} étiquettes</p>
          </div>
          <button
            onClick={() => printBarcodeLabels(validAll)}
            disabled={validAll.length === 0}
            className="bg-purple-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-40 flex items-center gap-2 flex-shrink-0"
          >
            🖨 Tout imprimer
          </button>
        </div>

        {/* Par BC */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {grouped.length === 0 && <p className="text-center text-gray-400 py-8">Aucun bon de commande</p>}
          {grouped.map(g => {
            const bcValid  = g.lines.filter(l => String(l.barcode || "").trim() && Number(l.qty_add) > 0);
            const bcLabels = bcValid.reduce((s, l) => s + Number(l.qty_add), 0);
            return (
              <div key={g.po_id} className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-semibold text-sm text-gray-800">{g.po_id}</span>
                    <span className="text-xs text-gray-400 ml-3">📅 {fmtDate(g.created_at)}</span>
                    <span className="text-xs text-indigo-500 ml-2 font-medium">· {bcLabels} étiquettes</span>
                  </div>
                  <button
                    onClick={() => printBarcodeLabels(bcValid)}
                    disabled={bcValid.length === 0}
                    className="text-sm px-3 py-1.5 bg-indigo-50 text-indigo-700 font-medium rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-40 flex-shrink-0 flex items-center gap-1"
                  >
                    🖨 Imprimer
                  </button>
                </div>
                <div className="divide-y divide-gray-50">
                  {g.lines.slice(0, 5).map((l, i) => (
                    <div key={i} className="px-4 py-2 flex items-center gap-3">
                      <span className="text-gray-700 flex-1 line-clamp-1 text-xs">{l.product_title || l.variant_id}</span>
                      <span className={`font-mono text-xs flex-shrink-0 ${l.barcode ? "text-gray-400" : "text-red-300"}`}>
                        {l.barcode || "⚠ no barcode"}
                      </span>
                      <span className="text-indigo-600 font-semibold text-xs w-8 text-right flex-shrink-0">{fmt(l.qty_add)}</span>
                    </div>
                  ))}
                  {g.lines.length > 5 && (
                    <div className="px-4 py-1.5 text-xs text-gray-400 text-center">+{g.lines.length - 5} autres articles</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  const cls = type === "success" ? "bg-green-600" : "bg-red-600";
  return (
    <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 ${cls} text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-medium flex items-center gap-2 animate-fade-in`}>
      {type === "success" ? "✅" : "❌"} {msg}
    </div>
  );
}

// ── Statut BC badge ───────────────────────────────────────────────
const STATUT_BC = {
  cree:     { label: "Créé",     cls: "bg-gray-100 text-gray-600",    icon: "📋" },
  envoye:   { label: "Envoyé",   cls: "bg-blue-100 text-blue-700",    icon: "📤" },
  confirme: { label: "Confirmé", cls: "bg-indigo-100 text-indigo-700",icon: "✅" },
  recu:     { label: "Reçu",     cls: "bg-green-100 text-green-700",  icon: "📦" },
  injecte:  { label: "Injecté",  cls: "bg-emerald-100 text-emerald-700", icon: "🔄" },
};

function StatutBadge({ statut }) {
  const s = STATUT_BC[statut] || STATUT_BC.cree;
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

// ── Export PDF bon de commande ─────────────────────────────────────
function exportBCPdf(bc) {
  const totalUnites = bc.lines.reduce((s, l) => s + Number(l.qty_add || 0), 0);
  const totalValeur = bc.lines.reduce((s, l) => s + Number(l.qty_add || 0) * Number(l.purchase_price || 0), 0);

  const lignesHtml = bc.lines.map(l => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9">${(l.product_title || "—").replace(/</g,"&lt;")}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600">${l.qty_add}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:right">${l.purchase_price ? l.purchase_price + " DA" : "—"}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:right;color:#4f46e5;font-weight:600">${l.purchase_price ? (Number(l.qty_add) * Number(l.purchase_price)).toLocaleString("fr-DZ") + " DA" : "—"}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:11px">${l.note || ""}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>BC ${bc.po_id}</title>
<style>
  body { font-family: Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .logo { font-size: 22px; font-weight: 900; color: #4f46e5; letter-spacing: -1px; }
  .bc-id { font-size: 13px; color: #64748b; margin-top: 4px; }
  .meta { text-align: right; font-size: 12px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f8fafc; padding: 10px; text-align: left; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; }
  th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: center; }
  .total-row td { font-weight: 700; background: #f8fafc; padding: 10px; border-top: 2px solid #e2e8f0; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print { @page { margin: 15mm; } }
</style></head><body>
<div class="header">
  <div>
    <div class="logo">NajmCoiff</div>
    <div class="bc-id">Bon de commande : <strong>${bc.po_id}</strong></div>
    ${bc.fournisseur_nom ? `<div class="bc-id">Fournisseur : <strong>${bc.fournisseur_nom}</strong></div>` : ""}
  </div>
  <div class="meta">
    <div>Date : ${new Date(bc.created_at).toLocaleDateString("fr-FR")}</div>
    <div>${bc.lines.length} article(s) · ${totalUnites} unités</div>
    <div style="font-weight:700;color:#4f46e5;margin-top:4px">Total : ${totalValeur.toLocaleString("fr-DZ")} DA</div>
  </div>
</div>
<table>
  <thead><tr>
    <th>Article</th><th style="text-align:center">Qté</th>
    <th style="text-align:right">Prix unitaire</th>
    <th style="text-align:right">Total</th>
    <th>Note</th>
  </tr></thead>
  <tbody>${lignesHtml}</tbody>
  <tfoot><tr class="total-row">
    <td colspan="3">TOTAL GÉNÉRAL</td>
    <td style="text-align:right;color:#4f46e5">${totalValeur.toLocaleString("fr-DZ")} DA</td>
    <td></td>
  </tr></tfoot>
</table>
<div class="footer">NajmCoiff — Généré le ${new Date().toLocaleDateString("fr-FR")} · Document confidentiel</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("Autorisez les pop-ups pour exporter en PDF"); return; }
  win.document.write(html);
  win.document.close();
}

// ── Modal Historique V2 (statut + fournisseur + comparaison + PDF) ─
function Historique({ poLines, fournisseurs, onClose, onToast }) {
  const [sending, setSending]     = useState({});
  const [selectedF, setSelectedF] = useState({});   // po_id → [fournisseur_id]
  const [comparaison, setComparaison] = useState(null);
  const [loadingComp, setLoadingComp] = useState(false);

  const grouped = useMemo(() => {
    const map = {};
    poLines.forEach(l => {
      const id = l.po_id || "—";
      if (!map[id]) map[id] = { po_id: id, created_at: l.created_at, statut: l.statut || "cree", fournisseur_nom: l.fournisseur_nom, lines: [] };
      map[id].lines.push(l);
    });
    return Object.values(map).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [poLines]);

  async function sendToFournisseur(po_id) {
    const ids = selectedF[po_id] || [];
    if (!ids.length) { onToast("Sélectionnez au moins un fournisseur", "error"); return; }
    setSending(p => ({ ...p, [po_id]: true }));
    try {
      const res = await api.sendBCToFournisseur(po_id, ids);
      if (res.ok) {
        onToast(`BC envoyé à ${res.results?.length} fournisseur(s)`, "success");
        setSelectedF(p => ({ ...p, [po_id]: [] }));
      } else {
        onToast(res.error || "Erreur envoi", "error");
      }
    } finally {
      setSending(p => ({ ...p, [po_id]: false }));
    }
  }

  async function showComparaison(po_id) {
    setLoadingComp(true);
    try {
      const res = await api.getComparaison(po_id);
      if (res.ok) setComparaison({ po_id, ...res });
      else onToast(res.error || "Erreur", "error");
    } finally {
      setLoadingComp(false);
    }
  }

  if (comparaison) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setComparaison(null)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-bold text-gray-800">📊 Comparaison devis — {comparaison.po_id}</h2>
              {comparaison.total_economie_da > 0 && (
                <p className="text-xs text-green-600 mt-0.5">💰 Économie potentielle : <strong>{fmt(comparaison.total_economie_da)} DA</strong></p>
              )}
            </div>
            <button onClick={() => setComparaison(null)} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {(comparaison.lignes || []).map(ligne => (
              <div key={ligne.variant_id} className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-gray-800 line-clamp-1 flex-1">{ligne.product_title}</span>
                  <span className="text-xs text-gray-500 flex-shrink-0">× {fmt(ligne.qty_demandee)}</span>
                  {ligne.economie_da > 0 && (
                    <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex-shrink-0">
                      -{fmt(ligne.economie_da)} DA
                    </span>
                  )}
                </div>
                <div className="divide-y divide-gray-50">
                  {ligne.devis.length === 0 && (
                    <p className="px-4 py-2 text-xs text-gray-400">Aucun devis reçu</p>
                  )}
                  {ligne.devis.map((d, i) => (
                    <div key={i} className={`px-4 py-2 flex items-center gap-3 text-sm ${d.est_meilleur ? "bg-green-50" : ""}`}>
                      <span className="text-gray-700 flex-1 font-medium">{d.fournisseur_nom}</span>
                      {!d.disponible && <span className="text-xs text-red-500">❌ Indisponible</span>}
                      {d.delai_jours && <span className="text-xs text-gray-400">⏱ {d.delai_jours}j</span>}
                      <span className={`font-bold text-sm ${d.est_meilleur ? "text-green-700" : "text-gray-700"}`}>
                        {d.est_meilleur && "⭐ "}{fmt(d.prix_unitaire)} DA
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">📂 Historique des bons de commande</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {grouped.length === 0 && <p className="text-center text-gray-400 py-8">Aucun bon de commande</p>}
          {grouped.map(g => (
            <div key={g.po_id} className="border border-gray-100 rounded-xl overflow-hidden">
              {/* BC Header */}
              <div className="bg-gray-50 px-4 py-2.5 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm text-gray-800">{g.po_id}</span>
                <span className="text-xs text-gray-400">📅 {fmtDate(g.created_at)}</span>
                <StatutBadge statut={g.statut} />
                {g.fournisseur_nom && <span className="text-xs text-indigo-600">🏭 {g.fournisseur_nom}</span>}
                <div className="ml-auto flex items-center gap-1.5">
                  <button onClick={() => exportBCPdf(g)} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors" title="Exporter PDF">
                    📄 PDF
                  </button>
                  <button onClick={() => showComparaison(g.po_id)} disabled={loadingComp}
                    className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors" title="Voir comparaison devis">
                    📊 Devis
                  </button>
                </div>
              </div>

              {/* Lignes articles */}
              <div className="divide-y divide-gray-50">
                {g.lines.map((l, i) => (
                  <div key={i} className="px-4 py-2 flex items-center gap-3 text-sm">
                    <span className="text-gray-700 flex-1 line-clamp-1">{l.product_title || l.variant_id}</span>
                    <span className="text-indigo-600 font-semibold w-12 text-right">{fmt(l.qty_add)}</span>
                    <span className="text-gray-400 w-24 text-right text-xs">{fmt(l.purchase_price)} DA</span>
                  </div>
                ))}
              </div>

              {/* Zone envoi fournisseur */}
              {fournisseurs.length > 0 && g.statut === "cree" && (
                <div className="bg-indigo-50 px-4 py-3 border-t border-indigo-100">
                  <p className="text-xs font-semibold text-indigo-700 mb-2">📤 Envoyer à un fournisseur pour devis</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {fournisseurs.filter(f => f.active).map(f => (
                      <label key={f.id} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(selectedF[g.po_id] || []).includes(f.id)}
                          onChange={e => {
                            setSelectedF(prev => {
                              const cur = prev[g.po_id] || [];
                              return { ...prev, [g.po_id]: e.target.checked ? [...cur, f.id] : cur.filter(x => x !== f.id) };
                            });
                          }}
                          className="accent-indigo-600"
                        />
                        <span className="text-xs text-indigo-800 font-medium">{f.nom}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => sendToFournisseur(g.po_id)}
                    disabled={sending[g.po_id] || !(selectedF[g.po_id] || []).length}
                    className="text-xs px-3 py-1.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                  >
                    {sending[g.po_id] ? "Envoi…" : "📤 Envoyer"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Modal Gestion Fournisseurs ────────────────────────────────────
function ModalFournisseurs({ fournisseurs, onClose, onToast, onRefresh }) {
  const [form, setForm] = useState({ nom: "", phone: "", email: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://najmcoiffdashboard.vercel.app";

  function copyLink(token) {
    const url = `${appUrl}/fournisseur/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(token);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  async function create() {
    if (!form.nom.trim()) { onToast("Nom requis", "error"); return; }
    setSaving(true);
    try {
      const res = await api.createFournisseur(form);
      if (res.ok) {
        onToast(`Fournisseur "${form.nom}" créé`, "success");
        setForm({ nom: "", phone: "", email: "", note: "" });
        onRefresh();
      } else {
        onToast(res.error || "Erreur", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggle(f) {
    const res = await api.updateFournisseur({ id: f.id, active: !f.active });
    if (res.ok) onRefresh();
    else onToast(res.error || "Erreur", "error");
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">🏭 Gestion des fournisseurs</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Formulaire nouveau fournisseur */}
          <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
            <p className="text-xs font-semibold text-indigo-700 mb-3">+ Nouveau fournisseur</p>
            <div className="space-y-2">
              <input type="text" placeholder="Nom *" value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white" />
              <div className="grid grid-cols-2 gap-2">
                <input type="tel" placeholder="Téléphone" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white" />
                <input type="email" placeholder="Email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white" />
              </div>
              <button onClick={create} disabled={saving}
                className="w-full bg-indigo-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? "Création…" : "Créer le fournisseur"}
              </button>
            </div>
          </div>

          {/* Liste fournisseurs */}
          {fournisseurs.length === 0 && <p className="text-center text-gray-400 py-4 text-sm">Aucun fournisseur créé</p>}
          {fournisseurs.map(f => (
            <div key={f.id} className={`border rounded-xl p-4 ${f.active ? "border-gray-100" : "border-gray-100 opacity-60"}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{f.nom}</p>
                  {f.phone && <p className="text-xs text-gray-500">📞 {f.phone}</p>}
                  {f.email && <p className="text-xs text-gray-500">✉️ {f.email}</p>}
                </div>
                <button onClick={() => toggle(f)}
                  className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${f.active ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-green-50 text-green-600 hover:bg-green-100"}`}>
                  {f.active ? "Désactiver" : "Activer"}
                </button>
              </div>
              {f.token_secret && (
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-gray-400 flex-1 font-mono truncate">{appUrl}/fournisseur/{f.token_secret.slice(0, 12)}…</span>
                  <button onClick={() => copyLink(f.token_secret)}
                    className={`text-xs font-medium px-2 py-0.5 rounded transition-colors ${copiedId === f.token_secret ? "text-green-600" : "text-indigo-600 hover:text-indigo-800"}`}>
                    {copiedId === f.token_secret ? "✅ Copié" : "📋 Copier lien"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════════════════
export default function AchatsPage() {
  const [tab, setTab]           = useState("acheter");
  const [kpiStock, setKpiStock] = useState([]);
  const [kpiJamais, setKpiJamais] = useState([]);
  const [rapports, setRapports] = useState([]);
  const [poLines, setPoLines]   = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");

  const [selection, setSelection] = useState({});
  const [ordered, setOrdered]     = useState({});

  const [showModal, setShowModal]                 = useState(false);
  const [showHistory, setShowHistory]             = useState(false);
  const [showPrintBarcodes, setShowPrintBarcodes] = useState(false);
  const [showFournisseurs, setShowFournisseurs]   = useState(false);
  const [creating, setCreating]   = useState(false);
  const [toast, setToast]         = useState(null);
  const [user, setUser]           = useState(null);

  // ── Chargement initial ─────────────────────────────────────────
  useEffect(() => {
    const s = getSession();
    setUser(s.user || {});
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        api.getKpiStock(),
        api.getKpiJamaisVendus(),
        api.getRapports(),
        api.getPOLines(),
        api.getFournisseurs().catch(() => ({ rows: [] })),
      ]);
      setKpiStock(r1.rows || []);
      setKpiJamais(r2.rows || []);
      setRapports((r3.rows || []).filter(r => DEMANDES_CAS.includes(r.cas)));
      setPoLines(r4.rows || []);
      setFournisseurs(r5.rows || []);
    } catch (e) {
      console.error("Achats load error:", e);
    } finally {
      setLoading(false);
    }
  }

  async function refreshFournisseurs() {
    const r = await api.getFournisseurs().catch(() => ({ rows: [] }));
    setFournisseurs(r.rows || []);
  }

  // ── Filtres ────────────────────────────────────────────────────
  const q = search.toLowerCase().trim();

  const acheter = useMemo(() =>
    kpiStock.filter(a => !q || smartMatch(search, [a.product_title, a.vendor])),
    [kpiStock, q]);  // eslint-disable-line react-hooks/exhaustive-deps

  const dispoRows = useMemo(() =>
    kpiJamais.filter(a => Number(a.stock_actuel) > 0 && (!q || smartMatch(search, [a.product_title, a.vendor]))),
    [kpiJamais, q]);  // eslint-disable-line react-hooks/exhaustive-deps

  const nodispoRows = useMemo(() =>
    kpiJamais.filter(a => Number(a.stock_actuel) === 0 && (!q || smartMatch(search, [a.product_title, a.vendor]))),
    [kpiJamais, q]);  // eslint-disable-line react-hooks/exhaustive-deps

  const demandesRows = useMemo(() =>
    rapports.filter(r => !q || smartMatch(search, [r.product_name, r.description, r.agent])),
    [rapports, q]);  // eslint-disable-line react-hooks/exhaustive-deps

  const counts = { acheter: acheter.length, dispo: dispoRows.length, nodispo: nodispoRows.length, demandes: demandesRows.length };

  // ── Sélection ─────────────────────────────────────────────────
  const isOwner = ["owner"].includes((user?.role || "").toLowerCase().trim());

  function toggleSelect(variantId) {
    const article =
      kpiStock.find(a => String(a.variant_id) === String(variantId)) ||
      kpiJamais.find(a => String(a.variant_id) === String(variantId)) ||
      {};

    setSelection(prev => {
      if (prev[variantId]) {
        const next = { ...prev };
        delete next[variantId];
        return next;
      }
      return {
        ...prev,
        [variantId]: {
          qty:                   1, // qté achetée — l'acheteur saisit la vraie quantité
          quantite_a_commander:  Number(article.quantite_a_commander) || 0, // référence BQ
          purchase_price:        Number(article.cost_price) || 0,
          sell_price:            Number(article.price) || 0,
          product_title:         article.product_title || variantId,
          image_url:             article.image_url || "",
          note:                  "",
        },
      };
    });
  }

  function updateQty(variantId, val) {
    const qty = Math.max(1, Number(val) || 1);
    setSelection(prev => prev[variantId] ? { ...prev, [variantId]: { ...prev[variantId], qty } } : prev);
  }

  const selCount = Object.keys(selection).length;

  // ── Créer BC ───────────────────────────────────────────────────
  async function handleConfirmBC(lines) {
    setCreating(true);
    try {
      const po_id = genPoId();
      const payload = lines.map(l => ({
        variant_id:     l.variant_id,
        product_title:  l.product_title,
        qty_add:        Number(l.qty) || 1,
        purchase_price: Number(l.purchase_price) || 0,
        sell_price:     Number(l.sell_price) || 0,
        note:           l.note || "",
        barcode:        l.barcode || "",
        collections_titles_pick: l.collections_titles_pick || "",
      }));

      const res = await api.addPOLines(po_id, payload);
      if (!res.ok) throw new Error(res.error || "Erreur serveur");

      // Marquer comme commandé dans la feuille (silencieux si échec)
      const acheterIds = lines.map(l => l.variant_id).filter(vid => kpiStock.find(a => String(a.variant_id) === vid));
      await Promise.allSettled(acheterIds.map(vid => api.markAchete(vid, true)));

      // Mise à jour locale
      const newOrdered = { ...ordered };
      lines.forEach(l => { newOrdered[l.variant_id] = true; });
      setOrdered(newOrdered);

      setKpiStock(prev => prev.map(a =>
        acheterIds.includes(String(a.variant_id)) ? { ...a, Achetee: true } : a
      ));

      setSelection({});
      setShowModal(false);
      setToast({ msg: `Bon de commande ${po_id} créé — ${lines.length} article(s)`, type: "success" });

      // Recharger l'historique
      const r4 = await api.getPOLines();
      setPoLines(r4.rows || []);

    } catch (e) {
      setToast({ msg: e.message || "Erreur création BC", type: "error" });
    } finally {
      setCreating(false);
    }
  }

  // ── All articles (pour le modal) ──────────────────────────────
  const allArticles = useMemo(() => [...kpiStock, ...kpiJamais], [kpiStock, kpiJamais]);

  // ── Render ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-gray-400">
        <span className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        Chargement des données d&apos;achat…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-32">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pt-6 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🛒 Achats</h1>
          <p className="text-sm text-gray-400 mt-0.5">Suivi stock urgence + articles jamais vendus</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isOwner && (
            <button onClick={() => setShowFournisseurs(true)}
              className="text-xs text-green-600 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg font-medium transition-colors border border-green-100">
              🏭 <span className="hidden sm:inline">Fournisseurs</span>
              {fournisseurs.filter(f => f.active).length > 0 && (
                <span className="ml-1 bg-green-200 text-green-800 text-[10px] px-1 py-0.5 rounded-full">{fournisseurs.filter(f => f.active).length}</span>
              )}
            </button>
          )}
          <button onClick={() => setShowPrintBarcodes(true)}
            className="text-xs text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg font-medium transition-colors border border-purple-100">
            🏷 <span className="hidden sm:inline">Étiquettes</span>
          </button>
          <button onClick={() => setShowHistory(true)}
            className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-medium transition-colors border border-indigo-100">
            📂 <span className="hidden sm:inline">BC & Devis</span>
          </button>
          <button onClick={loadAll}
            className="text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg font-medium transition-colors">
            ↺ <span className="hidden sm:inline">Actualiser</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSearch(""); }}
            className={`flex-1 text-xs sm:text-sm font-medium py-2 px-2 rounded-lg transition-all duration-150
              ${tab === t.key ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
            <span className="hidden sm:inline">{t.icon} </span>{t.label}
            <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? "bg-indigo-100 text-indigo-600" : "bg-gray-200 text-gray-400"}`}>
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      {tab !== "demandes" && (
        <div className="relative mb-4">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par nom de produit…"
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">✕</button>
          )}
        </div>
      )}

      {/* ── TAB: À ACHETER ── */}
      {tab === "acheter" && (
        <div className="space-y-3">
          {acheter.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">🎉</div>
              <p className="font-medium">Aucun article en urgence d&apos;achat</p>
              <p className="text-sm mt-1">Tous les stocks sont suffisants</p>
            </div>
          ) : (
            acheter.map(a => (
              <CardAcheter
                key={a.variant_id}
                article={a}
                selected={!!selection[a.variant_id]}
                qty={selection[a.variant_id]?.qty ?? 1}
                onToggle={toggleSelect}
                onQtyChange={updateQty}
                isOwner={isOwner}
              />
            ))
          )}
        </div>
      )}

      {/* ── TAB: DISPO NON VENDU ── */}
      {tab === "dispo" && (
        <div className="space-y-3">
          {dispoRows.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">📦</div>
              <p className="font-medium">Aucun article en stock non vendu</p>
            </div>
          ) : (
            dispoRows.map(a => (
              <CardJamaisVendu
                key={a.variant_id}
                article={a}
                dispo={true}
                selected={!!selection[a.variant_id]}
                qty={selection[a.variant_id]?.qty ?? 1}
                onToggle={toggleSelect}
                onQtyChange={updateQty}
              />
            ))
          )}
        </div>
      )}

      {/* ── TAB: NON DISPO ── */}
      {tab === "nodispo" && (
        <div className="space-y-3">
          {nodispoRows.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-medium">Aucun article en rupture</p>
            </div>
          ) : (
            nodispoRows.map(a => (
              <CardJamaisVendu
                key={a.variant_id}
                article={a}
                dispo={false}
                selected={!!selection[a.variant_id]}
                qty={selection[a.variant_id]?.qty ?? 1}
                onToggle={toggleSelect}
                onQtyChange={updateQty}
              />
            ))
          )}
        </div>
      )}

      {/* ── TAB: DEMANDES ── */}
      {tab === "demandes" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400 px-1 mb-3">Rapports signalés par l&apos;équipe — suggestions &amp; articles demandés</p>
          {demandesRows.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">💬</div>
              <p className="font-medium">Aucune demande produit</p>
            </div>
          ) : (
            demandesRows.map(r => <CardDemande key={r.report_id} rapport={r} />)
          )}
        </div>
      )}

      {/* ── Sticky bar sélection ── */}
      {selCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4">
          <div className="max-w-5xl mx-auto">
            <div className="bg-indigo-600 text-white rounded-2xl shadow-2xl px-5 py-3.5 flex items-center justify-between gap-4">
              <div>
                <p className="font-bold text-sm">{selCount} article{selCount > 1 ? "s" : ""} sélectionné{selCount > 1 ? "s" : ""}</p>
                <p className="text-indigo-200 text-xs">
                  {Object.values(selection).reduce((s, i) => s + Number(i.qty || 0), 0)} unités
                  · ~{fmt(Object.values(selection).reduce((s, i) => s + Number(i.qty || 0) * Number(i.purchase_price || 0), 0))} DA
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelection({})}
                  className="text-indigo-200 hover:text-white text-xs px-3 py-1.5 rounded-lg hover:bg-indigo-500 transition-colors">
                  Vider
                </button>
                <button onClick={() => setShowModal(true)}
                  className="bg-white text-indigo-700 font-bold text-sm px-5 py-2 rounded-xl hover:bg-indigo-50 transition-colors shadow">
                  📋 Créer bon de commande
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <ModalBC
          selection={selection}
          allArticles={allArticles}
          onClose={() => setShowModal(false)}
          onConfirm={handleConfirmBC}
          creating={creating}
        />
      )}
      {showHistory && (
        <Historique
          poLines={poLines}
          fournisseurs={fournisseurs}
          onClose={() => setShowHistory(false)}
          onToast={(msg, type) => setToast({ msg, type })}
        />
      )}
      {showPrintBarcodes && (
        <ModalPrintBarcodes poLines={poLines} onClose={() => setShowPrintBarcodes(false)} />
      )}
      {showFournisseurs && (
        <ModalFournisseurs
          fournisseurs={fournisseurs}
          onClose={() => setShowFournisseurs(false)}
          onToast={(msg, type) => setToast({ msg, type })}
          onRefresh={refreshFournisseurs}
        />
      )}
      {toast && (
        <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
