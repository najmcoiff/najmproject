"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { getWorld } from "@/lib/track";

const pixelCoiffure = process.env.NEXT_PUBLIC_META_PIXEL_COIFFURE?.trim();
const pixelOnglerie = process.env.NEXT_PUBLIC_META_PIXEL_ONGLERIE?.trim();

// Exposer les pixel ids le plus tôt possible (avant tout effet enfant)
// pour que lib/track.js puisse cibler le bon pixel via trackSingle.
if (typeof window !== "undefined" && (pixelCoiffure || pixelOnglerie)) {
  window.__nc_pixels = {
    coiffure: pixelCoiffure || null,
    onglerie: pixelOnglerie || null,
  };
}

export default function MetaPixel() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Le SDK est chargé en strategy="afterInteractive" → fbq peut ne pas
    // encore être prêt au tout premier render. On retente jusqu'à 3s.
    function tryInitAndTrack(retries = 30) {
      if (typeof window.fbq !== "function") {
        if (retries > 0) setTimeout(() => tryInitAndTrack(retries - 1), 100);
        return;
      }

      // Init des deux pixels une seule fois (idempotent côté Meta).
      // Cela garantit que le pixel onglerie est prêt même si l'utilisateur
      // a d'abord visité coiffure (root layout ne re-mount jamais sur App Router).
      const inited = (window.__nc_pixels_inited ||= new Set());
      if (pixelCoiffure && !inited.has(pixelCoiffure)) {
        window.fbq("init", pixelCoiffure);
        inited.add(pixelCoiffure);
      }
      if (pixelOnglerie && !inited.has(pixelOnglerie)) {
        window.fbq("init", pixelOnglerie);
        inited.add(pixelOnglerie);
      }

      // Détection du monde : URL prioritaire, sessionStorage en fallback.
      let world = "coiffure";
      if (pathname?.includes("/collections/onglerie")) world = "onglerie";
      else if (pathname?.includes("/collections/coiffure")) world = "coiffure";
      else world = getWorld() || "coiffure";

      const activePixel = world === "onglerie" ? pixelOnglerie : pixelCoiffure;
      if (activePixel) {
        // trackSingle : seul le pixel du monde courant reçoit le PageView,
        // évite la pollution d'attribution entre coiffure et onglerie.
        window.fbq("trackSingle", activePixel, "PageView");
      }
    }
    tryInitAndTrack();
  }, [pathname]);

  if (!pixelCoiffure && !pixelOnglerie) return null;

  return (
    <Script
      id="meta-pixel-sdk"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');`,
      }}
    />
  );
}
