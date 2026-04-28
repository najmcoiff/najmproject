-- ═══════════════════════════════════════════════════════════════════════════
-- SUPABASE_SETUP_BOUTIQUE.sql
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL Supabase
-- Couvre : T01 · T08 · T09 · T13 · T07
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── T01 : Colonnes nc_variants (prérequis migration Shopify) ───────────────
ALTER TABLE nc_variants ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC;
ALTER TABLE nc_variants ADD COLUMN IF NOT EXISTS description      TEXT;
ALTER TABLE nc_variants ADD COLUMN IF NOT EXISTS is_new           BOOLEAN DEFAULT FALSE;
ALTER TABLE nc_variants ADD COLUMN IF NOT EXISTS collections      TEXT[]  DEFAULT '{}';
ALTER TABLE nc_variants ADD COLUMN IF NOT EXISTS world            TEXT    DEFAULT 'coiffure';

-- Mettre à jour le champ world depuis collections_titles existant
UPDATE nc_variants
SET world = 'onglerie'
WHERE collections_titles ILIKE '%onglerie%';

UPDATE nc_variants
SET world = 'coiffure'
WHERE NOT (collections_titles ILIKE '%onglerie%') OR collections_titles IS NULL;

-- ─── T13 : Colonne world dans nc_page_events ────────────────────────────────
ALTER TABLE nc_page_events ADD COLUMN IF NOT EXISTS world TEXT;

-- ─── Colonnes boutique dans nc_orders (si pas encore ajoutées) ──────────────
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS order_name          TEXT;
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS idempotency_key     TEXT UNIQUE;
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS session_id          TEXT;
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS order_source        TEXT DEFAULT 'shopify';
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS utm_source          TEXT;
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS utm_medium          TEXT;
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS utm_campaign        TEXT;
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS customer_first_name TEXT;
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS customer_last_name  TEXT;
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS customer_phone      TEXT;
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS customer_wilaya     TEXT;
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS customer_commune    TEXT;
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS delivery_type       TEXT;
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS delivery_price      NUMERIC;
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS coupon_code         TEXT;
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS coupon_discount     NUMERIC;
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS delivery_mode       TEXT;
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS items_json          JSONB;

-- ─── T08 : Table nc_boutique_config ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nc_boutique_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  label      TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Valeurs par défaut
INSERT INTO nc_boutique_config (key, value, label) VALUES
  ('whatsapp_number',      '213XXXXXXXXX',               'Numéro WhatsApp boutique (format 213XXXXXXXXX)'),
  ('promo_banner_text',    '',                            'Texte de la barre promo (vide = désactivé)'),
  ('promo_banner_active',  'false',                       'Activer la barre promo (true/false)'),
  ('site_name',            'نجم كواف',                   'Nom du site affiché'),
  ('facebook_coiffure',    '',                            'Lien page Facebook Coiffure'),
  ('instagram_handle',     '@najmcoiff',                  'Handle Instagram'),
  ('meta_pixel_coiffure',  '',                            'ID Pixel Facebook Coiffure'),
  ('meta_pixel_onglerie',  '',                            'ID Pixel Facebook Onglerie')
ON CONFLICT (key) DO NOTHING;

-- RLS : lecture anon OK, écriture service_role uniquement
ALTER TABLE nc_boutique_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_read_all"     ON nc_boutique_config;
DROP POLICY IF EXISTS "config_write_service" ON nc_boutique_config;

CREATE POLICY "config_read_all"
  ON nc_boutique_config FOR SELECT USING (true);

CREATE POLICY "config_write_service"
  ON nc_boutique_config FOR ALL
  USING (auth.role() = 'service_role');

