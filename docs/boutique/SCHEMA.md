# SCHEMA.md — Tables Supabase (nc-boutique)
> version: 1.0 | updated: 2026-04-11
> Schema actuel + modifications à appliquer.
> ⚠️ NE PAS modifier sans documenter ici d'abord.

---

## TABLES EXISTANTES (dashboard — ne pas modifier)

### nc_orders
```sql
-- Colonnes boutique ajoutées (à vérifier si elles existent)
order_source       TEXT DEFAULT 'shopify'  -- 'shopify' | 'nc_boutique' | 'pos'
order_name         TEXT                    -- 'NC-260411-0001' ou 'POS-260412-0001'
idempotency_key    TEXT UNIQUE
session_id         TEXT
utm_source         TEXT
utm_medium         TEXT
utm_campaign       TEXT
utm_content        TEXT
customer_first_name TEXT
customer_last_name  TEXT
customer_phone     TEXT
customer_wilaya    TEXT
customer_commune   TEXT
delivery_type      TEXT  -- 'home' | 'office'
delivery_price     NUMERIC
coupon_code        TEXT
coupon_discount    NUMERIC

-- Colonnes ajoutées (T94–T98 — 2026-04-12)
full_name          TEXT                    -- nom complet client (nc_boutique + pos)
phone              TEXT                    -- téléphone normalisé
total_price        NUMERIC                 -- total commande (nc_boutique)
sold_by            TEXT                    -- agent POS qui a effectué la vente
stock_deducted     BOOLEAN DEFAULT FALSE   -- TRUE si tous les items ont été déduits du stock
```

### nc_variants (source catalogue Phase 1)
```sql
-- Colonnes existantes (ne pas modifier)
variant_id         TEXT PRIMARY KEY
product_id         TEXT
product_title      TEXT
vendor             TEXT
variant_title      TEXT
sku                TEXT
barcode            TEXT
price              NUMERIC
inventory_quantity INTEGER
image_url          TEXT
display_name       TEXT
updated_at         TIMESTAMPTZ

-- Colonnes ajoutées (migration T01 — DONE)
compare_at_price   NUMERIC DEFAULT NULL    -- prix barré
collections        TEXT[] DEFAULT '{}'     -- titres de collections Shopify ex: ['AWAKHIR', 'مشط']
collections_titles TEXT DEFAULT ''         -- version jointe pour recherche ILIKE
description        TEXT DEFAULT NULL       -- description produit (HTML strippé)
is_new             BOOLEAN DEFAULT FALSE   -- badge AWAKHIR
world              TEXT DEFAULT 'coiffure' -- 'coiffure' | 'onglerie'

-- Colonnes à AJOUTER (T26 — enrichissement)
tags               TEXT[] DEFAULT '{}'     -- balises Shopify ex: ['onglerie','promo','bestseller']
collection_ids     TEXT[] DEFAULT '{}'     -- IDs Shopify des collections (pour JOIN avec nc_collections)
```

-- SQL à exécuter dans Supabase Editor :
-- ALTER TABLE nc_variants ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
-- ALTER TABLE nc_variants ADD COLUMN IF NOT EXISTS collection_ids TEXT[] DEFAULT '{}';
```

### nc_page_events (créée)
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
session_id       TEXT NOT NULL
event_type       TEXT NOT NULL  -- PAGE_VIEW, CART_ADD, ORDER_PLACED, ...
world            TEXT           -- 'coiffure' | 'onglerie' (à ajouter — T13)
page             TEXT
product_id       TEXT
variant_id       TEXT
metadata         JSONB
utm_source       TEXT
utm_medium       TEXT
utm_campaign     TEXT
utm_content      TEXT
utm_term         TEXT
referrer         TEXT
ip_hash          TEXT  -- SHA-256 de l'IP, jamais l'IP brute
created_at       TIMESTAMPTZ DEFAULT NOW()
```

---

