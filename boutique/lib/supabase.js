import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Variables d'environnement Supabase manquantes. Vérifier NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY."
  );
}

// Client public (clé anon) — lecture catalogue, RLS active
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Client serveur (service role) — writes sécurisés, bypass RLS
// Utilisé uniquement dans les routes API (server-side), jamais côté client
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "Variable d'environnement SUPABASE_SERVICE_ROLE_KEY manquante."
    );
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
}
