-- ============================================================
-- NC-BOUTIQUE — Schema SQL Supabase
-- Exécuter dans : Supabase Dashboard > SQL Editor
-- Projet : NajmCoiff nc-boutique
-- Date : 2026-04-11
-- ============================================================
-- IMPORTANT : Ces instructions créent des NOUVELLES tables.
-- Elles ne modifient PAS les 15 tables existantes (nc_orders,
-- nc_variants, nc_events, etc.).
-- Exécuter dans l'ordre indiqué.
-- ============================================================

-- ============================================================
-- ÉTAPE 0 — Evolution de nc_orders pour nc-boutique
-- On ajoute des colonnes à la table existante (non destructif)
-- ============================================================

-- Ajouter order_name (numéro lisible NC-YYMMDD-XXXX)
ALTER TABLE nc_orders
  ADD COLUMN IF NOT EXISTS order_name text;

-- Ajouter delivery_mode (remplace shopify_delivery_mode progressivement)
ALTER TABLE nc_orders
  ADD COLUMN IF NOT EXISTS delivery_mode text;

-- S'assurer que order_source accepte 'nc_boutique'
-- (la colonne existe déjà — on ne la modifie pas)
-- Valeurs possibles : 'shopify' | 'web' | 'web_easysell' | 'pos' | 'nc_boutique'

COMMENT ON COLUMN nc_orders.order_name IS
  'Numéro lisible commande. Format NC-YYMMDD-XXXX pour nc_boutique, #1001 pour Shopify.';
COMMENT ON COLUMN nc_orders.delivery_mode IS
  'Mode de livraison client. Remplace progressivement shopify_delivery_mode.';


-- ============================================================
-- ÉTAPE 1 — Table nc_page_events (Phase 1 — tracking)
-- Clickstream haute fréquence : vues, paniers, tunnels achat
-- Source : nc-boutique uniquement
-- ============================================================

CREATE TABLE IF NOT EXISTS nc_page_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      text        NOT NULL,
  event_type      text        NOT NULL,
  page            text,
  product_id      text,
  variant_id      text,
  order_id        text,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  referrer        text,
  user_agent      text,
  ip_hash         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index pour les analyses fréquentes
