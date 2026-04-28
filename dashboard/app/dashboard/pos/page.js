"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { getSession } from "@/lib/auth";
import { api, invalidateCache } from "@/lib/api";
import { smartMatch } from "@/lib/smart-search";

// ════════════════════════════════════════════════════════════════
//  BARCODE SCANNER MODAL — lecteur caméra professionnel
//  Primaire  : BarcodeDetector API (Chrome/Edge/Android natif)
//  Fallback  : @zxing/browser (Firefox/Safari)
//  UX        : laser animé → preview produit → confirmer avant panier
// ════════════════════════════════════════════════════════════════
function BarcodeScannerModal({ variants, onAdd, onClose }) {
  const videoRef     = useRef(null);
  const streamRef    = useRef(null);
  const rafRef       = useRef(null);
  const zxingRef     = useRef(null);
  const lastCodeRef  = useRef(null);
  const lastTimeRef  = useRef(0);
  const pulseRef     = useRef(null);

  const [camError,  setCamError]  = useState(null);
  const [ready,     setReady]     = useState(false);
  const [preview,   setPreview]   = useState(null);  // variant trouvée
  const [notFound,  setNotFound]  = useState(null);  // barcode string inconnu
  const [scanning,  setScanning]  = useState(true);

  // ── Arrêter complètement la caméra ─────────────────────────
  const stopCamera = useCallback(() => {
    if (rafRef.current)    { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (zxingRef.current)  { try { zxingRef.current.reset?.(); } catch {} zxingRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }, []);

  // ── Recherche dans le catalogue ────────────────────────────
  const findVariant = useCallback((code) => {
    const c = String(code).trim();
    return variants.find(v =>
      String(v.barcode || "").trim()            === c ||
      String(v.sku     || "").trim()            === c ||
      String(v.sku     || "").toLowerCase()     === c.toLowerCase()
    ) || null;
  }, [variants]);

  // ── Handler barcode détecté ─────────────────────────────────
  const handleCode = useCallback((rawValue) => {
    const code = String(rawValue || "").trim();
    if (!code) return;
    const now = Date.now();
    // Debounce : même code ignoré pendant 2.5s
    if (code === lastCodeRef.current && now - lastTimeRef.current < 2500) return;
    lastCodeRef.current = code;
    lastTimeRef.current = now;

    // Stop scan loop
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setScanning(false);

    // Vibration feedback
    if (navigator.vibrate) navigator.vibrate([60, 30, 60]);

    const hit = findVariant(code);
    if (hit) {
      setPreview(hit);
      setNotFound(null);
    } else {
      setPreview(null);
      setNotFound(code);
    }
  }, [findVariant]);

  // ── Loop BarcodeDetector natif ──────────────────────────────
  const nativeLoop = useCallback((detector) => {
    const scan = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) { rafRef.current = requestAnimationFrame(scan); return; }
      try {
        const codes = await detector.detect(video);
        if (codes.length > 0) { handleCode(codes[0].rawValue); return; }
      } catch {}
      rafRef.current = requestAnimationFrame(scan);
    };
    rafRef.current = requestAnimationFrame(scan);
  }, [handleCode]);

  // ── Fallback @zxing/browser ─────────────────────────────────
  const zxingFallback = useCallback(async () => {
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      zxingRef.current = reader;
      reader.decodeFromVideoElement(videoRef.current, (result, err) => {
        if (result) handleCode(result.getText());
      });
    } catch {
      setCamError("Scanner non supporté. Utilisez la barre de recherche.");
    }
  }, [handleCode]);

  // ── Démarrer le scan ────────────────────────────────────────
  const startScan = useCallback(async () => {
    if ("BarcodeDetector" in window) {
      try {
        const fmts = ["ean_13","ean_8","code_128","code_39","code_93","upc_a","upc_e","itf","qr_code","data_matrix"];
        const det = new window.BarcodeDetector({ formats: fmts });
        nativeLoop(det);
      } catch { zxingFallback(); }
    } else {
      zxingFallback();
    }
  }, [nativeLoop, zxingFallback]);

  // ── Re-scanner ──────────────────────────────────────────────
  const rescan = useCallback(() => {
    setPreview(null);
    setNotFound(null);
    setScanning(true);
    lastCodeRef.current = null;
    // Redémarrer le loop
    startScan();
  }, [startScan]);

  // ── Initialisation caméra ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.addEventListener("playing", () => {
            if (!cancelled) { setReady(true); startScan(); }
          }, { once: true });
          await video.play().catch(() => {});
        }
      } catch (err) {
        if (!cancelled) {
          setCamError(
            err.name === "NotAllowedError"
              ? "Permission caméra refusée. Autorisez l'accès dans les paramètres du navigateur."
              : err.name === "NotFoundError"
              ? "Aucune caméra détectée sur cet appareil."
              : "Erreur caméra : " + (err.message || err.name)
          );
        }
      }
    }
    initCamera();
    return () => { cancelled = true; stopCamera(); };
  }, [startScan, stopCamera]);

  // ── Ajouter au panier et fermer ─────────────────────────────
  const handleAdd = () => {
    if (!preview) return;
    stopCamera();
    onAdd(preview);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" data-testid="scanner-modal">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 flex-shrink-0 safe-top">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center text-xl flex-shrink-0">
            📷
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Scanner code-barres</p>
            <p className="text-xs leading-tight" style={{
              color: scanning ? "#86efac" : preview ? "#4ade80" : notFound ? "#fca5a5" : "#9ca3af"
            }}>
              {scanning
                ? "Pointer vers le code-barres…"
                : preview
                ? "✓ Article identifié"
                : notFound
                ? "⚠ Code non reconnu dans le catalogue"
                : "Initialisation…"}
            </p>
          </div>
        </div>
        <button
          onClick={() => { stopCamera(); onClose(); }}
          data-testid="scanner-close"
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xl transition-colors touch-manipulation"
        >×</button>
      </div>

      {/* ── Flux caméra ─────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          playsInline
          muted
        />

        {/* Erreur caméra */}
        {camError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6">
            <div className="bg-white rounded-2xl p-6 text-center max-w-xs w-full shadow-2xl">
              <div className="text-5xl mb-4">🚫</div>
              <p className="text-gray-900 font-bold text-sm mb-2">Caméra indisponible</p>
              <p className="text-gray-500 text-xs mb-5">{camError}</p>
              <button
                onClick={() => { stopCamera(); onClose(); }}
                className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-bold"
              >Fermer</button>
            </div>
          </div>
        )}

        {/* Loading */}
        {!ready && !camError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="flex flex-col items-center gap-4">
              <svg className="animate-spin w-12 h-12 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <p className="text-white font-medium">Accès caméra…</p>
            </div>
          </div>
        )}

        {/* Overlay scan : vignette + cadre + laser */}
        {ready && scanning && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Vignette latérale */}
            <div className="absolute inset-0" style={{
              background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.65) 100%)"
            }}/>

            {/* Cadre de visée central */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative" style={{ width: 280, height: 180 }}>

                {/* Coins du cadre */}
                {[
                  { top: 0,    left: 0,    borderTop: "3px solid #4ade80", borderLeft: "3px solid #4ade80",  borderRadius: "8px 0 0 0" },
                  { top: 0,    right: 0,   borderTop: "3px solid #4ade80", borderRight: "3px solid #4ade80", borderRadius: "0 8px 0 0" },
                  { bottom: 0, left: 0,    borderBottom: "3px solid #4ade80", borderLeft: "3px solid #4ade80",  borderRadius: "0 0 0 8px" },
                  { bottom: 0, right: 0,   borderBottom: "3px solid #4ade80", borderRight: "3px solid #4ade80", borderRadius: "0 0 8px 0" },
                ].map((s, i) => (
                  <div key={i} className="absolute" style={{ ...s, width: 32, height: 32 }} />
                ))}

                {/* Laser rouge animé */}
                <div
                  className="absolute left-1 right-1 scanner-laser"
                  style={{
                    height: 2,
                    background: "linear-gradient(to right, transparent, #ef4444 20%, #ef4444 80%, transparent)",
                    boxShadow: "0 0 8px 2px rgba(239,68,68,0.8)",
                    borderRadius: 1,
                  }}
                />
              </div>
            </div>

            {/* Instructions */}
            <div className="absolute bottom-6 left-0 right-0 flex justify-center">
              <div className="bg-black/60 backdrop-blur-sm px-5 py-2.5 rounded-full">
                <p className="text-white text-xs font-medium tracking-wide">Centrer le code dans le cadre vert</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Preview : produit TROUVÉ ─────────────────────────── */}
      {preview && !scanning && (
        <div className="scanner-preview bg-white flex-shrink-0 rounded-t-3xl shadow-2xl" style={{ maxHeight: "55vh", overflow: "hidden" }}>
          {/* Header vert */}
          <div className="bg-green-600 px-5 py-3 flex items-center gap-3 rounded-t-3xl">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">Article identifié !</p>
              {preview.barcode && (
                <p className="text-green-100 text-xs font-mono">{preview.barcode}</p>
              )}
            </div>
          </div>

          {/* Détail produit */}
          <div className="px-5 py-4 flex gap-4 items-start">
            {/* Image */}
            <div className="w-24 h-24 rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200 scanner-pulse">
              {preview.image_url
                ? <img src={preview.image_url} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display = "none"} />
                : <div className="w-full h-full flex items-center justify-center text-4xl">📦</div>}
            </div>

            {/* Infos */}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-base leading-tight mb-1" style={{ lineClamp: 2 }}>
                {preview.display_name || preview.product_title}
              </p>
              {preview.sku && (
                <p className="text-xs text-gray-400 font-mono mb-2">SKU : {preview.sku}</p>
              )}

              {/* Prix */}
              <p className="text-2xl font-bold text-gray-900 leading-none mb-2">
                {Number(preview.price || 0).toLocaleString("fr-DZ")}
                <span className="text-sm font-normal text-gray-400 ml-1">DA</span>
              </p>

              {/* Stock badge */}
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold
                ${Number(preview.inventory_quantity) <= 0
                  ? "bg-red-100 text-red-700"
                  : Number(preview.inventory_quantity) <= 3
                  ? "bg-orange-100 text-orange-700"
                  : "bg-green-100 text-green-700"}`}>
                {Number(preview.inventory_quantity) <= 0
                  ? "⛔ Rupture de stock"
                  : Number(preview.inventory_quantity) <= 3
                  ? `⚠ Dernières pièces : ${preview.inventory_quantity}`
                  : `✅ En stock : ${preview.inventory_quantity}`}
              </span>
            </div>
          </div>

          {/* Boutons */}
          <div className="px-5 pb-6 grid grid-cols-2 gap-3">
            <button
              onClick={rescan}
              data-testid="scanner-rescan"
              className="py-4 rounded-2xl border-2 border-gray-200 text-gray-700 font-bold text-sm hover:border-gray-400 transition-colors touch-manipulation"
            >
              ↺ Re-scanner
            </button>
            <button
              onClick={handleAdd}
              data-testid="scanner-add-to-cart"
              className="py-4 rounded-2xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 transition-colors shadow-sm touch-manipulation active:scale-95"
            >
              {Number(preview.inventory_quantity) <= 0 ? "⚠ Forcer la vente" : "✓ Ajouter au panier"}
            </button>
          </div>
        </div>
      )}

      {/* ── Preview : produit NON TROUVÉ ─────────────────────── */}
      {notFound && !preview && !scanning && (
        <div className="scanner-preview bg-white flex-shrink-0 rounded-t-3xl shadow-2xl">
          <div className="bg-red-500 px-5 py-3 rounded-t-3xl flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-white font-bold text-sm">Article introuvable</p>
              <p className="text-red-100 text-xs font-mono">{notFound}</p>
            </div>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-gray-600 mb-1">
              Ce code-barres n'est pas dans le catalogue NajmCoiff.
            </p>
            <p className="text-xs text-gray-400">
              Vérifiez que le produit est bien dans nc_variants avec un barcode renseigné.
            </p>
          </div>
          <div className="px-5 pb-6 grid grid-cols-2 gap-3">
            <button
              onClick={() => { stopCamera(); onClose(); }}
              className="py-4 rounded-2xl border-2 border-gray-200 text-gray-700 font-bold text-sm touch-manipulation"
            >
              Fermer
            </button>
            <button
              onClick={rescan}
              data-testid="scanner-retry"
              className="py-4 rounded-2xl bg-gray-900 text-white font-bold text-sm touch-manipulation"
            >
              ↺ Scanner autre
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────
function fmtPrice(v) {
  const n = Number(v || 0);
  return isNaN(n) ? "—" : n.toLocaleString("fr-FR") + " DA";
}

function stockColor(qty) {
  const n = Number(qty);
  if (n <= 0) return "text-red-600 font-bold";
  if (n <= 3)  return "text-orange-500 font-semibold";
  return "text-green-700";
}

// ── Tile produit (grille mobile) ──────────────────────────────────
function ProductTile({ variant, onAdd, inCart }) {
  const stock = Number(variant.inventory_quantity);
  const outOfStock = stock <= 0;
  return (
    <button
      data-testid="pos-result-item"
      onClick={() => onAdd(variant)}
      className="relative flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden active:scale-95 transition-transform touch-manipulation"
    >
      {/* Badge rupture */}
      {outOfStock && (
        <span
          data-testid="pos-out-of-stock-badge"
          className="absolute top-1.5 left-1.5 z-10 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-tight"
        >
          نفذ المخزون
        </span>
      )}
      {/* Image */}
      <div className={`aspect-square w-full bg-gray-50 overflow-hidden ${outOfStock ? "opacity-60" : ""}`}>
        {variant.image_url
          ? <img src={String(variant.image_url)} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display="none"} />
          : <span className="w-full h-full flex items-center justify-center text-gray-300 text-3xl">📦</span>}
      </div>
      {/* Infos */}
      <div className="p-2 flex-1 flex flex-col gap-0.5">
        <p className="text-[11px] font-semibold text-gray-800 line-clamp-2 leading-tight">
          {String(variant.display_name || variant.product_title || "—")}
        </p>
        <p className="text-xs font-bold text-gray-900 mt-auto">{fmtPrice(variant.price)}</p>
        <p className={`text-[10px] ${stockColor(stock)}`}>Stock: {stock}</p>
      </div>
      {/* Badge panier */}
      {inCart > 0 && (
        <span className="absolute top-2 right-2 w-5 h-5 bg-green-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow">
          {inCart}
        </span>
      )}
      {/* Bouton + */}
      <div
        data-testid="pos-add-btn"
        className={`absolute bottom-2 right-2 w-8 h-8 ${outOfStock ? "bg-red-600" : "bg-gray-900"} text-white rounded-full flex items-center justify-center text-lg font-bold shadow-md`}
      >
        +
      </div>
    </button>
  );
}

// ── Item dans le panier ───────────────────────────────────────────
function CartItem({ item, onQtyChange, onRemove }) {
  const qty = Number(item.qty);
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden">
        {item.image_url
          ? <img src={item.image_url} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display="none"} />
          : <span className="w-full h-full flex items-center justify-center text-gray-300 text-xs">📦</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-gray-800 truncate">{item.title}</div>
        <div className="text-xs text-gray-400 mt-0.5">
          {fmtPrice(item.price)} × {qty} = <span className="text-gray-700 font-bold">{fmtPrice(item.price * qty)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => onQtyChange(item.variant_id, qty - 1)}
          className="w-7 h-7 rounded-full border border-gray-200 text-gray-600 flex items-center justify-center hover:border-gray-400 font-bold transition-colors touch-manipulation"
        >−</button>
        <span className="w-6 text-center text-sm font-bold">{qty}</span>
        <button
          onClick={() => onQtyChange(item.variant_id, qty + 1)}
          className="w-7 h-7 rounded-full border border-gray-200 text-gray-600 flex items-center justify-center hover:border-gray-400 font-bold transition-colors touch-manipulation"
        >+</button>
      </div>
      <button
        onClick={() => onRemove(item.variant_id)}
        className="text-gray-300 hover:text-red-500 text-xl leading-none flex-shrink-0 ml-1 transition-colors touch-manipulation"
      >×</button>
    </div>
  );
}

// ── Bottom Sheet panier (mobile) ──────────────────────────────────
function CartBottomSheet({ cart, total, discount, onDiscountChange, onQtyChange, onRemove, onValidate, onClose, submitting = false }) {
  const finalTotal = Math.max(0, total - discount);
  const hasDiscount = discount > 0;
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        data-testid="pos-cart-sheet"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-3xl shadow-2xl lg:hidden"
        style={{ maxHeight: "80vh", display: "flex", flexDirection: "column" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900">Panier</span>
            <span
              data-testid="pos-cart-count"
              className="bg-gray-900 text-white text-xs font-bold px-2 py-0.5 rounded-full"
            >
              {cart.reduce((s, i) => s + i.qty, 0)}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-2">
          {cart.map(item => (
            <CartItem key={item.variant_id} item={item} onQtyChange={onQtyChange} onRemove={onRemove} />
          ))}
        </div>
        {/* Remise + Total + CTA */}
        <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 space-y-3 bg-white">
          {/* Champ remise */}
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
            <span className="text-orange-600 text-sm">🏷️</span>
            <label className="text-xs font-semibold text-orange-700 flex-shrink-0">Remise (DA)</label>
            <input
              data-testid="pos-discount-input"
              type="number"
              min="0"
              max={total}
              value={discount === 0 ? "" : discount}
              onChange={e => onDiscountChange(Math.min(total, Math.max(0, Number(e.target.value) || 0)))}
              placeholder="0"
              inputMode="numeric"
              className="flex-1 text-right text-sm font-bold text-orange-800 bg-transparent focus:outline-none min-w-0"
            />
            <span className="text-xs text-orange-600 flex-shrink-0">DA</span>
          </div>
          {/* Totaux */}
          <div className="space-y-1">
            {hasDiscount && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Sous-total</span>
                <span
                  data-testid="pos-subtotal"
                  className="text-sm text-gray-400 line-through"
                >
                  {fmtPrice(total)}
                </span>
              </div>
            )}
            {hasDiscount && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-orange-600 font-semibold">Remise</span>
                <span
                  data-testid="pos-discount-display"
                  className="text-sm font-bold text-orange-600"
                >
                  − {fmtPrice(discount)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">
                {cart.reduce((s, i) => s + i.qty, 0)} unité(s)
              </span>
              <span
                data-testid="pos-cart-total"
                className={`text-xl font-bold ${hasDiscount ? "text-green-700" : "text-gray-900"}`}
              >
                {fmtPrice(finalTotal)}
              </span>
            </div>
          </div>
          <button
            data-testid="pos-validate-btn"
            onClick={onValidate}
            disabled={submitting}
            className="w-full py-4 bg-green-600 text-white rounded-2xl text-base font-bold hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm touch-manipulation"
          >
            {submitting ? "Traitement…" : `✓ Valider · ${fmtPrice(finalTotal)}`}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Modal confirmation commande ───────────────────────────────────
function ConfirmModal({ cart, total, discount, onConfirm, onClose, submitting }) {
  const [customerName,  setCustomerName]  = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note,          setNote]          = useState("");
  const finalTotal = Math.max(0, total - discount);
  const hasDiscount = discount > 0;

  return (
    <div
      data-testid="pos-confirm-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={e => e.target === e.currentTarget && !submitting && onClose()}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gray-900 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold">Confirmer la vente</h2>
            <p className="text-gray-400 text-xs mt-0.5">
              {cart.length} article(s) · {hasDiscount ? (
                <><span className="line-through opacity-60">{fmtPrice(total)}</span>{" "}<span className="text-green-400 font-bold">{fmtPrice(finalTotal)}</span></>
              ) : fmtPrice(total)}
            </p>
          </div>
          {!submitting && (
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none touch-manipulation">×</button>
          )}
        </div>

        {/* Résumé */}
        <div className="px-5 pt-4">
          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 max-h-36 overflow-y-auto">
            {cart.map(item => (
              <div key={item.variant_id} className="flex justify-between text-xs">
                <span className="text-gray-700 truncate flex-1">{item.title}</span>
                <span className="text-gray-500 ml-2 flex-shrink-0">{item.qty} × {fmtPrice(item.price)}</span>
              </div>
            ))}
            {hasDiscount && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>Sous-total</span>
                <span className="line-through">{fmtPrice(total)}</span>
              </div>
            )}
            {hasDiscount && (
              <div className="flex justify-between text-xs text-orange-600 font-semibold">
                <span>🏷️ Remise</span>
                <span>− {fmtPrice(discount)}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-1.5 flex justify-between font-bold text-sm">
              <span>Prix encaissé</span>
              <span
                data-testid="pos-confirm-final-total"
                className="text-green-700"
              >
                {fmtPrice(finalTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Infos client */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Nom client (optionnel)</label>
            <input
              data-testid="pos-customer-name"
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Vente anonyme si vide"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Téléphone (optionnel)</label>
            <input
              type="tel"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              placeholder="05XXXXXXXX"
              inputMode="tel"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Note</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="Remise, échange, retour…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-400 disabled:opacity-40 transition-colors touch-manipulation"
          >
            Annuler
          </button>
          <button
            data-testid="pos-confirm-submit"
            onClick={() => onConfirm({ customerName, customerPhone, note, discount })}
            disabled={submitting}
            className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors touch-manipulation"
          >
            {submitting ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Traitement…
              </>
            ) : "✓ Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal succès ─────────────────────────────────────────────────
function SuccessModal({ orderName, total, subtotal, discount, onClose }) {
  const hasDiscount = discount > 0;
  return (
    <div
      data-testid="pos-success-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Vente enregistrée !</h2>
        <p
          data-testid="pos-order-name"
          className="text-sm font-mono font-bold text-gray-700 mb-2 bg-gray-100 rounded-lg px-3 py-1.5 inline-block"
        >
          {orderName}
        </p>
        {hasDiscount && (
          <div className="mt-2 mb-1 space-y-0.5">
            <p className="text-sm text-gray-400 line-through">{fmtPrice(subtotal)}</p>
            <p className="text-xs text-orange-600 font-semibold">🏷️ Remise : − {fmtPrice(discount)}</p>
          </div>
        )}
        <p
          data-testid="pos-success-total"
          className="text-2xl font-bold text-green-700 mt-2 mb-6"
        >
          {fmtPrice(total)}
        </p>
        <button
          onClick={onClose}
          className="w-full py-3.5 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-700 transition-colors touch-manipulation"
        >
          Nouvelle vente
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  PAGE PRINCIPALE POS
// ════════════════════════════════════════════════════════════════
export default function PosPage() {
  const [session,      setSession]      = useState(null);
  const [variants,     setVariants]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [cart,         setCart]         = useState([]);
  const [discount,     setDiscount]     = useState(0);
  const [showSheet,    setShowSheet]    = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [showScanner,  setShowScanner]  = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [success,      setSuccess]      = useState(null);
  const [toast,        setToast]        = useState(null);
  const searchRef = useRef(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    const s = getSession();
    setSession(s?.user || null);
    api.getVariantsCache().then(res => {
      if (res.ok) setVariants(res.rows || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // ── Résultats de recherche intelligente multi-tokens + multi-champs + fuzzy ──
  const results = search.trim().length >= 1
    ? variants.filter(v =>
        smartMatch(search, [
          v.display_name, v.product_title, v.vendor,
          v.barcode, v.sku, v.collections_titles,
        ])
      ).slice(0, 50)
    : [];

  // ── Actions panier ─────────────────────────────────────────────
  const addToCart = useCallback((variant) => {
    const vid = String(variant.variant_id);
    const stock = Number(variant.inventory_quantity);
    setCart(prev => {
      const existing = prev.find(i => i.variant_id === vid);
      if (existing) {
        return prev.map(i => i.variant_id === vid ? { ...i, qty: i.qty + 1 } : i);
      }
      if (stock <= 0) {
        showToast(`⚠️ Vente forcée — stock négatif pour "${(variant.display_name || "Article").slice(0, 25)}"`, "error");
      } else {
        showToast(`✓ ${(variant.display_name || "Article").slice(0, 30)} ajouté`);
      }
      return [...prev, {
        variant_id: vid,
        title:      String(variant.display_name || variant.product_title || vid),
        price:      Number(variant.price || 0),
        image_url:  variant.image_url || null,
        qty:        1,
        stock:      stock,
      }];
    });
  }, [showToast]);

  const changeQty = useCallback((vid, newQty) => {
    if (newQty <= 0) {
      setCart(prev => prev.filter(i => i.variant_id !== vid));
    } else {
      setCart(prev => prev.map(i => i.variant_id === vid ? { ...i, qty: newQty } : i));
    }
  }, []);

  const removeItem = useCallback((vid) => {
    setCart(prev => prev.filter(i => i.variant_id !== vid));
  }, []);

  const clearCart = () => { setCart([]); setDiscount(0); };

  const total        = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const finalTotal   = Math.max(0, total - discount);
  const cartCount    = cart.reduce((sum, i) => sum + i.qty, 0);
  const cartInStock  = (vid) => cart.find(i => i.variant_id === String(vid))?.qty || 0;

  // ── Validation vente ───────────────────────────────────────────
  const handleValidate = () => {
    setShowSheet(false);
    setTimeout(() => setShowConfirm(true), 150);
  };

  const handleConfirm = async ({ customerName, customerPhone, note, discount: discountArg }) => {
    setSubmitting(true);
    const appliedDiscount = discountArg ?? discount;
    try {
      const token = getSession()?.token;
      const res = await fetch("/api/pos/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          items: cart.map(i => ({
            variant_id: i.variant_id,
            qty:        i.qty,
            price:      i.price,
            title:      i.title,
            image_url:  i.image_url,
          })),
          agent:           session?.nom || "",
          customer_name:   customerName || null,
          customer_phone:  customerPhone || null,
          note:            note || null,
          discount_amount: appliedDiscount || 0,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        showToast(data.error || "Erreur lors de la vente", "error");
        return;
      }

      // Mettre à jour le stock local ET invalider le cache localStorage
      setVariants(prev => {
        const updated = [...prev];
        for (const item of cart) {
          const idx = updated.findIndex(v => String(v.variant_id) === item.variant_id);
          if (idx >= 0) {
            updated[idx] = {
              ...updated[idx],
              inventory_quantity: Number(updated[idx].inventory_quantity) - item.qty,
            };
          }
        }
        return updated;
      });
      // Invalider le cache variants pour forcer un rechargement depuis Supabase
      invalidateCache("variants");

      setShowConfirm(false);
      clearCart();
      setSuccess({ orderName: data.order_name, total: data.total, subtotal: data.subtotal, discount: appliedDiscount });

    } catch {
      showToast("Erreur réseau", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col bg-gray-50" style={{ minHeight: "calc(100vh - 64px)" }}>

      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-xs pointer-events-none
          ${toast.type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Header POS ── */}
      <div className="bg-gray-900 px-4 py-3 flex items-center gap-3 flex-shrink-0 sticky top-0 z-20">
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-bold text-sm truncate">POS — Vente Comptoir</h1>
          <p className="text-gray-400 text-xs">{session?.nom || "Agent"}</p>
        </div>
        {/* Badge panier desktop */}
        {cartCount > 0 && (
          <div className="hidden lg:flex items-center gap-2">
            <span
              data-testid="pos-cart-count"
              className="bg-green-600 text-white text-xs font-bold px-2.5 py-1 rounded-full"
            >
              {cartCount} article{cartCount > 1 ? "s" : ""}
            </span>
            <span
              data-testid="pos-cart-total"
              className="text-green-400 font-bold text-sm"
            >
              {fmtPrice(finalTotal)}
            </span>
            <button
              onClick={clearCart}
              className="text-xs text-red-400 hover:text-red-300 ml-2 transition-colors"
            >
              Vider
            </button>
          </div>
        )}
      </div>

      {/* ── Layout principal ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ═══ Zone produits (full-width mobile, flex-1 desktop) ═══ */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Barre de recherche + bouton scanner */}
          <div className="px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0 sticky top-[56px] z-10">
            <div className="flex gap-2 items-center">
              {/* Input recherche */}
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
                <input
                  data-testid="pos-search"
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Escape") setSearch("");
                    if (e.key === "Enter" && results.length === 1) addToCart(results[0]);
                  }}
                  placeholder="Nom, SKU, code-barre…"
                  autoFocus
                  inputMode="search"
                  className="w-full pl-9 pr-9 py-3 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-gray-50 transition-all"
                  style={{ fontSize: "16px" }}
                />
                {search && (
                  <button
                    onClick={() => { setSearch(""); searchRef.current?.focus(); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg touch-manipulation"
                  >×</button>
                )}
              </div>

              {/* Bouton caméra */}
              <button
                onClick={() => setShowScanner(true)}
                data-testid="pos-scan-btn"
                title="Scanner avec la caméra"
                className="w-12 h-12 rounded-2xl bg-gray-900 hover:bg-gray-700 text-white flex items-center justify-center flex-shrink-0 shadow-sm transition-colors touch-manipulation active:scale-95"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
                  <rect x="8" y="8" width="8" height="8" rx="1"/>
                </svg>
              </button>
            </div>
            {loading && (
              <p className="text-xs text-gray-400 mt-2 text-center animate-pulse">Chargement du catalogue…</p>
            )}
            {!loading && !search && (
              <p className="text-[11px] text-gray-400 mt-1.5 text-center">{variants.length} articles · <span className="text-gray-500">📷 Scanner activé</span></p>
            )}
            {search && (
              <p className="text-[11px] text-gray-500 mt-1.5">{results.length} résultat{results.length !== 1 ? "s" : ""} pour «{search}»</p>
            )}
          </div>

          {/* Grille produits */}
          <div className="flex-1 overflow-y-auto p-3 pb-28 lg:pb-4">
            {loading ? null : !search.trim() ? (
              /* État initial : inciter à chercher */
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mb-5 text-4xl">🔍</div>
                <p className="text-gray-700 font-bold text-base">Scanner ou rechercher un article</p>
                <p className="text-gray-400 text-sm mt-2">
                  {variants.length > 0
                    ? `${variants.length} articles actifs (stock 0 inclus)`
                    : "Faites un snapshot GAS pour charger le stock"}
                </p>
                {variants.length > 0 && (
                  <p className="text-gray-300 text-xs mt-3">Tapez le nom, le SKU ou scannez le code-barre</p>
                )}
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-gray-400 text-sm">Aucun résultat pour «{search}»</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
                {results.map(v => (
                  <ProductTile
                    key={String(v.variant_id)}
                    variant={v}
                    onAdd={addToCart}
                    inCart={cartInStock(v.variant_id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ═══ Sidebar panier (desktop lg+) ═══ */}
        <div className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-gray-200 bg-white overflow-hidden flex-shrink-0">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-900">Panier</span>
              <div className="flex items-center gap-2">
                {cartCount > 0 && (
                  <span
                    data-testid="pos-cart-count"
                    className="bg-gray-900 text-white text-xs font-bold px-2.5 py-0.5 rounded-full"
                  >
                    {cartCount}
                  </span>
                )}
                {cartCount > 0 && (
                  <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                    Vider
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-10">
                <div className="text-4xl mb-3">🛒</div>
                <p className="text-gray-400 text-sm">Panier vide</p>
                <p className="text-gray-300 text-xs mt-1">Sélectionnez des articles</p>
              </div>
            ) : (
              cart.map(item => (
                <CartItem key={item.variant_id} item={item} onQtyChange={changeQty} onRemove={removeItem} />
              ))
            )}
          </div>

          {/* Total + remise + bouton (desktop) */}
          {cart.length > 0 && (
            <div className="border-t border-gray-200 px-4 py-4 bg-white flex-shrink-0 space-y-3">
              {/* Champ remise desktop */}
              <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                <span className="text-orange-600 text-sm flex-shrink-0">🏷️</span>
                <label className="text-xs font-semibold text-orange-700 flex-shrink-0">Remise</label>
                <input
                  data-testid="pos-discount-input"
                  type="number"
                  min="0"
                  max={total}
                  value={discount === 0 ? "" : discount}
                  onChange={e => setDiscount(Math.min(total, Math.max(0, Number(e.target.value) || 0)))}
                  placeholder="0"
                  inputMode="numeric"
                  className="flex-1 text-right text-sm font-bold text-orange-800 bg-transparent focus:outline-none min-w-0"
                />
                <span className="text-xs text-orange-600 flex-shrink-0">DA</span>
              </div>
              {/* Totaux */}
              {discount > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Sous-total</span>
                    <span
                      data-testid="pos-subtotal"
                      className="line-through"
                    >
                      {fmtPrice(total)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-orange-600 font-semibold">
                    <span>Remise</span>
                    <span
                      data-testid="pos-discount-display"
                    >
                      − {fmtPrice(discount)}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">
                  {cartCount} unité{cartCount > 1 ? "s" : ""}
                </span>
                <span
                  data-testid="pos-cart-total"
                  className={`text-xl font-bold ${discount > 0 ? "text-green-700" : "text-gray-900"}`}
                >
                  {fmtPrice(finalTotal)}
                </span>
              </div>
              <button
                data-testid="pos-validate-btn"
                onClick={() => setShowConfirm(true)}
                disabled={submitting}
                className="w-full py-3.5 bg-green-600 text-white rounded-xl text-base font-bold hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {submitting ? "Traitement en cours…" : "✓ Valider la vente"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Bouton flottant panier (mobile uniquement) ── */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-30 lg:hidden">
          <button
            data-testid="pos-float-cart-btn"
            onClick={() => setShowSheet(true)}
            className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold text-base flex items-center justify-between px-5 shadow-2xl active:scale-95 transition-transform touch-manipulation"
          >
            <span className="flex items-center gap-2">
              <span className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-xs font-black" data-testid="pos-cart-count">{cartCount}</span>
              <span>Voir le panier</span>
            </span>
            <span data-testid="pos-cart-total" className="text-green-400 font-bold">{fmtPrice(finalTotal)}</span>
          </button>
        </div>
      )}

      {/* ── Bottom sheet (mobile) ── */}
      {showSheet && (
        <CartBottomSheet
          cart={cart}
          total={total}
          discount={discount}
          onDiscountChange={setDiscount}
          onQtyChange={changeQty}
          onRemove={removeItem}
          onValidate={handleValidate}
          onClose={() => setShowSheet(false)}
          submitting={submitting}
        />
      )}

      {/* ── Modal confirmation ── */}
      {showConfirm && (
        <ConfirmModal
          cart={cart}
          total={total}
          discount={discount}
          submitting={submitting}
          onConfirm={handleConfirm}
          onClose={() => !submitting && setShowConfirm(false)}
        />
      )}

      {/* ── Modal succès ── */}
      {success && (
        <SuccessModal
          orderName={success.orderName}
          total={success.total}
          subtotal={success.subtotal}
          discount={success.discount || 0}
          onClose={() => {
            setSuccess(null);
            searchRef.current?.focus();
          }}
        />
      )}

      {/* ── Modal scanner caméra ── */}
      {showScanner && (
        <BarcodeScannerModal
          variants={variants}
          onAdd={(variant) => {
            addToCart(variant);
            showToast(`📷 ${(variant.display_name || "Article").slice(0, 35)} ajouté`);
          }}
          onClose={() => {
            setShowScanner(false);
            setTimeout(() => searchRef.current?.focus(), 200);
          }}
        />
      )}
    </div>
  );
}