### nc_collections (T26 — nouvelles)
```sql
CREATE TABLE IF NOT EXISTS nc_collections (
  collection_id   TEXT PRIMARY KEY,          -- ID Shopify (ex: '123456789')
  title           TEXT NOT NULL,             -- titre Shopify (ex: 'Gel UV', 'Onglerie')
  handle          TEXT,                      -- slug Shopify (ex: 'gel-uv')
  world           TEXT DEFAULT 'coiffure',   -- 'coiffure' | 'onglerie'
  products_count  INTEGER DEFAULT 0,         -- nb variantes actives dans cette collection
  image_url       TEXT,                      -- image représentative (optionnel)
  sort_order      INTEGER DEFAULT 0,         -- ordre d'affichage sur la boutique
  active          BOOLEAN DEFAULT TRUE,      -- visible sur la boutique
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
-- RLS : lecture anon OK (collections actives), écriture service_role uniquement
-- Index
CREATE INDEX IF NOT EXISTS idx_nc_collections_world ON nc_collections(world);
CREATE INDEX IF NOT EXISTS idx_nc_collections_active ON nc_collections(active);
```

---

## FONCTIONS SQL (créées — 2026-04-12)

```sql
-- Décrémente le stock de façon atomique (avec FOR UPDATE pour éviter les race conditions)
-- Retourne qty_before et qty_after pour le log nc_stock_movements
CREATE OR REPLACE FUNCTION decrement_stock(p_variant_id TEXT, p_qty INTEGER)
RETURNS TABLE(qty_before INTEGER, qty_after INTEGER) AS $$
DECLARE v_before INTEGER; v_after INTEGER;
BEGIN
  SELECT inventory_quantity INTO v_before FROM nc_variants WHERE variant_id = p_variant_id FOR UPDATE;
  v_after := GREATEST(0, v_before - p_qty);
  UPDATE nc_variants SET inventory_quantity = v_after WHERE variant_id = p_variant_id;
  RETURN QUERY SELECT v_before, v_after;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Incrémente le stock (pour restaurations lors de retours/modifications commandes)
CREATE OR REPLACE FUNCTION increment_stock(p_variant_id TEXT, p_qty INTEGER)
RETURNS TABLE(qty_before INTEGER, qty_after INTEGER) AS $$
DECLARE v_before INTEGER; v_after INTEGER;
BEGIN
  SELECT inventory_quantity INTO v_before FROM nc_variants WHERE variant_id = p_variant_id FOR UPDATE;
  v_after := v_before + p_qty;
  UPDATE nc_variants SET inventory_quantity = v_after WHERE variant_id = p_variant_id;
  RETURN QUERY SELECT v_before, v_after;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## TABLES À CRÉER

### nc_delivery_config (T07)
```sql
CREATE TABLE nc_delivery_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wilaya        TEXT NOT NULL,
  commune       TEXT NOT NULL,
  price_home    NUMERIC NOT NULL DEFAULT 400,
  price_office  NUMERIC NOT NULL DEFAULT 300,
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
-- Index
CREATE UNIQUE INDEX ON nc_delivery_config(wilaya, commune);
-- RLS : lecture anon OK, écriture service_role uniquement
```

### nc_boutique_config (T08)
```sql
CREATE TABLE nc_boutique_config (
  key           TEXT PRIMARY KEY,
  value         TEXT,
  value_json    JSONB,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_by    TEXT
);
-- Valeurs initiales
INSERT INTO nc_boutique_config (key, value) VALUES
  ('whatsapp_number', '213XXXXXXXXX'),
  ('promo_banner_text', NULL),
  ('promo_banner_active', 'false'),
  ('site_name', 'NajmCoiff');