-- ─── T09 : Table nc_banners ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nc_banners (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  world      TEXT    NOT NULL DEFAULT 'both',  -- 'coiffure' | 'onglerie' | 'both'
  image_url  TEXT    NOT NULL,
  link_url   TEXT,
  alt_text   TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS : lecture anon OK, écriture service_role uniquement
ALTER TABLE nc_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "banners_read_active"   ON nc_banners;
DROP POLICY IF EXISTS "banners_write_service" ON nc_banners;

CREATE POLICY "banners_read_active"
  ON nc_banners FOR SELECT
  USING (is_active = true);

CREATE POLICY "banners_write_service"
  ON nc_banners FOR ALL
  USING (auth.role() = 'service_role');

-- ─── T07 : Table nc_delivery_config ─────────────────────────────────────────
-- (À remplir avec les prix réels — voir DONNÉES EN ATTENTE dans TASKS.md)
CREATE TABLE IF NOT EXISTS nc_delivery_config (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  wilaya_code  INTEGER NOT NULL,
  wilaya_name  TEXT    NOT NULL,
  commune_name TEXT    NOT NULL DEFAULT '',
  price_home   INTEGER NOT NULL DEFAULT 400,
  price_office INTEGER NOT NULL DEFAULT 350,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS nc_delivery_config_wilaya_commune_idx
  ON nc_delivery_config (wilaya_code, commune_name);

-- Prix par défaut : 400 DA domicile / 350 DA bureau pour toutes les wilayas
INSERT INTO nc_delivery_config (wilaya_code, wilaya_name, commune_name, price_home, price_office)
SELECT code, name, '', 400, 350
FROM (VALUES
  (1,'Adrar'),(2,'Chlef'),(3,'Laghouat'),(4,'Oum El Bouaghi'),(5,'Batna'),
  (6,'Béjaïa'),(7,'Biskra'),(8,'Béchar'),(9,'Blida'),(10,'Bouira'),
  (11,'Tamanrasset'),(12,'Tébessa'),(13,'Tlemcen'),(14,'Tiaret'),(15,'Tizi Ouzou'),
  (16,'Alger'),(17,'Djelfa'),(18,'Jijel'),(19,'Sétif'),(20,'Saïda'),
  (21,'Skikda'),(22,'Sidi Bel Abbès'),(23,'Annaba'),(24,'Guelma'),(25,'Constantine'),
  (26,'Médéa'),(27,'Mostaganem'),(28,'M''Sila'),(29,'Mascara'),(30,'Ouargla'),
  (31,'Oran'),(32,'El Bayadh'),(33,'Illizi'),(34,'Bordj Bou Arreridj'),(35,'Boumerdès'),
  (36,'El Tarf'),(37,'Tindouf'),(38,'Tissemsilt'),(39,'El Oued'),(40,'Khenchela'),
  (41,'Souk Ahras'),(42,'Tipaza'),(43,'Mila'),(44,'Aïn Defla'),(45,'Naâma'),
  (46,'Aïn Témouchent'),(47,'Ghardaïa'),(48,'Relizane'),(49,'Timimoun'),
  (50,'Bordj Badji Mokhtar'),(51,'Ouled Djellal'),(52,'Béni Abbès'),
  (53,'In Salah'),(54,'In Guezzam'),(55,'Touggourt'),(56,'Djanet'),
  (57,'El M''Ghair'),(58,'El Meniaa')
) AS t(code, name)
ON CONFLICT (wilaya_code, commune_name) DO NOTHING;

-- RLS : lecture anon OK, écriture service_role
ALTER TABLE nc_delivery_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delivery_read_all"     ON nc_delivery_config;
DROP POLICY IF EXISTS "delivery_write_service" ON nc_delivery_config;

CREATE POLICY "delivery_read_all"
  ON nc_delivery_config FOR SELECT USING (true);

CREATE POLICY "delivery_write_service"
  ON nc_delivery_config FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Vérification finale ─────────────────────────────────────────────────────
SELECT 'nc_variants colonnes boutique' AS check,
       count(*) FILTER (WHERE world = 'onglerie') AS onglerie,
       count(*) FILTER (WHERE world = 'coiffure') AS coiffure
FROM nc_variants;

SELECT 'nc_boutique_config' AS check, count(*) AS rows FROM nc_boutique_config;
SELECT 'nc_delivery_config' AS check, count(*) AS rows FROM nc_delivery_config;
SELECT 'nc_banners'         AS check, count(*) AS rows FROM nc_banners;
