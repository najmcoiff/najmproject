"use client";
// ============================================================
// lib/cart.js — Gestion du panier (localStorage)
// ============================================================
import { useState, useEffect, useCallback } from "react";

const CART_KEY = "nc_cart";

// ── Helpers bas niveau ────────────────────────────────────────

export function readCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
}

export function writeCart(items) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event("nc_cart_updated"));
  } catch {}
}

export function clearCart() {
  writeCart([]);
}

// ── Hook React ────────────────────────────────────────────────

export function useCart() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    setItems(readCart());
    const handler = () => setItems(readCart());
    window.addEventListener("nc_cart_updated", handler);
    return () => window.removeEventListener("nc_cart_updated", handler);
  }, []);

  const addToCart = useCallback((product, qty = 1) => {
    const current = readCart();
    const variantId = String(product.variant_id || product.id);
    const existing = current.findIndex((i) => i.variant_id === variantId);

    if (existing >= 0) {
      current[existing].qty = Math.min(
        current[existing].qty + qty,
        Number(product.inventory_quantity) || 99
      );
    } else {
      current.push({
        variant_id:    variantId,
        product_id:    String(product.product_id || ""),
        title:         product.product_title || product.title,
        variant_title: product.variant_title || null,
        price:         product.price,
        image_url:     product.image_url || null,
        sku:           product.sku || null,
        qty,
        max_qty:       Number(product.inventory_quantity) || 99,
      });
    }
    writeCart(current);
    setItems([...current]);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("nc_cart_add_animation", {
        detail: { imageUrl: product.image_url || null, title: product.product_title || product.title }
      }));
    }
  }, []);

  const updateQty = useCallback((variantId, qty) => {
    const current = readCart();
    const idx = current.findIndex((i) => i.variant_id === String(variantId));
    if (idx < 0) return;
    if (qty <= 0) {
      current.splice(idx, 1);
    } else {
      current[idx].qty = Math.min(qty, current[idx].max_qty || 99);
    }
    writeCart(current);
    setItems([...current]);
  }, []);

  const removeFromCart = useCallback((variantId) => {
    const current = readCart().filter((i) => i.variant_id !== String(variantId));
    writeCart(current);
    setItems([...current]);
  }, []);

  const total = items.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);
  const count = items.reduce((s, i) => s + Number(i.qty), 0);

  return { items, total, count, addToCart, updateQty, removeFromCart };
}