CREATE INDEX IF NOT EXISTS idx_page_events_session    ON nc_page_events (session_id);
CREATE INDEX IF NOT EXISTS idx_page_events_type       ON nc_page_events (event_type);
CREATE INDEX IF NOT EXISTS idx_page_events_created    ON nc_page_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_events_product    ON nc_page_events (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_page_events_order      ON nc_page_events (order_id)   WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_page_events_utm        ON nc_page_events (utm_source, utm_campaign) WHERE utm_source IS NOT NULL;

COMMENT ON TABLE nc_page_events IS
  'Tracking clickstream boutique publique. Vues pages, produits, paniers, commandes. Source : nc-boutique.';
COMMENT ON COLUMN nc_page_events.session_id IS
  'ID session visiteur généré côté client (crypto.randomUUID), persisté localStorage, jamais en cookie.';
COMMENT ON COLUMN nc_page_events.event_type IS
  'Type d''événement. Valeurs : PAGE_VIEW | PRODUCT_VIEW | PRODUCT_VARIANT_SELECT | CART_ADD | CART_REMOVE | CART_VIEW | CHECKOUT_START | CHECKOUT_STEP | ORDER_PLACED | ORDER_FAILED | TRACK_VIEW | SEARCH | FILTER_APPLIED | SHARE';
COMMENT ON COLUMN nc_page_events.metadata IS
  'Données contextuelles libres. Ex : {product_id, title, price, cart_total, wilaya, error_code}';
COMMENT ON COLUMN nc_page_events.ip_hash IS
  'Hash SHA-256 de l''IP client. Jamais l''IP brute (RGPD).';

-- RLS : accès en écriture uniquement depuis le service role
ALTER TABLE nc_page_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nc_page_events_insert_service" ON nc_page_events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "nc_page_events_select_service" ON nc_page_events
  FOR SELECT USING (true);


-- ============================================================
-- ÉTAPE 2 — Table nc_products (Phase 1 — catalogue natif futur)
-- Catalogue produits propriétaire. Phase 1 : créé mais non utilisé
-- (on utilise nc_variants). Actif en Phase 2.
-- ============================================================

CREATE TABLE IF NOT EXISTS nc_products (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text    UNIQUE NOT NULL,
  title            text    NOT NULL,
  description      text,
  short_desc       text,
  images           jsonb   NOT NULL DEFAULT '[]',
  category         text,
  subcategory      text,
  tags             text[]  NOT NULL DEFAULT '{}',
  brand            text,
  is_active        boolean NOT NULL DEFAULT true,
  is_featured      boolean NOT NULL DEFAULT false,
  sort_order       integer NOT NULL DEFAULT 0,
  meta_title       text,
  meta_description text,
  shopify_product_id text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_products_slug      ON nc_products (slug);
CREATE INDEX IF NOT EXISTS idx_products_active    ON nc_products (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_featured  ON nc_products (is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_products_category  ON nc_products (category);

-- Trigger mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION update_nc_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nc_products_updated_at
  BEFORE UPDATE ON nc_products
  FOR EACH ROW EXECUTE FUNCTION update_nc_products_updated_at();

COMMENT ON TABLE nc_products IS
  'Catalogue produits natif NajmCoiff. Remplace nc_variants comme source catalogue en Phase 2. Créé en Phase 1 avec structure complète pour ne pas refaire plus tard.';
COMMENT ON COLUMN nc_products.slug IS
  'Identifiant URL unique. Ex : shampoing-argan-500ml. Utilisé dans /produits/[slug].';
COMMENT ON COLUMN nc_products.images IS
  'Tableau JSON des images. Format : [{url, alt, position, is_main}]. Priorité is_main:true pour la miniature.';
COMMENT ON COLUMN nc_products.shopify_product_id IS
  'ID Shopify origine conservé pour traçabilité migration. Peut être null pour les produits créés directement.';

-- RLS
ALTER TABLE nc_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nc_products_public_read" ON nc_products
  FOR SELECT USING (is_active = true);

CREATE POLICY "nc_products_service_all" ON nc_products
  FOR ALL USING (true);


-- ============================================================
-- ÉTAPE 3 — Table nc_stock_movements (Phase 2 — piste d'audit)
-- Historique complet de chaque mouvement de stock.
-- Permet : audit, debugging, analyse des tendances, rollback manuel.
-- ============================================================

CREATE TABLE IF NOT EXISTS nc_stock_movements (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id      text    NOT NULL,
  movement_type   text    NOT NULL,
  qty_before      integer NOT NULL,
  qty_change      integer NOT NULL,
  qty_after       integer NOT NULL,
  order_id        text,
  po_id           text,
  agent           text    NOT NULL DEFAULT 'system',
  note            text,
  source          text    NOT NULL DEFAULT 'nc_boutique',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_stock_mv_variant   ON nc_stock_movements (variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_mv_type      ON nc_stock_movements (movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_mv_order     ON nc_stock_movements (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_mv_created   ON nc_stock_movements (created_at DESC);

COMMENT ON TABLE nc_stock_movements IS
  'Piste d''audit complète des mouvements de stock. Chaque changement de nc_variants.inventory_quantity doit créer une ligne ici. Utilisé en Phase 2+.';
COMMENT ON COLUMN nc_stock_movements.movement_type IS
  'Type de mouvement. Valeurs : SALE | PO_RECEIPT | ADJUSTMENT | RETURN | BARRAGE | CORRECTION';
COMMENT ON COLUMN nc_stock_movements.qty_change IS
  'Delta de stock. Négatif pour une sortie (vente, perte), positif pour une entrée (réception PO, retour).';
COMMENT ON COLUMN nc_stock_movements.source IS
  'Origine du mouvement. Valeurs : nc_boutique | dashboard | GAS | webhook | cron';

-- RLS
ALTER TABLE nc_stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nc_stock_mv_service_all" ON nc_stock_movements
  FOR ALL USING (true);


-- ============================================================
-- ÉTAPE 4 — Table nc_customers (Phase 2 — comptes clients)
-- Clients de la boutique publique. Séparé de nc_users (agents).
-- nc_users = agents internes. nc_customers = clients boutique.
-- ============================================================

CREATE TABLE IF NOT EXISTS nc_customers (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           text    UNIQUE NOT NULL,
  full_name       text    NOT NULL,
  wilaya          text,
  address         text,
  email           text,
  total_orders    integer NOT NULL DEFAULT 0,
  total_spent     numeric NOT NULL DEFAULT 0,
  is_blocked      boolean NOT NULL DEFAULT false,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_customers_phone    ON nc_customers (phone);
CREATE INDEX IF NOT EXISTS idx_customers_wilaya   ON nc_customers (wilaya);
CREATE INDEX IF NOT EXISTS idx_customers_blocked  ON nc_customers (is_blocked) WHERE is_blocked = true;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_nc_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nc_customers_updated_at
  BEFORE UPDATE ON nc_customers
  FOR EACH ROW EXECUTE FUNCTION update_nc_customers_updated_at();

COMMENT ON TABLE nc_customers IS
  'Comptes clients boutique publique. DISTINCT de nc_users (agents internes). Créé en Phase 2. Phase 1 : les commandes sont sans compte client.';
COMMENT ON COLUMN nc_customers.phone IS
  'Numéro de téléphone algérien. Identifiant principal du client.';
COMMENT ON COLUMN nc_customers.is_blocked IS
  'Client bloqué par un agent (fraude, abus). Empêche la création de nouvelles commandes.';

-- RLS
ALTER TABLE nc_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nc_customers_service_all" ON nc_customers
  FOR ALL USING (true);


-- ============================================================
-- ÉTAPE 5 — Table nc_carts (Phase 1 optionnel — paniers persistés)
-- Paniers sauvegardés côté serveur pour les visiteurs identifiés.
-- Si non utilisé, le panier reste en localStorage (plus simple).
-- ============================================================

CREATE TABLE IF NOT EXISTS nc_carts (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      text    UNIQUE NOT NULL,
  items           jsonb   NOT NULL DEFAULT '[]',
  phone           text,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  converted       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_carts_session     ON nc_carts (session_id);
CREATE INDEX IF NOT EXISTS idx_carts_phone       ON nc_carts (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_carts_expires     ON nc_carts (expires_at);
CREATE INDEX IF NOT EXISTS idx_carts_converted   ON nc_carts (converted) WHERE converted = false;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_nc_carts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nc_carts_updated_at
  BEFORE UPDATE ON nc_carts
  FOR EACH ROW EXECUTE FUNCTION update_nc_carts_updated_at();

COMMENT ON TABLE nc_carts IS
  'Paniers persistés côté serveur (optionnel). Si non utilisé, le panier reste en localStorage. Utiliser pour la détection d''abandon panier et les notifications relance (Phase 3+).';
COMMENT ON COLUMN nc_carts.items IS
  'Articles du panier. Format : [{variant_id, qty, price, title, image_url, sku}]';
COMMENT ON COLUMN nc_carts.converted IS
  'True quand une commande a été créée depuis ce panier. Utilisé pour calculer le taux d''abandon.';

-- RLS
ALTER TABLE nc_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nc_carts_service_all" ON nc_carts
  FOR ALL USING (true);


-- ============================================================
-- VÉRIFICATION FINALE — Lister les nouvelles tables
-- ============================================================
-- Exécuter cette requête pour confirmer que tout est créé :

-- SELECT table_name, obj_description(oid) as description
-- FROM information_schema.tables t
-- JOIN pg_class c ON c.relname = t.table_name
-- WHERE table_schema = 'public'
--   AND table_name LIKE 'nc_%'
-- ORDER BY table_name;


-- ============================================================
-- NOTES DE MIGRATION
-- ============================================================
-- Phase 1 : Créer nc_page_events + nc_products + modifier nc_orders
-- Phase 2 : Créer nc_stock_movements + nc_customers + nc_carts (si utilisé)
-- Phase 4 : ALTER TABLE nc_orders DROP COLUMN shopify_order_name (après migration)
--           ALTER TABLE nc_orders DROP COLUMN shopify_order_url (après migration)
--           ALTER TABLE nc_orders DROP COLUMN shopify_delivery_mode (après migration)
--           ALTER TABLE nc_variants DROP COLUMN inventory_item_id (après Phase 2)
-- ============================================================
