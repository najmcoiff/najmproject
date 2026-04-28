"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { formatPrice, formatDate } from "@/lib/utils";
import { trackTrackingView } from "@/lib/track";

const STATUS_LABELS = {
  pending:   { label: "En attente de confirmation",  color: "text-yellow-600", bg: "bg-yellow-50",  icon: "⏳" },
  confirmed: { label: "Commande confirmée",           color: "text-blue-600",   bg: "bg-blue-50",    icon: "✅" },
  prepared:  { label: "Colis en préparation",         color: "text-purple-600", bg: "bg-purple-50",  icon: "📦" },
  shipped:   { label: "Colis expédié",                color: "text-indigo-600", bg: "bg-indigo-50",  icon: "🚚" },
  delivered: { label: "Commande livrée",              color: "text-green-600",  bg: "bg-green-50",   icon: "🎉" },
  cancelled: { label: "Commande annulée",             color: "text-red-600",    bg: "bg-red-50",     icon: "❌" },
};

export default function SuiviDetailPage() {
  const { id } = useParams();
  const [order, setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/boutique/track/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.order) {
          setOrder(data.order);
          trackTrackingView(id, data.order.status);
        } else {
          setError(data.error || "Commande introuvable");
        }
      })
      .catch(() => setError("Erreur réseau. Veuillez réessayer."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <>
        <Header />
        <main className="max-w-lg mx-auto px-4 py-12 animate-pulse">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <div className="h-6 bg-gray-100 rounded w-1/2" />
            <div className="h-4 bg-gray-100 rounded" />
            <div className="h-4 bg-gray-100 rounded w-3/4" />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (error || !order) {
    return (
      <>
        <Header />
        <main className="max-w-lg mx-auto px-4 py-16 text-center min-h-screen">
          <p className="text-4xl mb-4">🔍</p>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Commande introuvable</h1>
          <p className="text-gray-500 text-sm mb-6">
            Vérifiez le numéro de commande et réessayez.
          </p>
          <Link href="/suivi" className="text-amber-600 text-sm font-medium hover:underline">
            ← Nouvelle recherche
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.pending;

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-8 min-h-screen">
        {/* Numéro commande */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/suivi" className="text-sm text-gray-400 hover:text-gray-600">← Autre recherche</Link>
          <span className="text-sm text-gray-500 font-mono font-medium">{order.order_name}</span>
        </div>

        {/* Statut principal */}
        <div className={`${statusInfo.bg} rounded-2xl p-5 mb-4 text-center`}>
          <p className="text-4xl mb-2">{statusInfo.icon}</p>
          <p className={`font-bold text-lg ${statusInfo.color}`}>{statusInfo.label}</p>
          {order.wilaya && (
            <p className="text-sm text-gray-600 mt-1">Livraison vers : <strong>{order.wilaya}</strong></p>
          )}
        </div>

        {/* Numéro de tracking ZR */}
        {order.tracking_number && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 font-medium">Numéro de tracking ZR Express</p>
              <p className="font-bold text-gray-900 font-mono text-sm mt-0.5">{order.tracking_number}</p>
            </div>
            {order.zr_status && (
              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                {order.zr_status}
              </span>
            )}
          </div>
        )}

        {/* Timeline */}
        {order.timeline && order.timeline.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
            <h2 className="font-bold text-gray-900 text-sm mb-4">Suivi de la commande</h2>
            <div className="space-y-0">
              {order.timeline.map((step, i) => (
                <div key={step.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                      step.done
                        ? "bg-green-500 border-green-500"
                        : "bg-white border-gray-200"
                    }`}>
                      {step.done ? (
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <div className="w-2 h-2 bg-gray-200 rounded-full" />
                      )}
                    </div>
                    {i < order.timeline.length - 1 && (
                      <div className={`w-0.5 h-8 ${step.done ? "bg-green-200" : "bg-gray-100"}`} />
                    )}
                  </div>
                  <div className="pb-4 pt-1">
                    <p className={`text-sm font-semibold ${step.done ? "text-gray-900" : "text-gray-400"}`}>
                      {step.label}
                    </p>
                    {step.date && (
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(step.date)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Articles */}
        {order.items_summary && order.items_summary.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
            <h2 className="font-bold text-gray-900 text-sm mb-3">
              Articles commandés ({order.items_count})
            </h2>
            <div className="space-y-2">
              {order.items_summary.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700">
                    {item.title}
                    {item.variant_title && <span className="text-gray-400"> — {item.variant_title}</span>}
                    <span className="text-gray-400"> × {item.qty}</span>
                  </span>
                  {item.price && <span className="text-gray-900 font-medium">{formatPrice(Number(item.price) * item.qty)}</span>}
                </div>
              ))}
            </div>
            {order.total_price && (
              <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between text-sm font-bold">
                <span>Total</span>
                <span className="text-amber-600">{formatPrice(order.total_price)}</span>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <Link
          href="/produits"
          className="w-full border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-3 rounded-2xl text-center block transition-colors text-sm"
        >
          Retour à la boutique
        </Link>
      </main>
      <Footer />
    </>
  );
}
