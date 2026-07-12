-- ═══════════════════════════════════════════════════════════════════════════
-- SUPABASE_AMBASSADEURS.sql
-- Programme « Ambassadeur NajmCoiff » — Couche 1 (revendeur) + fondations Couche 2
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL Supabase
--
-- Règles d'argent (marge moyenne ≈ 2 000 DA) — tu gardes TOUJOURS ≥ 40 % :
--   1.  Coiffeur achète pour lui .................... coiffeur 50 % | toi 50 %
--   1b. Coiffeur RECRUTÉ achète pour lui ........... coiffeur 40 % | parrain 20 % | toi 40 %
--   2.  Client via code coiffeur (1ʳᵉ) ............. client express | coiffeur 50 % | toi 50 %
--   3.  Client rachète sans code ................... coiffeur 20 % (rente) | toi 80 %
--   4.  Ambassadeur-client via son code ............ client 40 % | parrain 20 % | toi 40 %
-- La rente (moteur de croissance) est protégée ; c'est la remise perso qui flex (cas 1b).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Table nc_ambassadeurs ──────────────────────────────────────────────
-- Un ambassadeur = un coiffeur (ou un client devenu ambassadeur) avec son code perso.
CREATE TABLE IF NOT EXISTS nc_ambassadeurs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT UNIQUE NOT NULL,               -- code perso, ex. KARIM-2100
  phone          TEXT UNIQUE NOT NULL,               -- identité (9 derniers chiffres normalisés à l'appli)
  full_name      TEXT,
  type           TEXT NOT NULL DEFAULT 'coiffeur',   -- 'coiffeur' | 'client_ambassadeur'
  -- Couche 2 : qui a recruté cet ambassadeur (NULL = onboardé en direct / racine)
  parrain_code   TEXT,
  parrain_phone  TEXT,
  -- Gamification (effet cumulatif côté coiffeur)
  grade          TEXT NOT NULL DEFAULT 'bronze',     -- bronze | argent | or
  cagnotte_da    NUMERIC NOT NULL DEFAULT 0,         -- solde disponible (récompenses débloquées)
  cagnotte_attente_da NUMERIC NOT NULL DEFAULT 0,    -- en attente (COD pas encore payé)
  total_filleuls INTEGER NOT NULL DEFAULT 0,         -- nb de personnes ramenées (cumul)
  actif          BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ambassadeurs_phone   ON nc_ambassadeurs (phone);
CREATE INDEX IF NOT EXISTS idx_ambassadeurs_parrain ON nc_ambassadeurs (parrain_phone);

-- ─── 2. Table nc_ambassadeur_liens ─────────────────────────────────────────
-- Attribution GRAVÉE une fois : quel filleul appartient à quel ambassadeur.
-- Le filleul n'a jamais à retaper le code : le lien vit ici, par téléphone.
CREATE TABLE IF NOT EXISTS nc_ambassadeur_liens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassadeur_code    TEXT NOT NULL,
  ambassadeur_phone   TEXT NOT NULL,
  filleul_phone       TEXT UNIQUE NOT NULL,          -- 1 filleul = 1 seul parrain, à vie
  filleul_type        TEXT NOT NULL DEFAULT 'client',-- 'client' | 'coiffeur'
  premiere_order_id   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_liens_ambassadeur ON nc_ambassadeur_liens (ambassadeur_phone);
CREATE INDEX IF NOT EXISTS idx_liens_filleul     ON nc_ambassadeur_liens (filleul_phone);

-- ─── 3. Table nc_ambassadeur_commissions ───────────────────────────────────
-- Grand livre : chaque gain (vente directe ou rente), débloqué après COD payé.
CREATE TABLE IF NOT EXISTS nc_ambassadeur_commissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassadeur_code  TEXT NOT NULL,
  ambassadeur_phone TEXT NOT NULL,
  order_id          TEXT NOT NULL,
  filleul_phone     TEXT,
  scenario          TEXT NOT NULL,                   -- '2_vente_directe' | '3_rente_sans_code' | '4_rente_ambassadeur' | '1b_...'
  marge_da          NUMERIC NOT NULL DEFAULT 0,      -- marge de la commande (INTERNE — jamais affichée au coiffeur)
  taux_pct          NUMERIC NOT NULL DEFAULT 0,      -- % appliqué (INTERNE)
  montant_da        NUMERIC NOT NULL DEFAULT 0,      -- ce que gagne l'ambassadeur (SEUL chiffre affiché)
  statut            TEXT NOT NULL DEFAULT 'en_attente', -- en_attente | valide | annule
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at      TIMESTAMPTZ,
  UNIQUE (order_id, ambassadeur_phone, scenario)     -- anti-doublon : 1 commission par commande/ambassadeur/scénario
);

