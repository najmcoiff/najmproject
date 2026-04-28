# SCHEMA.md — Tables Supabase (module marketing IA)
> version: 1.0 | updated: 2026-04-14
> DDL des nouvelles tables `nc_ai_*` pour le module marketing IA.
> ⚠️ NE PAS modifier sans documenter ici d'abord.

---

## Convention de nommage

- Préfixe `nc_ai_` pour toutes les tables marketing IA
- Clé primaire UUID `gen_random_uuid()` sauf mention contraire
- `created_at` TIMESTAMPTZ DEFAULT NOW() sur toutes les tables
- Toutes les tables : RLS activé, écriture `service_role` uniquement

---

## Agent 1 : Catalog Intelligence

### nc_ai_product_scores

```sql
CREATE TABLE IF NOT EXISTS nc_ai_product_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id      TEXT NOT NULL REFERENCES nc_variants(variant_id) ON DELETE CASCADE,
  score_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  health_score    NUMERIC(5,2) NOT NULL DEFAULT 0,     -- 0-100
  sales_30d       INTEGER DEFAULT 0,
  views_30d       INTEGER DEFAULT 0,
  cart_adds_30d   INTEGER DEFAULT 0,
  conversion_rate NUMERIC(5,4) DEFAULT 0,              -- views → orders ratio
  margin_pct      NUMERIC(5,2) DEFAULT NULL,            -- (price - cost) / price * 100
  stock_days_left NUMERIC(7,1) DEFAULT NULL,            -- jours de stock restant au rythme actuel
  velocity        TEXT DEFAULT 'normal',                -- 'fast' | 'normal' | 'slow' | 'dead'
  world           TEXT DEFAULT 'coiffure',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(variant_id, score_date)
);

CREATE INDEX idx_ai_scores_date ON nc_ai_product_scores(score_date DESC);
CREATE INDEX idx_ai_scores_velocity ON nc_ai_product_scores(velocity) WHERE velocity IN ('fast', 'dead');
CREATE INDEX idx_ai_scores_world ON nc_ai_product_scores(world);

ALTER TABLE nc_ai_product_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_scores_service_all ON nc_ai_product_scores FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY ai_scores_read ON nc_ai_product_scores FOR SELECT USING (true);
```

### nc_ai_recommendations

```sql
CREATE TABLE IF NOT EXISTS nc_ai_recommendations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id      TEXT NOT NULL,
  action_type     TEXT NOT NULL,  -- 'promote' | 'discount' | 'bundle' | 'liquidate' | 'restock' | 'price_up' | 'awakhir'
  priority        INTEGER DEFAULT 0,                    -- 1 = haute, 5 = basse
  reason          TEXT NOT NULL,                         -- explication en français
  suggested_value JSONB DEFAULT '{}',                    -- ex: {"compare_at_price": 2500, "new_price": 1800}
  status          TEXT DEFAULT 'pending',                -- 'pending' | 'approved' | 'executed' | 'rejected'
  executed_at     TIMESTAMPTZ DEFAULT NULL,
  world           TEXT DEFAULT 'coiffure',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_reco_status ON nc_ai_recommendations(status) WHERE status = 'pending';
CREATE INDEX idx_ai_reco_action ON nc_ai_recommendations(action_type);
CREATE INDEX idx_ai_reco_variant ON nc_ai_recommendations(variant_id);

ALTER TABLE nc_ai_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_reco_service_all ON nc_ai_recommendations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY ai_reco_read ON nc_ai_recommendations FOR SELECT USING (true);
```

---

## Agent 2 : Campaign Engine

### nc_ai_campaigns

