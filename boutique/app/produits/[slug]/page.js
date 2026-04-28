"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Image from "next/image";
import { formatPrice } from "@/lib/utils";
import { getStockStatus } from "@/lib/constants";
import { trackProductView, trackVariantSelect, trackCartAdd } from "@/lib/track";
import { useCart } from "@/lib/cart";
import { openCart } from "@/components/CartDrawer";
import Link from "next/link";

export default function ProductPage() {
  const { slug } = useParams();
  const router = useRouter();
  const { addToCart } = useCart();

  const [product, setProduct]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [selectedVariant, setSelected] = useState(null);
  const [qty, setQty]                 = useState(1);
  const [adding, setAdding]           = useState(false);
  const [added, setAdded]             = useState(false);
  const [error, setError]             = useState("");
  const [zoomOpen, setZoomOpen]       = useState(false);

  const closeZoom = useCallback(() => setZoomOpen(false), []);

  useEffect(() => {
    if (!zoomOpen) return;
    const onKey = (e) => { if (e.key === "Escape") closeZoom(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomOpen, closeZoom]);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/boutique/products/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.product) {
          setProduct(data.product);
          setSelected(data.product.variants[0] || null);
          trackProductView(data.product);
        } else {
          setError("Produit introuvable");
        }
      })
      .catch(() => setError("Erreur de chargement"))
      .finally(() => setLoading(false));
  }, [slug]);

  function handleVariantSelect(variant) {
    setSelected(variant);
    setQty(1);
    setAdded(false);
    trackVariantSelect({ ...variant, product_id: product?.product_id });
  }

  function handleAddToCart() {
    if (!selectedVariant || Number(selectedVariant.inventory_quantity) <= 0) return;
    setAdding(true);
    const item = {
      variant_id:         selectedVariant.variant_id,
      product_id:         product.product_id,
      product_title:      product.product_title,
      variant_title:      selectedVariant.variant_title,
      price:              selectedVariant.price,
      sku:                selectedVariant.sku,
      inventory_quantity: selectedVariant.inventory_quantity,
    };
    addToCart(item, qty);
    trackCartAdd(item, qty, 0);
    setAdded(true);
    setAdding(false);
    setTimeout(() => {
      setAdded(false);
      openCart(); // Ouvrir le drawer après ajout
    }, 400);
  }

  const stockStatus = selectedVariant ? getStockStatus(selectedVariant.inventory_quantity) : null;
  const isOutOfStock = selectedVariant ? Number(selectedVariant.inventory_quantity) <= 0 : true;

  if (loading) {
    return (
      <>
        <Header />
        <main className="w-full max-w-6xl mx-auto px-4 py-10 animate-pulse">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="aspect-square rounded-2xl" style={{ background: "#161616" }} />
            <div className="space-y-4">
              <div className="h-6 rounded w-1/3" style={{ background: "#1e1e1e" }} />
              <div className="h-8 rounded" style={{ background: "#1e1e1e" }} />
              <div className="h-6 rounded w-1/4" style={{ background: "#1e1e1e" }} />
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (error || !product) {
    return (
      <>
        <Header />
        <main className="w-full max-w-6xl mx-auto px-4 py-20 text-center">
          <p className="text-4xl mb-4">😕</p>
          <p className="text-xl font-semibold mb-2" style={{ color: "#a0a0a0" }}>المنتج غير موجود</p>
          <Link href="/produits" className="text-sm font-medium hover:underline" style={{ color: "#e63012" }}>
            ← العودة للمنتجات
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="w-full max-w-6xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-xs mb-6 flex items-center gap-1.5" style={{ color: "#666" }}>
          <Link href="/" className="hover:text-white transition-colors">الرئيسية</Link>
          <span>/</span>
          <Link href="/produits" className="hover:text-white transition-colors">المنتجات</Link>
          <span>/</span>
          <span dir="ltr" style={{ color: "#a0a0a0" }}>{product.product_title}</span>
        </nav>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {/* Image + Zoom */}
          <div className="relative">
            <div
              data-testid="product-image-container"
              className="aspect-square rounded-2xl flex items-center justify-center overflow-hidden relative group"
              style={{ background: "#0e0e0e", border: "1px solid #2a2a2a", cursor: product.image_url || selectedVariant?.image_url ? "zoom-in" : "default" }}
              onClick={() => { if (product.image_url || selectedVariant?.image_url) setZoomOpen(true); }}
            >
              {product.image_url || selectedVariant?.image_url ? (
                <>
                  <Image
                    src={product.image_url || selectedVariant?.image_url}
                    alt={product.product_title}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    style={{ objectFit: "contain", padding: "8px" }}
                    className="transition-transform duration-300 group-hover:scale-105"
                    data-testid="product-image"
                    priority
                  />
                  {/* Icône loupe */}
                  <div
                    className="absolute bottom-3 right-3 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{ background: "rgba(0,0,0,0.6)", width: 36, height: 36, border: "1px solid #2a2a2a" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e63012" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                    </svg>
                  </div>
                  {/* Hint tap mobile */}
                  <div
                    className="absolute bottom-3 left-3 rounded-full px-2 py-1 text-xs md:hidden"
                    style={{ background: "rgba(0,0,0,0.55)", color: "#a0a0a0", border: "1px solid #2a2a2a" }}
                  >
                    اضغط للتكبير
                  </div>
                </>
              ) : (
                <svg className="w-24 h-24" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "#2a2a2a" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </div>

            {/* Lightbox / Modal zoom */}
            {zoomOpen && (
              <div
                data-testid="zoom-modal"
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ background: "rgba(0,0,0,0.92)" }}
                onClick={closeZoom}
              >
                {/* Bouton fermer */}
                <button
                  data-testid="zoom-close"
                  className="absolute top-4 right-4 rounded-full flex items-center justify-center z-10 transition-colors"
                  style={{ background: "#1a1a1a", border: "1px solid #3a3a3a", width: 44, height: 44, color: "#f5f5f5" }}
                  onClick={(e) => { e.stopPropagation(); closeZoom(); }}
                  aria-label="إغلاق"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>

                {/* Image agrandie */}
                <div
                  className="relative flex items-center justify-center"
                  style={{ maxWidth: "min(90vw, 900px)", maxHeight: "90vh" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <img
                    src={product.image_url || selectedVariant?.image_url}
                    alt={product.product_title}
                    data-testid="zoom-image"
                    style={{
                      maxWidth: "min(90vw, 900px)",
                      maxHeight: "85vh",
                      objectFit: "contain",
                      borderRadius: 12,
                      background: "#0e0e0e",
                      boxShadow: "0 0 60px rgba(0,0,0,0.8)",
                    }}
                  />
                  <p
                    dir="ltr"
                    className="absolute bottom-0 left-0 right-0 text-center text-sm py-2 px-4"
                    style={{ background: "rgba(0,0,0,0.5)", color: "#a0a0a0", borderRadius: "0 0 12px 12px" }}
                  >
                    {product.product_title}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Infos produit */}
          <div className="flex flex-col gap-4">
            <div>
              <h1 dir="ltr" className="text-2xl md:text-3xl font-bold leading-tight text-right" style={{ color: "#f5f5f5" }}>
                {product.product_title}
              </h1>
            </div>

            {/* Prix */}
            {selectedVariant && (
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold" style={{ color: "#f5f5f5" }}>
                  {formatPrice(selectedVariant.price)}
                </span>
              </div>
            )}

            {/* Sélecteur variantes */}
            {product.variants.length > 1 && (
              <div>
                <p className="text-sm font-semibold mb-2" style={{ color: "#a0a0a0" }}>الحجم / اللون</p>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((v) => {
                    const isSelected = selectedVariant?.variant_id === v.variant_id;
                    const outOfStock  = Number(v.inventory_quantity) <= 0;
                    return (
                      <button
                        key={v.variant_id}
                        onClick={() => handleVariantSelect(v)}
                        disabled={outOfStock}
                        className="px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors"
                        style={
                          outOfStock
                            ? { border: "1px solid #2a2a2a", color: "#444", cursor: "not-allowed" }
                            : isSelected
                            ? { border: "1px solid #e63012", background: "rgba(230,48,18,0.12)", color: "#e63012" }
                            : { border: "1px solid #2a2a2a", color: "#a0a0a0" }
                        }
                      >
                        {v.variant_title || "Standard"}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stock */}
            {stockStatus && (
              <p className={`text-sm font-semibold ${stockStatus.color}`}>
                {stockStatus.label}
                {selectedVariant && Number(selectedVariant.inventory_quantity) > 0 && Number(selectedVariant.inventory_quantity) <= 10 && (
                  <span className="font-normal mr-1" style={{ color: "#666" }}>
                    ({selectedVariant.inventory_quantity} قطعة متبقية)
                  </span>
                )}
              </p>
            )}

            {/* Quantité */}
            {!isOutOfStock && (
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold" style={{ color: "#a0a0a0" }}>الكمية</p>
                <div className="flex items-center rounded-xl overflow-hidden" style={{ border: "1px solid #2a2a2a" }}>
                  <button
                    onClick={() => setQty(Math.max(1, qty - 1))}
                    className="w-9 h-9 flex items-center justify-center text-lg font-bold transition-colors"
                    style={{ color: "#f5f5f5", background: "transparent" }}
                  >
                    −
                  </button>
                  <span className="w-10 text-center text-sm font-semibold" style={{ color: "#f5f5f5" }}>{qty}</span>
                  <button
                    onClick={() => setQty(Math.min(selectedVariant?.inventory_quantity || 1, qty + 1))}
                    className="w-9 h-9 flex items-center justify-center text-lg font-bold transition-colors"
                    style={{ color: "#f5f5f5", background: "transparent" }}
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* Bouton ajouter au panier */}
            <button
              onClick={handleAddToCart}
              disabled={isOutOfStock || adding}
              className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98]"
              style={
                isOutOfStock
                  ? { background: "#1e1e1e", color: "#444", cursor: "not-allowed" }
                  : added
                  ? { background: "#22c55e", color: "#fff" }
                  : { background: "#e63012", color: "#fff" }
              }
            >
              {isOutOfStock ? "نفد المخزون" : added ? "✓ أُضيف للسلة" : "أضف للسلة"}
            </button>

            {/* Commander directement */}
            {!isOutOfStock && (
              <Link
                href="/commander"
                onClick={() => {
                  if (!added) {
                    const item = {
                      variant_id:         selectedVariant.variant_id,
                      product_id:         product.product_id,
                      product_title:      product.product_title,
                      variant_title:      selectedVariant.variant_title,
                      price:              selectedVariant.price,
                      sku:                selectedVariant.sku,
                      inventory_quantity: selectedVariant.inventory_quantity,
                    };
                    addToCart(item, qty);
                  }
                }}
                className="w-full py-4 rounded-2xl font-bold text-base text-center block transition-colors"
                style={{ border: "2px solid #e63012", color: "#e63012" }}
              >
                اطلب الآن
              </Link>
            )}

            {/* Garanties */}
            <div className="pt-4 grid grid-cols-2 gap-3" style={{ borderTop: "1px solid #2a2a2a" }}>
              {[
                { icon: "🚚", text: "توصيل 24-72 ساعة" },
                { icon: "💳", text: "الدفع عند الاستلام" },
                { icon: "📦", text: "تغليف محمي" },
                { icon: "✅", text: "منتج أصلي" },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-2 text-xs" style={{ color: "#666" }}>
                  <span>{item.icon}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
