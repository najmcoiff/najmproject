-- ═══════════════════════════════════════════════════════════════
-- SQL à exécuter dans l'éditeur SQL Supabase (Semaine 6)
-- ═══════════════════════════════════════════════════════════════

-- 1. Table nc_partenaires (codes partenaires, remplace feuille CODE_PROMO)
CREATE TABLE IF NOT EXISTS nc_partenaires (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  nom         text,
  percentage  numeric DEFAULT 50,
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  created_by  text
);

-- RLS : lecture libre, écriture via service key uniquement
ALTER TABLE nc_partenaires ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_partenaires" ON nc_partenaires
  FOR SELECT USING (true);
CREATE POLICY "write_service_only" ON nc_partenaires
  FOR ALL USING (auth.role() = 'service_role');