```sql
CREATE TABLE IF NOT EXISTS nc_ai_campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_campaign_id  TEXT,                                -- ID Meta Marketing API
  campaign_type     TEXT NOT NULL,                        -- 'retargeting' | 'new_arrival' | 'flash_sale' | 'best_seller' | 'lookalike'
  world             TEXT NOT NULL DEFAULT 'coiffure',
  status            TEXT DEFAULT 'draft',                 -- 'draft' | 'active' | 'paused' | 'completed' | 'failed'
  budget_daily_da   NUMERIC DEFAULT 0,                    -- budget quotidien en DA
  budget_spent_da   NUMERIC DEFAULT 0,
  impressions       INTEGER DEFAULT 0,
  clicks            INTEGER DEFAULT 0,
  conversions       INTEGER DEFAULT 0,
  revenue_da        NUMERIC DEFAULT 0,
  roas              NUMERIC(6,2) DEFAULT 0,
  variant_ids       TEXT[] DEFAULT '{}',                  -- produits ciblés
  ad_copy           JSONB DEFAULT '{}',                   -- textes générés par Agent 4
  audience_id       UUID,                                 -- ref nc_ai_audiences
  start_date        DATE,
  end_date          DATE,
  auto_optimized    BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_campaigns_status ON nc_ai_campaigns(status);
CREATE INDEX idx_ai_campaigns_world ON nc_ai_campaigns(world);
CREATE INDEX idx_ai_campaigns_type ON nc_ai_campaigns(campaign_type);

ALTER TABLE nc_ai_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_campaigns_service_all ON nc_ai_campaigns FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY ai_campaigns_read ON nc_ai_campaigns FOR SELECT USING (true);
```

### nc_ai_audiences

```sql
CREATE TABLE IF NOT EXISTS nc_ai_audiences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_audience_id  TEXT,                                -- ID audience Custom/Lookalike sur Meta
  audience_type     TEXT NOT NULL,                        -- 'custom_visitors' | 'custom_buyers' | 'lookalike_buyers' | 'retarget_cart' | 'retarget_view'
  world             TEXT NOT NULL DEFAULT 'coiffure',
  segment_name      TEXT NOT NULL,
  member_count      INTEGER DEFAULT 0,
  source_data       JSONB DEFAULT '{}',                   -- critères de construction
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE nc_ai_audiences ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_audiences_service_all ON nc_ai_audiences FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY ai_audiences_read ON nc_ai_audiences FOR SELECT USING (true);
```

---

## Agent 3 : Client Reactivation

### nc_ai_client_segments

```sql
CREATE TABLE IF NOT EXISTS nc_ai_client_segments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT NOT NULL,
  full_name       TEXT,
  segment         TEXT NOT NULL,    -- 'vip' | 'dormant_30' | 'dormant_60' | 'dormant_90' | 'new' | 'one_time' | 'cart_abandoner'
  world           TEXT,             -- 'coiffure' | 'onglerie' | 'both'
  total_orders    INTEGER DEFAULT 0,
  total_spent_da  NUMERIC DEFAULT 0,
  last_order_date TIMESTAMPTZ,
  avg_order_value NUMERIC DEFAULT 0,
  days_since_last INTEGER DEFAULT 0,
  wati_contact_id TEXT,             -- ID contact dans WATI
  metadata        JSONB DEFAULT '{}',
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(phone)
);

CREATE INDEX idx_ai_segments_segment ON nc_ai_client_segments(segment);
CREATE INDEX idx_ai_segments_world ON nc_ai_client_segments(world);
CREATE INDEX idx_ai_segments_days ON nc_ai_client_segments(days_since_last);

ALTER TABLE nc_ai_client_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_segments_service_all ON nc_ai_client_segments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY ai_segments_read ON nc_ai_client_segments FOR SELECT USING (true);
```

### nc_ai_whatsapp_queue

