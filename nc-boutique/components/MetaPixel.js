"use client";

import { useEffect } from "react";
import Script from "next/script";
import { getWorld } from "@/lib/track";

export default function MetaPixel() {
  const pixelCoiffure = process.env.NEXT_PUBLIC_META_PIXEL_COIFFURE;
  const pixelOnglerie = process.env.NEXT_PUBLIC_META_PIXEL_ONGLERIE;

  useEffect(() => {
    if (typeof window === "undefined" || !window.fbq) return;
    const world = getWorld();
    const rawId = world === "onglerie" ? pixelOnglerie : pixelCoiffure;
    const pixelId = rawId?.trim(); // trim \r\n éventuels depuis les env vars
    if (pixelId) {
      window.fbq("init", pixelId);
      window.fbq("track", "PageView");
    }
  }, [pixelCoiffure, pixelOnglerie]);

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
