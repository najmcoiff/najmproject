"use client";

import { useEffect } from "react";

/**
 * MerciPixelFire — Fire Meta Pixel Purchase event on order confirmation page.
 * Client Component only — uses window.fbq().
 * Rendered once on mount; never fires twice (sessionStorage guard).
 * Cible le bon pixel (coiffure/onglerie) via trackSingle pour une
 * attribution propre entre les deux comptes Meta.
 */
export default function MerciPixelFire({ orderId, orderTotal, contentIds }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Anti-doublon : ne pas re-fire si déjà envoyé pour cette commande
    const key = `nc_purchase_fired_${orderId}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {}

    // fbq peut ne pas encore être prêt (Script afterInteractive) → retry court.
    function tryFire(retries = 30) {
      if (typeof window.fbq !== "function") {
        if (retries > 0) setTimeout(() => tryFire(retries - 1), 100);
        return;
      }

      // Init paresseux des pixels exposés par MetaPixel (idempotent).
      const inited = (window.__nc_pixels_inited ||= new Set());
      if (window.__nc_pixels) {
        for (const id of Object.values(window.__nc_pixels)) {
          if (id && !inited.has(id)) {
            window.fbq("init", id);
            inited.add(id);
          }
        }
      }

      let world = "coiffure";
      try {
        world = sessionStorage.getItem("nc_world") || "coiffure";
      } catch {}
      const pixelId = window.__nc_pixels?.[world];

      const params = {
        value: Number(orderTotal || 0),
        currency: "DZD",
        content_ids: contentIds || [],
        content_type: "product",
      };

      if (pixelId) {
        window.fbq("trackSingle", pixelId, "Purchase", params);
      } else {
        window.fbq("track", "Purchase", params);
      }

      try { sessionStorage.setItem(key, "1"); } catch {}
    }
    tryFire();
  }, [orderId, orderTotal, contentIds]);

  return null;
}