```sql
CREATE TABLE IF NOT EXISTS nc_ai_whatsapp_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT NOT NULL,
  template_name   TEXT NOT NULL,           -- nom du template WATI approuvé
  template_params JSONB DEFAULT '{}',      -- variables dynamiques du template
  flow_type       TEXT NOT NULL,           -- 'post_order' | 'post_delivery' | 'reactivation' | 'abandon_cart' | 'restock_alert' | 'cross_sell' | 'vip_offer' | 'daily_report'
  world           TEXT,
  priority        INTEGER DEFAULT 5,       -- 1 = urgent, 10 = basse
  status          TEXT DEFAULT 'queued',   -- 'queued' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed' | 'skipped'
  scheduled_at    TIMESTAMPTZ DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  wati_message_id TEXT,                    -- ID retourné par WATI
  error_message   TEXT,
  order_id        TEXT,                    -- ref commande si applicable
  variant_id      TEXT,                    -- ref produit si applicable
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_waq_status ON nc_ai_whatsapp_queue(status) WHERE status = 'queued';
CREATE INDEX idx_ai_waq_scheduled ON nc_ai_whatsapp_queue(scheduled_at);
CREATE INDEX idx_ai_waq_phone ON nc_ai_whatsapp_queue(phone);
CREATE INDEX idx_ai_waq_flow ON nc_ai_whatsapp_queue(flow_type);

ALTER TABLE nc_ai_whatsapp_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_waq_service_all ON nc_ai_whatsapp_queue FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY ai_waq_read ON nc_ai_whatsapp_queue FOR SELECT USING (true);
```

### nc_ai_whatsapp_logs

```sql
CREATE TABLE IF NOT EXISTS nc_ai_whatsapp_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id        UUID REFERENCES nc_ai_whatsapp_queue(id),
  phone           TEXT NOT NULL,
  direction       TEXT DEFAULT 'outbound', -- 'outbound' | 'inbound'
  template_name   TEXT,
  message_text    TEXT,                    -- texte envoyé ou reçu
  wati_status     TEXT,                    -- statut WATI (sent, delivered, read, failed)
  wati_message_id TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_wal_phone ON nc_ai_whatsapp_logs(phone);
CREATE INDEX idx_ai_wal_date ON nc_ai_whatsapp_logs(created_at DESC);

ALTER TABLE nc_ai_whatsapp_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_wal_service_all ON nc_ai_whatsapp_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY ai_wal_read ON nc_ai_whatsapp_logs FOR SELECT USING (true);
```

---

## Agent 4 : Content Generator

### nc_ai_content_queue

```sql
CREATE TABLE IF NOT EXISTS nc_ai_content_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type    TEXT NOT NULL,             -- 'product_description' | 'social_post' | 'ad_copy' | 'reel_script' | 'whatsapp_template' | 'banner_text' | 'seo_meta'
  world           TEXT DEFAULT 'coiffure',
  variant_id      TEXT,                      -- produit associé (si applicable)
  title           TEXT,
  body_ar         TEXT,                      -- contenu en arabe
  body_fr         TEXT,                      -- contenu en français
  media_urls      TEXT[] DEFAULT '{}',       -- images/vidéos associées
  hashtags        TEXT[] DEFAULT '{}',
  cta             TEXT,                      -- call to action
  status          TEXT DEFAULT 'draft',      -- 'draft' | 'approved' | 'published' | 'rejected'
  scheduled_at    TIMESTAMPTZ,               -- date de publication prévue
  published_at    TIMESTAMPTZ,
  platform        TEXT,                      -- 'instagram' | 'facebook' | 'tiktok' | 'whatsapp' | 'boutique'
  engagement      JSONB DEFAULT '{}',        -- likes, shares, comments (sync externe)
  llm_model       TEXT,                      -- modèle utilisé pour la génération
  prompt_used     TEXT,                      -- prompt qui a généré ce contenu
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_content_status ON nc_ai_content_queue(status);
CREATE INDEX idx_ai_content_type ON nc_ai_content_queue(content_type);
CREATE INDEX idx_ai_content_scheduled ON nc_ai_content_queue(scheduled_at) WHERE status = 'approved';

ALTER TABLE nc_ai_content_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_content_service_all ON nc_ai_content_queue FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY ai_content_read ON nc_ai_content_queue FOR SELECT USING (true);
```

### nc_ai_content_templates

