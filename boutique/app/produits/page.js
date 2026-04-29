"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Image from "next/image";
import { formatPrice } from "@/lib/utils";
import { getStockStatus } from "@/lib/constants";
import { trackPageView, trackFilterApplied, trackSearch, trackCartAdd } from "@/lib/track";
import { useCart } from "@/lib/cart";
import { openCart } from "@/components/CartDrawer";
import Link from "next/link";

export default function CataloguePage() {
  const [products, setProducts]   = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [category, setCategory]   = useState("");
  const [sort, setSort]           = useState("smart");
  const [offset, setOffset]       = useState(0);
  const [categories, setCategories] = useState([]);
  const [world, setWorld]         = useState("coiffure");
  const [awakhir, setAwakhir]     = useState([]);
  const [isFuzzy, setIsFuzzy]     = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const { addToCart }             = useCart();
  const debounceRef               = useRef(null);

  const LIMIT = 40;

  // Accent couleur selon le monde
  const accent = world === "onglerie" ? "#e8a0bf" : "#e63012";

  const fetchProducts = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const currentWorld = params.world ?? world;
      const qs = new URLSearchParams({
        limit:    LIMIT,
        offset:   params.offset ?? offset,
        sort:     params.sort ?? sort,
        world:    currentWorld,
        ...(params.search ?? search ? { search: params.search ?? search } : {}),
        ...(params.category ?? category ? { category: params.category ?? category } : {}),
      });
      const res = await fetch(`/api/boutique/products?${qs}`);
      const data = await res.json();
      setProducts(data.products || []);
      setTotal(data.total || 0);
      setIsFuzzy(!!data.is_fuzzy);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [offset, sort, search, category, world]);

  useEffect(() => {
    // Lire le monde depuis sessionStorage
    const savedWorld = typeof window !== "undefined"
      ? (sessionStorage.getItem("nc_world") || "coiffure")
      : "coiffure";
    setWorld(savedWorld);
    trackPageView("Catalogue");

    // Lire les params URL au montage
    const p = new URLSearchParams(window.location.search);
    const urlCategory = p.get("category") || "";
    const urlSearch   = p.get("search")   || "";
    if (urlCategory) setCategory(urlCategory);
    if (urlSearch)   setSearch(urlSearch);

    fetchProducts({ world: savedWorld, category: urlCategory, search: urlSearch });

    // Charger les collections filtrables depuis nc_collections (show_in_filter=true)
    fetch(`/api/boutique/collections?world=${savedWorld}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.collections?.length) {
          setCategories(d.collections.map((c) => c.title));
        }
      })
      .catch(() => {});

    // Charger les nouveautés AWAKHIR
    fetch(`/api/boutique/products?is_new=true&world=${savedWorld}&limit=10&sort=newest`)
      .then((r) => r.json())
      .then((d) => { if (d.products?.length) setAwakhir(d.products); })
      .catch(() => {});
  }, []);

  // Synchronise l'URL avec les filtres actuels — permet de copier-coller
  // l'URL comme un lien partageable (parité avec l'ancienne boutique Shopify).
  // window.history.replaceState : synchrone, browser-natif, ne déclenche pas
  // de re-render Next (on gère l'état localement). Préféré à router.replace
  // qui peut être batché/différé en build prod.
  function syncUrl(searchVal, categoryVal) {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (searchVal)   params.set("search",   searchVal);
    if (categoryVal) params.set("category", categoryVal);
    const qs   = params.toString();
    const next = qs ? `/produits?${qs}` : "/produits";
    if (window.location.pathname + window.location.search !== next) {
      window.history.replaceState({}, "", next);
    }
  }

  function handleSearch(val) {
    // Recherche GLOBALE au monde : dès que l'utilisateur tape un terme, on
    // retire le filtre catégorie en cours pour que les résultats couvrent
    // tout coiffure (ou onglerie). L'utilisateur peut être arrivé ici via
    // une carte « Shampooing » → l'URL contient ?category=… mais la barre
    // de recherche doit chercher dans tout le monde, pas dans Shampooing seul.
    setSearch(val);
    setCategory("");
    setOffset(0);
    syncUrl(val, "");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      trackSearch(val, 0);
      fetchProducts({ search: val, category: "", offset: 0 });
    }, 300);
  }

  function handleCategory(val) {
    setCategory(val);
    setOffset(0);
    syncUrl(search, val);
    trackFilterApplied("category", val);
    fetchProducts({ category: val, offset: 0 });
  }

  // Reset complet — un seul syncUrl pour éviter les closures stale qui
  // re-injecteraient l'ancienne valeur de search/category l'une après l'autre.
  function handleClear() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearch("");
    setCategory("");
    setOffset(0);
    syncUrl("", "");
    fetchProducts({ search: "", category: "", offset: 0 });
  }

  async function handleCopyLink() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback navigateurs anciens / contextes non-https
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Si tout échoue, ouvrir un prompt pour copie manuelle
      window.prompt("نسخ الرابط:", url);
    }
  }

  function handleSort(val) {
    setSort(val);
    setOffset(0);
    fetchProducts({ sort: val, offset: 0 });
  }

  function handleAddToCart(product, e) {
    if (e) e.preventDefault();
    addToCart(product, 1);
    trackCartAdd(product, 1, 0);
    setTimeout(openCart, 200);
  }

  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <>
      <Header />
      <main className="w-full max-w-6xl mx-auto px-4 py-8 min-h-screen">
        {/* Titre + stats */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold" style={{ color: "#f5f5f5" }}>
              {world === "onglerie" ? "العناية بالأظافر" : "الحلاقة"}
            </h1>
            {!loading && (
              <p className="text-sm" style={{ color: "#666" }}>
                {total} منتج{category ? ` — ${category}` : ""}
              </p>
            )}
          </div>
          <Link href="/" className="text-xs px-3 py-1.5 rounded-full transition-colors shrink-0" style={{ border: `1px solid ${accent}`, color: accent }}>
            تغيير العالم
          </Link>
        </div>

        {/* Filtres — colonne sur mobile, ligne sur SM+ */}
        <div className="rounded-2xl p-3 mb-4 flex flex-col sm:flex-row gap-2 sm:items-center" style={{ background: "#161616", border: "1px solid #333" }}>
          {/* Recherche — toujours pleine largeur */}
          <div className="relative w-full sm:flex-1">
            <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#555" }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="search"
              placeholder="ابحث عن منتج..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full rounded-xl pr-10 pl-4 py-2.5 text-sm transition-all"
              style={{
                background: "#1a1a1a",
                border: `1px solid ${search ? accent : "#333"}`,
                color: "#f5f5f5",
                outline: "none",
                boxShadow: search ? `0 0 0 2px ${accent}22` : "none",
              }}
              onFocus={(e) => { e.target.style.border = `1px solid ${accent}`; e.target.style.boxShadow = `0 0 0 3px ${accent}22`; }}
              onBlur={(e) => { e.target.style.border = `1px solid ${search ? accent : "#333"}`; e.target.style.boxShadow = "none"; }}
            />
          </div>

          {/* Catégorie — pleine largeur sur mobile */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="shrink-0" style={{ color: category ? accent : "#555" }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                </svg>
              </span>
              <div className="relative flex-1 sm:flex-none">
                <select
                  value={category}
                  onChange={(e) => handleCategory(e.target.value)}
                  className="w-full sm:w-auto rounded-xl px-4 py-2.5 text-sm pr-8 appearance-none cursor-pointer transition-all"
                  style={{
                    background: "#1a1a1a",
                    border: `1px solid ${category ? accent : "#333"}`,
                    color: category ? "#f5f5f5" : "#a0a0a0",
                    outline: "none",
                    minWidth: "0",
                  }}
                >
                  <option value="">كل الفئات</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <span className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#666" }}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </div>
              {(category || search) && (
                <button
                  onClick={handleClear}
                  className="text-xs px-2.5 py-2 rounded-lg transition-colors shrink-0"
                  style={{ color: "#e63012", border: "1px solid #e6301244", background: "#e6301211" }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Bouton copier-le-lien — visible dès qu'un filtre est actif */}
          {(search || category) && (
            <button
              type="button"
              onClick={handleCopyLink}
              className="text-xs px-3 py-2 rounded-lg transition-colors shrink-0 flex items-center gap-1.5 whitespace-nowrap"
              style={{
                color: linkCopied ? "#0e9f6e" : accent,
                border: `1px solid ${linkCopied ? "#0e9f6e44" : accent + "44"}`,
                background: linkCopied ? "#0e9f6e11" : accent + "11",
              }}
              data-testid="copy-search-link"
              aria-label="نسخ رابط البحث"
              title="نسخ الرابط"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {linkCopied ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 015.656 5.656l-3 3a4 4 0 01-5.656-5.656m3-3a4 4 0 00-5.656 0l-3 3a4 4 0 005.656 5.656" />
                )}
              </svg>
              {linkCopied ? "تم النسخ" : "نسخ الرابط"}
            </button>
          )}
        </div>

        {/* ── Section AWAKHIR (وصل جديد) ────────────────────────────── */}
        {awakhir.length > 0 && !search && !category && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xl font-bold" style={{ color: "#f5f5f5" }}>أواخر</span>
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-full tracking-widest uppercase"
                style={{ background: accent, color: "#fff" }}
              >
                AWAKHIR
              </span>
              <span className="text-xs" style={{ color: "#666" }}>— مجموعة جديدة</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
              {awakhir.map((p) => {
                const slug = p.sku || String(p.product_id);
                const isOutOfStock = Number(p.inventory_quantity) <= 0;
                return (
                  <Link
                    key={p.variant_id}
                    href={`/produits/${slug}`}
                    className="group shrink-0 w-36 block"
                  >
                    <div
                      className="rounded-2xl overflow-hidden transition-all duration-200 group-hover:translate-y-[-2px]"
                      style={{ background: "#161616", border: `2px solid ${accent}22` }}
                    >
                      <div className="aspect-square relative overflow-hidden" style={{ background: "#0e0e0e" }}>
                        {p.image_url ? (
                          <Image src={p.image_url} alt={p.product_title} fill sizes="144px" style={{ objectFit: "contain", padding: "4px" }} loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
                        )}
                        <span
                          className="absolute top-2 right-2 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: accent }}
                        >
                          جديد ✦
                        </span>
                      </div>
                      <div className="p-2">
                        <h3 className="text-xs font-semibold line-clamp-1 text-right" style={{ color: "#f5f5f5" }}>
                          {p.product_title}
                        </h3>
                        <p className="text-xs font-bold mt-1" style={{ color: accent }}>
                          {Number(p.price).toLocaleString("fr-DZ")} دج
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Badge résultats approximatifs (fuzzy) */}
        {!loading && isFuzzy && search && products.length > 0 && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl text-sm" style={{ background: "#1a140a", border: "1px solid #c8820044" }}>
            <span style={{ color: "#c88200" }}>🔎</span>
            <span style={{ color: "#c88200" }}>
              نتائج تقريبية لـ «<span dir="ltr" className="inline font-medium">{search}</span>»
            </span>
            <span className="text-xs ml-auto shrink-0" style={{ color: "#7a5000" }}>البحث الذكي</span>
          </div>
        )}

        {/* Grille produits */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
            {Array(12).fill(null).map((_, i) => (
              <div key={i} className="rounded-xl overflow-hidden animate-pulse" style={{ background: "#161616", border: "1px solid #2a2a2a" }}>
                <div className="aspect-square" style={{ background: "#222" }} />
                <div className="p-1.5 space-y-1">
                  <div className="h-2 rounded w-4/5" style={{ background: "#2a2a2a" }} />
                  <div className="h-2 rounded w-1/2" style={{ background: "#2a2a2a" }} />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20" data-testid="no-results">
            <p className="text-4xl mb-4">🔍</p>
            <p className="font-medium" style={{ color: "#a0a0a0" }}>لا توجد نتائج</p>
            {search && (
              <p className="text-sm mt-1" style={{ color: "#666" }}>
                لم نجد «<span dir="ltr" className="inline">{search}</span>» — جرّب كلمة واحدة أو تهجئة مختلفة
              </p>
            )}
            {search && search.trim().split(/\s+/).length > 1 && (
              <button
                onClick={() => handleSearch(search.trim().split(/\s+/)[0])}
                className="mt-3 text-xs px-4 py-2 rounded-xl transition-colors"
                style={{ background: "#1a1a1a", border: `1px solid ${accent}44`, color: accent }}
              >
                ابحث فقط عن «{search.trim().split(/\s+/)[0]}»
              </button>
            )}
            <button
              onClick={() => { handleSearch(""); handleCategory(""); }}
              className="mt-3 block mx-auto text-sm font-medium hover:underline"
              style={{ color: "#e63012" }}
            >
              إلغاء الفلتر
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
            {products.map((p, idx) => {
              const slug = p.sku || String(p.product_id);
              const isOutOfStock = Number(p.inventory_quantity) <= 0;
              return (
                <div
                  key={p.variant_id}
                  data-testid="product-card"
                  className="group block relative"
                >
                  <Link href={`/produits/${slug}`} className="block">
                    <div
                      className="rounded-xl overflow-hidden transition-all duration-200"
                      style={{ background: "#161616", border: "1px solid #2a2a2a" }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = `0 6px 16px ${accent}33`; e.currentTarget.style.borderColor = `${accent}55`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
                    >
                      <div className="aspect-square relative overflow-hidden" style={{ background: "#0e0e0e" }}>
                        {p.image_url ? (
                          <Image src={p.image_url} alt={p.product_title}
                            fill
                            sizes="(max-width: 640px) 25vw, (max-width: 1024px) 20vw, 200px"
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                            priority={idx < 8}
                            loading={idx < 8 ? undefined : "lazy"} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "#2a2a2a" }}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        {p.is_new && (
                          <span className="absolute top-1 right-1 text-white text-[8px] font-bold px-1 py-0.5 rounded-full" style={{ background: accent }}>
                            جديد
                          </span>
                        )}
                        {!p.is_new && Number(p.compare_at_price) > 0 && Number(p.compare_at_price) > Number(p.price) && (
                          <span className="absolute top-1 right-1 text-white text-[8px] font-bold px-1 py-0.5 rounded-full" style={{ background: "#22c55e" }}>
                            PROMO
                          </span>
                        )}
                      </div>
                      <div className="p-1.5 pb-7">
                        <h3 className="text-[10px] font-semibold line-clamp-1" style={{ color: "#f5f5f5" }}>{p.product_title}</h3>
                        {Number(p.compare_at_price) > 0 && Number(p.compare_at_price) > Number(p.price) && (
                          <span className="text-[9px] line-through block leading-tight" style={{ color: "#888" }}>{formatPrice(p.compare_at_price)}</span>
                        )}
                        <span className="text-[10px] font-bold block mt-0.5" style={{ color: accent }}>{formatPrice(p.price)}</span>
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={(e) => handleAddToCart(p, e)}
                    disabled={isOutOfStock}
                    data-testid="add-to-cart"
                    className="absolute bottom-1.5 left-1.5 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-colors z-10"
                    style={isOutOfStock
                      ? { background: "#2a2a2a", color: "#444", cursor: "not-allowed" }
                      : { background: accent, color: "#fff" }
                    }
                    aria-label={isOutOfStock ? "نفد المخزون" : "أضف للسلة"}
                  >
                    {isOutOfStock ? "—" : "+"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-8" dir="ltr">
            <button
              onClick={() => { const o = offset - LIMIT; setOffset(o); fetchProducts({ offset: o }); }}
              disabled={offset === 0}
              className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 transition-colors"
              style={{ border: "1px solid #2a2a2a", color: "#f5f5f5", background: "transparent" }}
            >
              ← السابق
            </button>
            <span className="text-sm" style={{ color: "#a0a0a0" }}>
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => { const o = offset + LIMIT; setOffset(o); fetchProducts({ offset: o }); }}
              disabled={currentPage >= totalPages}
              className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 transition-colors"
              style={{ border: "1px solid #2a2a2a", color: "#f5f5f5", background: "transparent" }}
            >
              التالي →
            </button>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
