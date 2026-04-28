# DATA_FLOWS.md — Flux de données nc-boutique
> version: 1.0 | updated: 2026-04-11
> Décrit comment les données circulent entre le client, Vercel, Supabase et les services tiers.

---

## FLUX 1 — Affichage Catalogue

```
Client (navigateur)
    │
    ▼
GET /api/boutique/products?world=coiffure&limit=20
    │
    ▼
Vercel (nc-boutique) ──► Supabase (nc_variants)
                          SELECT variant_id, product_title, price, image_url, ...
                          WHERE inventory_quantity > 0 AND status = 'active'
    │
    ▼
JSON → ProductCard[] (React)
    │
    ▼
track-event → nc_page_events (PRODUCT_VIEW)
```

**Tables touchées :** `nc_variants` (lecture), `nc_page_events` (insert)
**Clé Supabase :** anon (publique)

---

## FLUX 2 — Passage de Commande

```
Client : bouton "إتمام الطلب"
    │
    │ 1. Génère idempotency_key (UUID v4 dans localStorage)
    │ 2. Envoie POST /api/boutique/order
    ▼
Vercel (nc-boutique/app/api/boutique/order/route.js)
    │
    ├─ Validation données (Zod ou checks manuels)
    │
    ├─ Vérification stock : SELECT inventory_quantity FROM nc_variants WHERE variant_id IN (...)
    │         Si stock insuffisant → 422
    │
    ├─ Vérification idempotency : SELECT id FROM nc_orders WHERE idempotency_key = ?
    │         Si existe → retourner la commande existante (409 ou 200 selon implémentation)
    │
    ├─ Calcul remise : si coupon_code → SELECT percentage FROM nc_partenaires WHERE code = ?
    │
    ├─ Calcul livraison : SELECT price_home/price_office FROM nc_delivery_config WHERE wilaya = ? AND commune = ?
    │
    ├─ INSERT nc_orders (order_source = 'nc_boutique', order_name = 'NC-YYMMDD-XXXX')
    │
    ├─ INSERT nc_page_events (event_type = 'ORDER_PLACED')
    │
    ├─ INSERT nc_events (log_type = 'BOUTIQUE_ORDER_PLACED')
    │
    └─ [Futur] Push notification agents
    │
    ▼
Response 201 : { order_id, order_name, total, status }
    │
    ▼
Client : redirect vers /merci/[order_id]
```

**Tables touchées :**
- `nc_variants` (lecture stock)
- `nc_orders` (INSERT)
- `nc_partenaires` (lecture si coupon)
- `nc_delivery_config` (lecture prix)
- `nc_page_events` (INSERT)
- `nc_events` (INSERT)

**Clé Supabase :** service_role (écriture)

---

## FLUX 3 — Suivi Commande

```
Client : saisit numéro commande dans /suivi
    │
    ▼
GET /api/boutique/track/NC-260411-0001
    │
    ▼
Vercel
    ├─ SELECT * FROM nc_orders WHERE order_name = ? OR id = ?
    └─ SELECT * FROM nc_suivi_zr WHERE order_id = ?
    │
    ▼
JSON → Timeline (statuts) + numéro ZR si disponible
```

**Tables touchées :** `nc_orders` (lecture), `nc_suivi_zr` (lecture)
**Clé Supabase :** service_role (pour bypass RLS — nc_orders non public)

---

## FLUX 4 — Tracking Client (fire & forget)

```
Client : visite une page ou ajoute au panier
    │
    ▼
POST /api/boutique/track-event (fire & forget)
    │
    ├─ Hash IP → SHA-256
    ├─ Lire session_id depuis le body
    ├─ INSERT nc_page_events
    │
    ▼
Response 200 immédiate (pas d'attente DB)
```

**Tables touchées :** `nc_page_events` (INSERT)
**Clé Supabase :** service_role

---

## FLUX 5 — Snapshot Stock (GAS → nc_variants)

```
Trigger manuel ou CRON GAS
    │
    ▼
📊 EVENTS & STOCK.js (GAS)
    ├─ Shopify Admin API → GET /products + GET /inventory_levels
    ├─ Pour chaque variante : UPSERT nc_variants (prix, stock, image)
    └─ INSERT nc_events (STOCK_SNAPSHOT)
```

**Tables touchées :** `nc_variants` (UPSERT), `nc_events` (INSERT)
**Note :** Ce flux alimente le catalogue boutique Phase 1.

---

## FLUX 6 — Confirmation Commande (Dashboard agents)

```
Agent voit la commande dans /dashboard/operations
    │
    ▼
PATCH /api/orders/pos-sync ou action manuelle
    │
    ├─ UPDATE nc_orders SET status = 'confirmed'
    └─ INSERT nc_events (ORDER_CONFIRMED)
    │
    ▼
[Futur] SMS ou notification WhatsApp automatique au client
```

---

## MATRICE DES DÉPENDANCES

| Fonctionnalité | Dépend de |
|---|---|
| Afficher le catalogue | `nc_variants` peuplé (snapshot GAS) |
| Passer une commande | `nc_delivery_config` avec prix, `nc_variants` avec stock |
| Code partenaire | `nc_partenaires` avec entrées valides |
| Suivi commande | `nc_orders` avec `order_name`, `nc_suivi_zr` si expédié |
| Tracking marketing | `nc_page_events` créée + colonne `world` |
| Dashboard owner | `nc_boutique_config`, `nc_delivery_config`, `nc_banners` créées |
