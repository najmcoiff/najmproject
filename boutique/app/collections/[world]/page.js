"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/utils";
import { useCart } from "@/lib/cart";
import { openCart } from "@/components/CartDrawer";
import { trackPageView, trackCartAdd, trackSearch, trackFilterApplied } from "@/lib/track";

export default function CollectionsWorldPage() {
  const params     = useParams();
  const worldParam = params?.world;
  const world      = worldParam === "onglerie" ? "onglerie" : "coiffure";
  const accent = world === "onglerie" ? "#e8a0bf" : "#e63012";

  const [collections, setCollections] = useState([]);
  const [awakhir,     setAwakhir]     = useState([]);
  const [products,    setProducts]    = useState([]);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [offset,      setOffset]      = useState(0);
  const [search,      setSearch]      = useState("");
  const [category,    setCategory]    = useState("");
  const [isFuzzy,     setIsFuzzy]     = useState(false);
  const [linkCopied,  setLinkCopied]  = useState(false);
  const { addToCart } = useCart();
  const debounceRef   = useRef(null);

  const LIMIT = 40;

  const worldMeta = world === "onglerie"
    ? { icon: "💅", label: "Onglerie & Beauté",   ar: "العناية بالأظافر" }
    : { icon: "✂️", label: "Coiffure & Barbier",  ar: "الحلاقة" };

  const loadProducts = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        world,
        limit:  LIMIT,
        offset: params.offset  ?? 0,
        sort:   "smart",
        ...(( params.search   ?? search   ) ? { search:   params.search   ?? search   } : {}),
        ...(( params.category ?? category ) ? { category: params.category ?? category } : {}),
      });
      const r = await fetch(`/api/boutique/products?${qs}`);
      const d = await r.json();
      setProducts(d.products || []);
      setTotal(d.total || 0);
      setIsFuzzy(!!d.is_fuzzy);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [world, search, category]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("nc_world", world);
    }
    trackPageView(`Collections ${world}`);

    fetch(`/api/boutique/collections?world=${world}&homepage=true`)
      .then(r => r.json())
      .then(d => setCollections(d.collections || []))
      .catch(() => {});

    fetch(`/api/boutique/products?is_new=true&world=${world}&limit=10&sort=newest`)
      .then(r => r.json())
      .then(d => { if (d.products?.length) setAwakhir(d.products); })
      .catch(() => {});

    // Lire les params URL (?search / ?category) pour permettre un lien partageable
    let urlSearch = "";
    let urlCategory = "";
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      urlSearch   = p.get("search")   || "";
      urlCategory = p.get("category") || "";
      if (urlSearch)   setSearch(urlSearch);
      if (urlCategory) setCategory(urlCategory);
    }
    loadProducts({ offset: 0, search: urlSearch, category: urlCategory });
  }, [world]);

  // Synchronise l'URL avec les filtres actuels (parité avec /produits) —
  // permet de copier le lien et de l'envoyer aux clients.
  function syncUrl(searchVal, categoryVal) {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (searchVal)   params.set("search",   searchVal);
    if (categoryVal) params.set("category", categoryVal);
    const qs   = params.toString();
    const next = `/collections/${world}${qs ? "?" + qs : ""}`;
    if (window.location.pathname + window.location.search !== next) {
      window.history.replaceState({}, "", next);
    }
  }

  function handleSearch(val) {
    // La recherche sur la page des collections doit être GLOBALE au monde —
    // dès que l'utilisateur tape un terme, on retire le filtre catégorie en
    // cours pour que les résultats couvrent tout coiffure (ou onglerie).
    setSearch(val);
    setCategory("");
    setOffset(0);
    syncUrl(val, "");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      trackSearch(val, 0);
      loadProducts({ search: val, offset: 0, category: "" });
    }, 300);
  }

  function handleCategory(val) {
    setCategory(val);
    setOffset(0);
    syncUrl(search, val);
    trackFilterApplied("category", val);
    loadProducts({ category: val, offset: 0, search });
  }

  function handleReset() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearch("");
    setCategory("");
    setOffset(0);
    syncUrl("", "");
    loadProducts({ search: "", category: "", offset: 0 });
  }

  async function handleCopyLink() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
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
      window.prompt("نسخ الرابط:", url);
    }
  }

  function handleAddToCart(product, e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    addToCart(product, 1);
    trackCartAdd(product, 1, 0);
    setTimeout(openCart, 200);
  }

  const totalPages  = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <>
      <Header />
      <main className="w-full max-w-6xl mx-auto px-4 py-6 min-h-screen">

        {/* ── Titre monde ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{worldMeta.icon}</span>
            <div>
              <h1 className="text-xl font-bold" style={{ color: "#f5f5f5" }}>{worldMeta.ar}</h1>
              <p className="text-xs" style={{ color: "#555" }}>{worldMeta.label}</p>
            </div>
          </div>
          <Link
            href="/"
            className="text-xs px-3 py-1.5 rounded-full transition-colors"
            style={{ border: `1px solid ${accent}44`, color: accent }}
          >
            تغيير العالم
          </Link>
        </div>

        {/* ── Barre de recherche + filtre catégorie ─────────────────────── */}
        <div
          className="rounded-2xl p-3 mb-6 flex flex-col sm:flex-row gap-2 sm:items-center"
          style={{ background: "#161616", border: "1px solid #333" }}
        >
          {/* Recherche */}
          <div className="relative w-full sm:flex-1">
            <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#555" }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="search"
              data-testid="world-search-input"
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
              onFocus={(e) => {
                e.target.style.border = `1px solid ${accent}`;
                e.target.style.boxShadow = `0 0 0 3px ${accent}22`;
              }}
              onBlur={(e) => {
                e.target.style.border = `1px solid ${search ? accent : "#333"}`;
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Filtre catégorie */}
          {collections.length > 0 && (
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
                  data-testid="world-category-select"
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
                  {collections.map((col) => (
                    <option key={col.collection_id} value={col.title}>{col.title}</option>
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
                  onClick={handleReset}
                  className="text-xs px-2.5 py-2 rounded-lg transition-colors shrink-0"
                  style={{ color: "#e63012", border: "1px solid #e6301244", background: "#e6301211" }}
                  data-testid="world-search-reset"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Bouton « نسخ الرابط » — actif dès qu'un filtre est appliqué */}
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

        {/* ── Grille collections — dir="rtl" pour alignement correct ──── */}
        {collections.length > 0 && !search && !category && (
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <p className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: accent, letterSpacing: "0.25em" }}>
                {worldMeta.icon} الفئات
              </p>
              <div className="flex-1 h-px" style={{ background: "#1e1e1e" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
              {collections.map((col, idx) => (
                <CollectionCard key={col.collection_id} col={col} accent={accent} world={world} priority={idx < 8} />
              ))}
            </div>
          </section>
        )}

        {/* ── Section AWAKHIR ──────────────────────────────────────────── */}
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
              {awakhir.map(p => {
                const slug = p.sku || String(p.product_id);
                return (
                  <Link key={p.variant_id} href={`/produits/${slug}`} className="group shrink-0 w-36 block">
                    <div className="rounded-2xl overflow-hidden transition-all duration-200 group-hover:translate-y-[-2px]"
                      style={{ background: "#161616", border: `2px solid ${accent}22` }}>
                      <div className="aspect-square relative overflow-hidden" style={{ background: "#0e0e0e" }}>
                        {p.image_url
                          ? <Image src={p.image_url} alt={p.product_title} fill sizes="144px" style={{ objectFit: "contain", padding: "4px" }} loading="lazy" />
                          : <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
                        }
                        <span className="absolute top-2 right-2 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: accent }}>
                          جديد ✦
                        </span>
                      </div>
                      <div className="p-2">
                        <h3 className="text-xs font-semibold line-clamp-1" style={{ color: "#f5f5f5" }}>
                          {p.product_title}
                        </h3>
                        {Number(p.compare_at_price) > 0 && Number(p.compare_at_price) > Number(p.price) && (
                          <span className="text-[10px] line-through block leading-tight" style={{ color: "#888" }}>{formatPrice(p.compare_at_price)}</span>
                        )}
                        <p className="text-xs font-bold mt-0.5" style={{ color: accent }}>
                          {formatPrice(p.price)}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Tous les produits du monde ───────────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-5">
            <p className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "#555", letterSpacing: "0.25em" }}>
              {search || category ? "نتائج البحث" : "كل المنتجات"}
            </p>
            <div className="flex-1 h-px" style={{ background: "#1e1e1e" }} />
            {!loading && (
              <span className="text-xs shrink-0" style={{ color: "#555" }}>{total} منتج</span>
            )}
          </div>

          {/* Badge résultats approximatifs (fuzzy) */}
          {!loading && isFuzzy && search && products.length > 0 && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl text-sm" style={{ background: "#1a140a", border: `1px solid #c8820044` }}>
              <span style={{ color: "#c88200" }}>🔎</span>
              <span style={{ color: "#c88200" }}>
                نتائج تقريبية لـ «<span dir="ltr" className="inline font-medium">{search}</span>»
              </span>
              <span className="text-xs ml-auto shrink-0" style={{ color: "#7a5000" }}>البحث الذكي</span>
            </div>
          )}

          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
              {Array(12).fill(null).map((_, i) => (
                <div key={i} className="rounded-xl overflow-hidden animate-pulse"
                  style={{ background: "#161616", border: "1px solid #2a2a2a" }}>
                  <div className="aspect-square" style={{ background: "#222" }} />
                  <div className="p-1.5 space-y-1">
                    <div className="h-2 rounded w-4/5" style={{ background: "#2a2a2a" }} />
                    <div className="h-2 rounded w-1/2" style={{ background: "#2a2a2a" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🔍</p>
              <p style={{ color: "#a0a0a0" }}>
                {search || category ? "لا توجد نتائج" : "لا توجد منتجات"}
              </p>
              {search && (
                <p className="text-sm mt-2" style={{ color: "#666" }}>
                  لم نجد «<span dir="ltr" className="inline">{search}</span>»
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
              {(search || category) && (
                <button
                  onClick={handleReset}
                  className="mt-3 block mx-auto text-sm font-medium hover:underline"
                  style={{ color: "#e63012" }}
                >
                  إلغاء الفلتر
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
              {products.map((p, idx) => {
                const slug         = p.sku || String(p.product_id);
                const isOutOfStock = Number(p.inventory_quantity) <= 0;
                return (
                  <div key={p.variant_id} data-testid="product-card" className="group block relative">
                    <Link href={`/produits/${slug}`} className="block">
                      <div
                        className="rounded-xl overflow-hidden transition-all duration-200"
                        style={{ background: "#161616", border: `1px solid ${accent}22` }}
                        onMouseEnter={e => {
                          e.currentTarget.style.transform   = "translateY(-3px)";
                          e.currentTarget.style.boxShadow   = `0 6px 16px ${accent}33`;
                          e.currentTarget.style.borderColor = `${accent}55`;
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform   = "translateY(0)";
                          e.currentTarget.style.boxShadow   = "none";
                          e.currentTarget.style.borderColor = `${accent}22`;
                        }}
                      >
                        <div className="aspect-square relative overflow-hidden" style={{ background: "#0e0e0e" }}>
                          {p.image_url
                            ? <Image src={p.image_url} alt={p.product_title}
                                fill
                                sizes="(max-width: 640px) 25vw, (max-width: 1024px) 20vw, 200px"
                                className="object-cover group-hover:scale-105 transition-transform duration-300"
                                priority={idx < 8}
                                loading={idx < 8 ? undefined : "lazy"} />
                            : <div className="w-full h-full flex items-center justify-center text-xl">📦</div>
                          }
                          {p.is_new && (
                            <span className="absolute top-1 right-1 text-white text-[8px] font-bold px-1 py-0.5 rounded-full"
                              style={{ background: accent }}>جديد</span>
                          )}
                          {!p.is_new && Number(p.inventory_quantity) > 0 && Number(p.inventory_quantity) <= 3 && (
                            <span className="absolute top-1 right-1 text-white text-[8px] font-bold px-1 py-0.5 rounded-full"
                              style={{ background: accent }}>آخر القطع</span>
                          )}
                          {!p.is_new && Number(p.inventory_quantity) > 3 && Number(p.compare_at_price) > 0 && Number(p.compare_at_price) > Number(p.price) && (
                            <span className="absolute top-1 right-1 text-white text-[8px] font-bold px-1 py-0.5 rounded-full"
                              style={{ background: "#22c55e" }}>PROMO</span>
                          )}
                        </div>
                        <div className="p-1.5 pb-7">
                          <h3 className="text-[10px] font-semibold line-clamp-1"
                            style={{ color: "#f5f5f5" }}>
                            {p.product_title}
                          </h3>
                          {Number(p.compare_at_price) > 0 && Number(p.compare_at_price) > Number(p.price) && (
                            <span className="text-[9px] line-through block leading-tight" style={{ color: "#888" }}>{formatPrice(p.compare_at_price)}</span>
                          )}
                          <p className="text-[10px] font-bold mt-0.5" style={{ color: accent }}>
                            {formatPrice(p.price)}
                          </p>
                        </div>
                      </div>
                    </Link>
                    <button
                      onClick={e => handleAddToCart(p, e)}
                      disabled={isOutOfStock}
                      className="absolute bottom-1.5 left-1.5 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-colors z-10"
                      style={isOutOfStock
                        ? { background: "#2a2a2a", color: "#444", cursor: "not-allowed" }
                        : { background: accent, color: "#fff" }}
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
                onClick={() => { const o = offset - LIMIT; setOffset(o); loadProducts({ offset: o, search, category }); }}
                disabled={offset === 0}
                className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 transition-colors"
                style={{ border: "1px solid #2a2a2a", color: "#f5f5f5", background: "transparent" }}
              >← السابق</button>
              <span className="text-sm" style={{ color: "#a0a0a0" }}>{currentPage} / {totalPages}</span>
              <button
                onClick={() => { const o = offset + LIMIT; setOffset(o); loadProducts({ offset: o, search, category }); }}
                disabled={currentPage >= totalPages}
                className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 transition-colors"
                style={{ border: "1px solid #2a2a2a", color: "#f5f5f5", background: "transparent" }}
              >التالي →</button>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

/* ── Carte collection ──────────────────────────────────────────────────── */
function CollectionCard({ col, accent, world, priority = false }) {
  return (
    <Link
      href={`/produits?category=${encodeURIComponent(col.title)}&world=${world}`}
      className="group flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-200 text-center w-full"
      style={{ background: "#111", border: "1px solid #222" }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = `${accent}66`;
        e.currentTarget.style.transform   = "translateY(-2px)";
        e.currentTarget.style.background  = "#161616";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "#222";
        e.currentTarget.style.transform   = "translateY(0)";
        e.currentTarget.style.background  = "#111";
      }}
    >
      {col.image_url ? (
        <div className="w-full aspect-square rounded-lg overflow-hidden relative" style={{ background: "#0e0e0e" }}>
          <Image
            src={col.image_url}
            alt={col.title}
            fill
            sizes="(max-width: 640px) 25vw, (max-width: 1024px) 17vw, 150px"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            priority={priority}
            loading={priority ? undefined : "lazy"}
          />
        </div>
      ) : (
        <div className="w-full aspect-square rounded-lg flex items-center justify-center text-xl"
          style={{ background: "#1a1a1a" }}>
          {world === "onglerie" ? "💅" : "✂️"}
        </div>
      )}
      <span className="text-[9px] font-semibold leading-tight line-clamp-2 w-full"
        style={{ color: "#ccc" }}>
        {col.title}
      </span>
    </Link>
  );
}
