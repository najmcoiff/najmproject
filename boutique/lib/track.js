"use client";
// ============================================================
// lib/track.js — Tracking client nc_page_events
// Utilisation : import { trackEvent, trackPageView, ... } from '@/lib/track'
// Fire & forget : ne bloque jamais le rendu ou la navigation
// ============================================================

import { EVENT_TYPES } from "./constants";

// ── Session ──────────────────────────────────────────────────

/**
 * Retourne le session_id du visiteur.
 * Créé une seule fois par navigateur, persisté en localStorage.
 * Jamais en cookie (RGPD simplifié).
 */
export function getSessionId() {
  if (typeof window === "undefined") return "server";
  try {
    let id = localStorage.getItem("nc_session_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("nc_session_id", id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

// ── UTM ──────────────────────────────────────────────────────

/**
 * Lit les paramètres UTM de l'URL courante.
 * Persiste en sessionStorage pour traverser les pages de la boutique.
 */
export function getUtmParams() {
  if (typeof window === "undefined") return {};
  try {
    const p = new URLSearchParams(window.location.search);
    const utm = {
      utm_source:   p.get("utm_source"),
      utm_medium:   p.get("utm_medium"),
      utm_campaign: p.get("utm_campaign"),
      utm_content:  p.get("utm_content"),
      utm_term:     p.get("utm_term"),
    };
    // Persister si des UTMs sont présents dans l'URL
    const hasUtm = Object.values(utm).some(Boolean);
    if (hasUtm) {
      sessionStorage.setItem("nc_utm", JSON.stringify(utm));
    } else {
      // Récupérer les UTMs persistés d'une page précédente
      const stored = sessionStorage.getItem("nc_utm");
      if (stored) return JSON.parse(stored);
    }
    return utm;
  } catch {
    return {};
  }
}

// ── World ─────────────────────────────────────────────────────

/**
 * Retourne le monde actif ('coiffure' | 'onglerie') depuis sessionStorage.
 */
export function getWorld() {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem("nc_world") || "coiffure";
  } catch {
    return null;
  }
}

// ── Event core ────────────────────────────────────────────────

/**
 * Envoie un événement tracking à nc_page_events.
 * Fire & forget : pas d'await, pas de throw, pas de blocage.
 *
 * @param {string} eventType  Valeur de EVENT_TYPES
 * @param {object} data       Données contextuelles libres
 */
export function trackEvent(eventType, data = {}) {
  if (typeof window === "undefined") return;
  try {
    const payload = {
      session_id: getSessionId(),
      event_type: eventType,
      world:      getWorld(),
      page:       window.location.pathname,
      referrer:   document.referrer || null,
      user_agent: navigator.userAgent,
      ...getUtmParams(),
      ...data,
    };
    // Fire & forget — on ne bloque pas sur la réponse
    fetch("/api/boutique/track-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true, // survit à la navigation de page
    }).catch(() => {});
  } catch {
    // Silencieux — le tracking ne doit jamais casser la boutique
  }
}

// ── Meta Pixel fbq() helper ───────────────────────────────────

/**
 * S'assure que les pixels exposés par MetaPixel sont init avant de tracker.
 * (Sécurité : si fireFbq est appelé avant que MetaPixel ait init les pixels,
 * on les init ici de façon idempotente pour ne perdre aucun event.)
 */
function ensurePixelInit() {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  if (!window.__nc_pixels) return;
  const inited = (window.__nc_pixels_inited ||= new Set());
  for (const id of Object.values(window.__nc_pixels)) {
    if (id && !inited.has(id)) {
      window.fbq("init", id);
      inited.add(id);
    }
  }
}

/**
 * Fire un événement Meta Pixel via window.fbq().
 * Cible le pixel du monde courant (coiffure / onglerie) via trackSingle
 * pour garantir une attribution propre entre les deux comptes Meta.
 * Silencieux si le pixel n'est pas chargé.
 */
function fireFbq(eventName, params = {}) {
  try {
    if (typeof window === "undefined" || typeof window.fbq !== "function") return;
    ensurePixelInit();
    const world = getWorld();
    const pixelId = window.__nc_pixels?.[world];
    if (pixelId) {
      window.fbq("trackSingle", pixelId, eventName, params);
    } else {
      // Fallback : aucun pixel mappé pour ce monde → broadcast classique
      window.fbq("track", eventName, params);
    }
  } catch {
    // Silencieux — jamais bloquer pour le tracking
  }
}

// ── Helpers spécialisés ───────────────────────────────────────

export function trackPageView(pageTitle) {
  trackEvent(EVENT_TYPES.PAGE_VIEW, {
    metadata: { page_title: pageTitle },
  });
}

export function trackProductView(product) {
  const variantId = product.variants?.[0]?.variant_id || product.variant_id || product.id;
  const price = Number(product.min_price || product.price || 0);
  trackEvent(EVENT_TYPES.PRODUCT_VIEW, {
    product_id: String(variantId || ""),
    variant_id: String(variantId || ""),
    metadata: {
      title: product.product_title || product.title,
      category: product.category,
      price,
    },
  });
  // Meta Pixel — ViewContent (nécessaire pour les Dynamic Ads retargeting)
  if (variantId) {
    fireFbq("ViewContent", {
      content_ids: [String(variantId)],
      content_type: "product",
      value: price,
      currency: "DZD",
    });
  }
}

export function trackVariantSelect(variant) {
  trackEvent(EVENT_TYPES.PRODUCT_VARIANT_SELECT, {
    product_id: String(variant.product_id || ""),
    variant_id: String(variant.variant_id || variant.id || ""),
    metadata: {
      variant_title: variant.variant_title || variant.title,
      price: variant.price,
      stock: variant.inventory_quantity,
    },
  });
}

export function trackCartAdd(variant, qty, cartTotal) {
  const variantId = String(variant.variant_id || variant.id || "");
  const price = Number(variant.price || 0);
  trackEvent(EVENT_TYPES.CART_ADD, {
    product_id: String(variant.product_id || ""),
    variant_id: variantId,
    metadata: {
      title: variant.product_title || variant.title,
      price,
      qty,
      cart_total: cartTotal,
    },
  });
  // Meta Pixel — AddToCart
  if (variantId) {
    fireFbq("AddToCart", {
      content_ids: [variantId],
      content_type: "product",
      value: price * (qty || 1),
      currency: "DZD",
    });
  }
}

export function trackCartRemove(variant, qtyRemoved) {
  trackEvent(EVENT_TYPES.CART_REMOVE, {
    variant_id: String(variant.variant_id || variant.id || ""),
    metadata: {
      title: variant.product_title || variant.title,
      qty_removed: qtyRemoved,
    },
  });
}

export function trackCartView(itemCount, cartTotal) {
  trackEvent(EVENT_TYPES.CART_VIEW, {
    metadata: { item_count: itemCount, cart_total: cartTotal },
  });
}

export function trackCheckoutStart(itemCount, cartTotal) {
  trackEvent(EVENT_TYPES.CHECKOUT_START, {
    metadata: { item_count: itemCount, cart_total: cartTotal },
  });
  // Meta Pixel — InitiateCheckout
  fireFbq("InitiateCheckout", {
    value: Number(cartTotal || 0),
    currency: "DZD",
    num_items: Number(itemCount || 0),
  });
}

export function trackCheckoutStep(fieldName) {
  trackEvent(EVENT_TYPES.CHECKOUT_STEP, {
    metadata: { field_name: fieldName },
  });
}

export function trackSearch(query, resultsCount) {
  trackEvent(EVENT_TYPES.SEARCH, {
    metadata: { query, results_count: resultsCount },
  });
}

export function trackFilterApplied(filterType, filterValue) {
  trackEvent(EVENT_TYPES.FILTER_APPLIED, {
    metadata: { filter_type: filterType, filter_value: filterValue },
  });
}

export function trackTrackingView(orderId, status) {
  trackEvent(EVENT_TYPES.TRACK_VIEW, {
    order_id: String(orderId || ""),
    metadata: { status_at_view: status },
  });
}
