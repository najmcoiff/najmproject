"use client";

import { useEffect } from "react";

/**
 * MerciPixelFire — Fire Meta Pixel Purchase event on order confirmation page.
 * Client Component only — uses window.fbq().
 * Rendered once on mount; never fires twice (sessionStorage guard).
 */
export default function MerciPixelFire({ orderId, orderTotal, contentIds }) {
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.fbq !== "function") return;

    // Anti-doublon : ne pas re-fire si déjà envoyé pour cette commande
    const key = `nc_purchase_fired_${orderId}`;
    if (sessionStorage.getItem(key)) return;

    window.fbq("track", "Purchase", {
      value: Number(orderTotal || 0),
      currency: "DZD",
      content_ids: contentIds || [],
      content_type: "product",
    });

    sessionStorage.setItem(key, "1");
  }, [orderId, orderTotal, contentIds]);

  return null;
}
