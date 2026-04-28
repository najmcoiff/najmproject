"use client";
import { useEffect } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { formatPrice } from "@/lib/utils";
import { trackPageView, trackCartView, trackCartRemove } from "@/lib/track";
import { useCart } from "@/lib/cart";

export default function PanierPage() {
  const { items, total, count, updateQty, removeFromCart } = useCart();

  useEffect(() => {
    trackPageView("Panier");
    if (items.length > 0) trackCartView(count, total);
  }, []);

  function handleRemove(item) {
    trackCartRemove(item, item.qty);
    removeFromCart(item.variant_id);
  }

  if (items.length === 0) {
    return (
      <>
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-20 text-center min-h-screen">
          <p className="text-5xl mb-4">🛒</p>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Votre panier est vide</h1>
          <p className="text-gray-500 text-sm mb-6">
            Découvrez notre catalogue et ajoutez des articles à votre panier.
          </p>
          <Link
            href="/produits"
            className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-8 rounded-full transition-colors"
          >
            Voir le catalogue
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8 min-h-screen">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Mon panier <span className="text-gray-400 text-base font-normal">({count} article{count > 1 ? "s" : ""})</span>
        </h1>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Articles */}
          <div className="md:col-span-2 space-y-3">
            {items.map((item) => (
              <div key={item.variant_id} className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-4">
                {/* Image placeholder */}
                <div className="w-16 h-16 bg-gray-50 rounded-xl flex items-center justify-center shrink-0">
                  <svg className="w-7 h-7 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{item.title}</p>
                  {item.variant_title && item.variant_title !== "Default Title" && (
                    <p className="text-xs text-gray-500">{item.variant_title}</p>
                  )}
                  <p className="text-sm font-bold text-amber-600 mt-1">
                    {formatPrice(Number(item.price) * item.qty)}
                  </p>
                </div>

                {/* Quantité + supprimer */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button
                    onClick={() => handleRemove(item)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                    aria-label="Supprimer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => updateQty(item.variant_id, item.qty - 1)}
                      className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-base"
                    >
                      −
                    </button>
                    <span className="w-7 text-center text-xs font-semibold">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.variant_id, item.qty + 1)}
                      className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-base"
                    >
                      +
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">{formatPrice(item.price)} / unité</p>
                </div>
              </div>
            ))}
          </div>

          {/* Récap */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 sticky top-20">
              <h2 className="font-bold text-gray-900 mb-4">Récapitulatif</h2>
              <div className="space-y-2 text-sm text-gray-600 mb-4">
                <div className="flex justify-between">
                  <span>Sous-total ({count} article{count > 1 ? "s" : ""})</span>
                  <span className="font-medium">{formatPrice(total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Livraison</span>
                  <span className="text-green-600 font-medium">Calculée à la commande</span>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-gray-900 mb-5">
                <span>Total estimé</span>
                <span className="text-amber-600">{formatPrice(total)}</span>
              </div>
              <Link
                href="/commander"
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3.5 rounded-2xl text-center block transition-colors"
              >
                Passer la commande
              </Link>
              <Link
                href="/produits"
                className="w-full text-gray-500 text-sm text-center block mt-3 hover:text-gray-700"
              >
                ← Continuer les achats
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
