"use client";
import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/utils";
import { getStockStatus } from "@/lib/constants";
import { trackCartAdd } from "@/lib/track";
import { useCart } from "@/lib/cart";

export default function ProductCard({ product, accent = "#e63012" }) {
  const { addToCart } = useCart();

  const slug = product.sku || String(product.product_id);
  const stock = getStockStatus(product.inventory_quantity);
  const isOutOfStock = Number(product.inventory_quantity) <= 0;

  const image = product.image_url || product.images?.[0]?.url || null;

  function handleAddToCart(e) {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfStock) return;
    addToCart(product, 1);
    trackCartAdd(product, 1, 0);
  }

  return (
    <Link href={`/produits/${slug}`} className="group block">
      <div
        className="rounded-2xl overflow-hidden transition-all duration-200"
        style={{ background: "#161616", border: "1px solid #2a2a2a" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-4px)";
          e.currentTarget.style.boxShadow = `0 8px 24px ${accent}33`;
          e.currentTarget.style.borderColor = `${accent}55`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "none";
          e.currentTarget.style.borderColor = "#2a2a2a";
        }}
      >
        {/* Image */}
        <div className="aspect-square relative overflow-hidden" style={{ background: "#0e0e0e" }}>
          {image ? (
            <Image
              src={image}
              alt={product.product_title}
              fill
              sizes="(max-width: 640px) 25vw, (max-width: 1024px) 20vw, 200px"
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ color: "#2a2a2a" }}>
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}

          {/* Badge promo */}
          {Number(product.compare_at_price) > 0 && Number(product.compare_at_price) > Number(product.price) && (
            <span className="absolute top-2 left-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#22c55e" }}>
              PROMO
            </span>
          )}
        </div>

        {/* Infos */}
        <div className="p-3">
          <h3 className="text-sm font-semibold line-clamp-1 leading-tight mb-1" style={{ color: "#f5f5f5" }}>
            {product.product_title}
          </h3>
          {product.variant_title && product.variant_title !== "Default Title" && (
            <p className="text-xs mb-1" style={{ color: "#a0a0a0" }}>{product.variant_title}</p>
          )}

          <div className="flex items-center justify-between mt-2">
            <div className="flex flex-col">
              {Number(product.compare_at_price) > 0 && Number(product.compare_at_price) > Number(product.price) && (
                <span className="text-xs line-through leading-tight" style={{ color: "#999" }}>
                  {formatPrice(product.compare_at_price)}
                </span>
              )}
              <span className="text-sm font-bold" style={{ color: "#f5f5f5" }}>
                {formatPrice(product.price)}
              </span>
            </div>

            {/* stopPropagation DOM natif — évite navigation Link sur click */}
            <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
              <button
                onClick={handleAddToCart}
                disabled={isOutOfStock}
                className="flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm transition-colors"
                style={isOutOfStock
                  ? { background: "#2a2a2a", color: "#444", cursor: "not-allowed" }
                  : { background: accent, color: "#fff" }
                }
                aria-label={isOutOfStock ? "نفد المخزون" : "أضف للسلة"}
              >
                {isOutOfStock ? "—" : "+"}
              </button>
            </div>
          </div>

        </div>
      </div>
    </Link>
  );
}
