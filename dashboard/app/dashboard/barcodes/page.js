"use client";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";
import Toast from "@/components/Toast";

// ── Barcode SVG minimal (Code128-like visual, simplifié) ──────────
// Pour la production, utiliser la lib jsbarcode via un script CDN
function BarcodeDisplay({ value, label, price }) {
  if (!value) return null;
  return (
    <div className="barcode-item">
      <div className="barcode-label">{label || value}</div>
      {price > 0 && <div className="barcode-price">{Number(price).toLocaleString("fr-DZ")} DA</div>}
      <div className="barcode-value">{value}</div>
      {/* Barcode rendu par jsbarcode au montage */}
      <svg
        className="barcode-svg"
        data-barcode={value}
        style={{ display: "block", margin: "0 auto" }}
      />
    </div>
  );
}

export default function BarcodesPage() {
  const [loading, setLoading]   = useState(true);
  const [rows, setRows]         = useState([]);
  const [po_ids, setPoIds]      = useState([]);
  const [filterPo, setFilterPo] = useState("");
  const [toast, setToast]       = useState(null);
  const jsBarcodeLoaded         = useRef(false);

  useEffect(() => {
    loadData();
    loadJsBarcode();
  }, []);

  async function loadData(poId = "") {
    setLoading(true);
    try {
      const r = await api.printBarcodes(poId);
      if (r.ok) {
        setRows(r.rows || []);
        setPoIds(r.po_ids || []);
      } else {
        setToast({ type: "error", msg: r.error || "Erreur chargement barcodes" });
      }
    } catch (e) {
      setToast({ type: "error", msg: String(e.message || e) });
    }
    setLoading(false);
  }

  function loadJsBarcode() {
    if (jsBarcodeLoaded.current || typeof window === "undefined") return;
    jsBarcodeLoaded.current = true;
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js";
    s.onload = () => renderBarcodes();
    document.head.appendChild(s);
  }

  function renderBarcodes() {
    if (typeof window === "undefined" || !window.JsBarcode) return;
    document.querySelectorAll("svg[data-barcode]").forEach(svg => {
      const val = svg.getAttribute("data-barcode");
      if (!val) return;
      try {
        window.JsBarcode(svg, val, {
          format: "CODE128",
          width: 1.5,
          height: 50,
          displayValue: false,
          margin: 2,
        });
      } catch { /* skip invalid barcodes */ }
    });
  }

  // Re-render barcodes after rows change
  useEffect(() => {
    if (rows.length > 0) {
      setTimeout(() => renderBarcodes(), 200);
    }
  }, [rows]);

  function handlePoFilter(id) {
    // Filtrage client-side uniquement — évite le re-render complet qui scroll en haut
    setFilterPo(id);
  }

  const displayed = filterPo ? rows.filter(r => r.po_id === filterPo) : rows;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-xl font-bold text-gray-800">🏷️ Impression Barcodes</h1>
        <button
          onClick={() => window.print()}
          className="ml-auto px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 print:hidden"
        >
          🖨️ Imprimer
        </button>
      </div>

      {/* Filtre PO */}
      {po_ids.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 print:hidden">
          <button
            onClick={() => handlePoFilter("")}
            className={`px-3 py-1 rounded-full text-sm font-medium border ${!filterPo ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300 hover:border-indigo-400"}`}
          >
            Tous
          </button>
          {po_ids.map(id => (
            <button
              key={id}
              onClick={() => handlePoFilter(id)}
              className={`px-3 py-1 rounded-full text-sm font-medium border ${filterPo === id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300 hover:border-indigo-400"}`}
            >
              {id}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">Aucun barcode disponible</p>
          <p className="text-sm mt-1">Ajoutez des lignes PO depuis la page Achats</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-4 print:hidden">
            {displayed.length} étiquette{displayed.length > 1 ? "s" : ""} à imprimer
          </p>
          <div className="barcodes-grid">
            {displayed.map((row, i) => (
              <BarcodeDisplay
                key={i}
                value={row.barcode}
                label={row.product_title}
                price={row.price}
              />
            ))}
          </div>
        </>
      )}

      <style jsx global>{`
        .barcodes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
        }
        .barcode-item {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 8px;
          text-align: center;
          background: white;
          page-break-inside: avoid;
        }
        .barcode-label {
          font-size: 11px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 2px;
          line-height: 1.2;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .barcode-price {
          font-size: 13px;
          font-weight: 700;
          color: #4f46e5;
          margin-bottom: 4px;
        }
        .barcode-value {
          font-size: 10px;
          color: #6b7280;
          font-family: monospace;
          margin-bottom: 4px;
        }
        .barcode-svg {
          max-width: 100%;
          height: 50px;
        }
        @media print {
          .print\\:hidden { display: none !important; }
          body { margin: 0; }
          .barcodes-grid {
            grid-template-columns: repeat(4, 1fr);
            gap: 6px;
          }
          .barcode-item {
            border: 1px solid #000;
            padding: 4px;
          }
        }
      `}</style>
    </div>
  );
}