CREATE INDEX IF NOT EXISTS idx_commissions_ambassadeur ON nc_ambassadeur_commissions (ambassadeur_phone);
CREATE INDEX IF NOT EXISTS idx_commissions_order        ON nc_ambassadeur_commissions (order_id);
CREATE INDEX IF NOT EXISTS idx_commissions_statut       ON nc_ambassadeur_commissions (statut);

-- ─── 4. Colonnes d'attribution sur nc_orders ───────────────────────────────
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS ambassadeur_code  TEXT;   -- code utilisé sur la commande
ALTER TABLE nc_orders ADD COLUMN IF NOT EXISTS ambassadeur_phone TEXT;   -- parrain résolu (via code OU attribution tel)

CREATE INDEX IF NOT EXISTS idx_orders_ambassadeur ON nc_orders (ambassadeur_phone);

-- ─── 5. RLS : lecture publique du strict nécessaire, écriture service_role ──
ALTER TABLE nc_ambassadeurs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE nc_ambassadeur_liens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE nc_ambassadeur_commissions  ENABLE ROW LEVEL SECURITY;

-- nc_ambassadeurs : lecture publique (validation d'un code côté boutique), écriture service
DROP POLICY IF EXISTS "amb_read_all"      ON nc_ambassadeurs;
DROP POLICY IF EXISTS "amb_write_service" ON nc_ambassadeurs;
CREATE POLICY "amb_read_all"      ON nc_ambassadeurs FOR SELECT USING (true);
CREATE POLICY "amb_write_service" ON nc_ambassadeurs FOR ALL USING (auth.role() = 'service_role');

-- liens + commissions : service_role uniquement (données sensibles)
DROP POLICY IF EXISTS "liens_service" ON nc_ambassadeur_liens;
CREATE POLICY "liens_service" ON nc_ambassadeur_liens FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "comm_service" ON nc_ambassadeur_commissions;
CREATE POLICY "comm_service" ON nc_ambassadeur_commissions FOR ALL USING (auth.role() = 'service_role');

-- ─── 6. RPC : créditer la cagnotte quand une commission passe 'valide' ──────
-- Appelée quand une commande ambassadeur est confirmée + payée (COD).
CREATE OR REPLACE FUNCTION valider_commission(p_commission_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  c nc_ambassadeur_commissions%ROWTYPE;
BEGIN
  SELECT * INTO c FROM nc_ambassadeur_commissions
  WHERE id = p_commission_id AND statut = 'en_attente'
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE nc_ambassadeur_commissions
  SET statut = 'valide', validated_at = now()
  WHERE id = p_commission_id;

  UPDATE nc_ambassadeurs
  SET cagnotte_da         = cagnotte_da + c.montant_da,
      cagnotte_attente_da = GREATEST(0, cagnotte_attente_da - c.montant_da),
      updated_at          = now()
  WHERE phone = c.ambassadeur_phone;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN — après exécution, vérifier :  SELECT * FROM nc_ambassadeurs LIMIT 1;
-- ═══════════════════════════════════════════════════════════════════════════