```sql
CREATE TABLE IF NOT EXISTS nc_ai_content_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key    TEXT UNIQUE NOT NULL,       -- 'product_desc_coiffure' | 'social_new_arrival' | etc.
  content_type    TEXT NOT NULL,
  prompt_system   TEXT NOT NULL,              -- system prompt pour le LLM
  prompt_user     TEXT NOT NULL,              -- user prompt template (avec {{variables}})
  variables       TEXT[] DEFAULT '{}',        -- liste des variables attendues
  world           TEXT,
  language        TEXT DEFAULT 'ar',          -- 'ar' | 'fr' | 'ar_dz' (dialectal algérien)
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE nc_ai_content_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_templates_service_all ON nc_ai_content_templates FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY ai_templates_read ON nc_ai_content_templates FOR SELECT USING (true);
```

---

## Agent 5 : Stock Optimizer

### nc_ai_demand_forecast

```sql
CREATE TABLE IF NOT EXISTS nc_ai_demand_forecast (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id      TEXT NOT NULL,
  forecast_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  demand_30d      INTEGER DEFAULT 0,         -- prévision ventes 30 jours
  demand_60d      INTEGER DEFAULT 0,
  demand_90d      INTEGER DEFAULT 0,
  confidence      NUMERIC(3,2) DEFAULT 0.5,  -- 0.0-1.0
  trend           TEXT DEFAULT 'stable',     -- 'rising' | 'stable' | 'declining' | 'seasonal'
  seasonal_factor TEXT,                      -- 'ramadan' | 'rentree' | 'ete' | null
  current_stock   INTEGER DEFAULT 0,
  reorder_point   INTEGER DEFAULT 0,         -- seuil de réapprovisionnement recommandé
  reorder_qty     INTEGER DEFAULT 0,         -- quantité à commander
  world           TEXT DEFAULT 'coiffure',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(variant_id, forecast_date)
);

CREATE INDEX idx_ai_forecast_date ON nc_ai_demand_forecast(forecast_date DESC);
CREATE INDEX idx_ai_forecast_reorder ON nc_ai_demand_forecast(current_stock, reorder_point)
  WHERE current_stock <= reorder_point;

ALTER TABLE nc_ai_demand_forecast ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_forecast_service_all ON nc_ai_demand_forecast FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY ai_forecast_read ON nc_ai_demand_forecast FOR SELECT USING (true);
```

### nc_ai_stock_alerts

```sql
CREATE TABLE IF NOT EXISTS nc_ai_stock_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id      TEXT NOT NULL,
  alert_type      TEXT NOT NULL,              -- 'low_stock' | 'out_of_stock' | 'dead_stock' | 'overstock' | 'reorder_now'
  severity        TEXT DEFAULT 'medium',      -- 'critical' | 'high' | 'medium' | 'low'
  message         TEXT NOT NULL,
  current_stock   INTEGER,
  threshold       INTEGER,
  suggested_action TEXT,                      -- 'reorder' | 'promote' | 'liquidate' | 'bundle'
  acknowledged     BOOLEAN DEFAULT FALSE,
  acknowledged_at  TIMESTAMPTZ,
  world           TEXT DEFAULT 'coiffure',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_alerts_ack ON nc_ai_stock_alerts(acknowledged) WHERE acknowledged = FALSE;
CREATE INDEX idx_ai_alerts_severity ON nc_ai_stock_alerts(severity);

ALTER TABLE nc_ai_stock_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_alerts_service_all ON nc_ai_stock_alerts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY ai_alerts_read ON nc_ai_stock_alerts FOR SELECT USING (true);
```

---

## Agent 6 : Analytics Commander

### nc_ai_daily_reports