-- RLS : lecture anon OK, écriture service_role uniquement
```

### nc_banners (T09)
```sql
CREATE TABLE nc_banners (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world      TEXT NOT NULL DEFAULT 'coiffure',  -- 'coiffure' | 'onglerie' | 'both'
  title      TEXT,
  subtitle   TEXT,
  image_url  TEXT,
  link       TEXT,
  position   INTEGER DEFAULT 0,
  active     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- RLS : lecture anon OK, écriture owner uniquement
```

---

## MODIFICATIONS nc_users (pour dashboard owner)

```sql
-- Ajouter colonne role
ALTER TABLE nc_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'agent';
-- Valeurs : 'agent' | 'admin' | 'owner'
-- Mettre à jour le propriétaire :
UPDATE nc_users SET role = 'owner' WHERE username = 'najm';
```

---

## POLITIQUE RLS (policies extraites depuis Supabase — 2026-04-12)

> Source : `pg_policies` Supabase — extrait automatiquement via API Management.

### Tables nc-boutique critiques

| Table | Policy | Commande | Condition | Notes |
|---|---|---|---|---|
| `nc_variants` | `open_cache` | ALL | `true` | Lecture publique totale |
| `nc_variants` | `public read` | ALL | `true` | Double policy (legacy) |
| `nc_collections` | `collections_read_active` | SELECT | `is_active = true` | Visible si actif |
| `nc_collections` | `collections_write_service` | ALL | `auth.role()='service_role'` | Écriture dashboard uniquement |
| `nc_orders` | `open_cache` | ALL | `true` | ⚠️ Ouvert — sécurité via service_role dans le code |
| `nc_orders` | `public read` | ALL | `true` | Double policy (legacy) |
| `nc_page_events` | `nc_page_events_insert_service` | INSERT | _(no check)_ | Insert libre |
| `nc_page_events` | `nc_page_events_select_service` | SELECT | `true` | Lecture libre |
| `nc_delivery_config` | `delivery_read_all` | SELECT | `true` | Lecture publique prix livraison |
| `nc_delivery_config` | `delivery_write_service` | ALL | `auth.role()='service_role'` | Écriture protégée |
| `nc_boutique_config` | `config_read_all` | SELECT | `true` | Lecture publique config |
| `nc_boutique_config` | `config_write_service` | ALL | `auth.role()='service_role'` | Écriture protégée |
| `nc_banners` | `banners_read_active` | SELECT | `is_active = true` | Banners actifs uniquement |
| `nc_banners` | `banners_write_service` | ALL | `auth.role()='service_role'` | Écriture dashboard uniquement |
| `nc_users` | `nc_users_service_all` | ALL | `true` | ⚠️ Ouvert — vérifier |
| `nc_carts` | `nc_carts_service_all` | ALL | `true` | Ouvert (phase 2) |
| `nc_customers` | `nc_customers_service_all` | ALL | `true` | Ouvert (phase 2) |
| `nc_stock_movements` | `nc_stock_mv_service_all` | ALL | `true` | Audit stock |

### ⚠️ Points d'attention RLS

1. **`nc_orders` est entièrement ouvert** (2 policies ALL = true) — la sécurité repose sur le fait que les routes API utilisent la `service_role_key` côté serveur uniquement.
2. **`nc_users` est ouvert** — mots de passe hashés en DB, jamais en clair.
3. **Pas de RLS sur nc_collections** pour les inserts anon — protégé uniquement par `service_role` dans les routes owner.

### Tableau résumé opérationnel

| Table | Anon SELECT | Anon INSERT | Service ALL |
|---|---|---|---|
| `nc_variants` | ✅ | ✅ (legacy) | ✅ |
| `nc_collections` | ✅ (actives) | ❌ | ✅ |
| `nc_orders` | ✅ (legacy open) | ✅ (legacy open) | ✅ |
| `nc_page_events` | ✅ | ✅ | ✅ |
| `nc_delivery_config` | ✅ | ❌ | ✅ |
| `nc_boutique_config` | ✅ | ❌ | ✅ |
| `nc_banners` | ✅ (actifs) | ❌ | ✅ |
| `nc_users` | ✅ (legacy open) | ✅ (legacy open) | ✅ |
| `nc_stock_movements` | ✅ | ✅ | ✅ |

---

## COMMANDES SQL UTILES

```sql
-- Vérifier colonnes nc_variants
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'nc_variants' ORDER BY ordinal_position;

-- Vérifier colonnes nc_orders
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'nc_orders' ORDER BY ordinal_position;

-- Compter produits actifs par monde
SELECT world, count(*) FROM nc_variants
WHERE inventory_quantity > 0 GROUP BY world;
```