```sql
CREATE TABLE IF NOT EXISTS nc_ai_daily_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  report_type     TEXT DEFAULT 'daily',       -- 'daily' | 'weekly' | 'monthly'
  health_score    INTEGER DEFAULT 0,          -- 0-100
  kpis            JSONB NOT NULL DEFAULT '{}',
  -- KPIs structure:
  -- {
  --   revenue_da: number,
  --   orders_count: number,
  --   avg_order_value: number,
  --   conversion_rate: number,
  --   new_customers: number,
  --   reactivated_customers: number,
  --   cart_abandonment_rate: number,
  --   top_products: [{variant_id, title, sales, revenue}],
  --   world_split: {coiffure: number, onglerie: number},
  --   campaigns_active: number,
  --   campaigns_roas: number,
  --   whatsapp_sent: number,
  --   whatsapp_replied: number,
  --   content_published: number,
  --   stock_alerts_critical: number
  -- }
  insights        TEXT[] DEFAULT '{}',        -- insights en français générés par l'IA
  actions_taken   JSONB DEFAULT '[]',         -- actions automatiques exécutées
  sent_via        TEXT,                       -- 'whatsapp' | 'dashboard' | null
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_date, report_type)
);

ALTER TABLE nc_ai_daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_reports_service_all ON nc_ai_daily_reports FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY ai_reports_read ON nc_ai_daily_reports FOR SELECT USING (true);
```

### nc_ai_decisions_log

```sql
CREATE TABLE IF NOT EXISTS nc_ai_decisions_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent           TEXT NOT NULL,               -- 'catalog' | 'campaign' | 'reactivation' | 'content' | 'stock' | 'commander'
  decision_type   TEXT NOT NULL,               -- 'pause_campaign' | 'send_reactivation' | 'create_promo' | 'alert_stock' | 'generate_content' | etc.
  description     TEXT NOT NULL,               -- explication humaine de la décision
  input_data      JSONB DEFAULT '{}',          -- données qui ont mené à cette décision
  output_data     JSONB DEFAULT '{}',          -- résultat de l'action
  impact          TEXT,                        -- 'high' | 'medium' | 'low'
  success         BOOLEAN DEFAULT TRUE,
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_decisions_agent ON nc_ai_decisions_log(agent);
CREATE INDEX idx_ai_decisions_date ON nc_ai_decisions_log(created_at DESC);
CREATE INDEX idx_ai_decisions_type ON nc_ai_decisions_log(decision_type);

ALTER TABLE nc_ai_decisions_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_decisions_service_all ON nc_ai_decisions_log FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY ai_decisions_read ON nc_ai_decisions_log FOR SELECT USING (true);
```

---

## Script d'exécution complet

```sql
-- ════════════════════════════════════════════════════════
-- NajmCoiff AI Marketing Machine — DDL complet
-- Exécuter dans Supabase SQL Editor en une seule fois
-- ════════════════════════════════════════════════════════

-- Agent 1
-- (copier le CREATE TABLE nc_ai_product_scores ci-dessus)
-- (copier le CREATE TABLE nc_ai_recommendations ci-dessus)

-- Agent 2
-- (copier le CREATE TABLE nc_ai_campaigns ci-dessus)
-- (copier le CREATE TABLE nc_ai_audiences ci-dessus)

-- Agent 3
-- (copier le CREATE TABLE nc_ai_client_segments ci-dessus)
-- (copier le CREATE TABLE nc_ai_whatsapp_queue ci-dessus)
-- (copier le CREATE TABLE nc_ai_whatsapp_logs ci-dessus)

-- Agent 4
-- (copier le CREATE TABLE nc_ai_content_queue ci-dessus)
-- (copier le CREATE TABLE nc_ai_content_templates ci-dessus)

-- Agent 5
-- (copier le CREATE TABLE nc_ai_demand_forecast ci-dessus)
-- (copier le CREATE TABLE nc_ai_stock_alerts ci-dessus)

-- Agent 6
-- (copier le CREATE TABLE nc_ai_daily_reports ci-dessus)
-- (copier le CREATE TABLE nc_ai_decisions_log ci-dessus)

-- Vérification
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'nc_ai_%'
ORDER BY table_name;
```
