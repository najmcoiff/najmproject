# TROUBLESHOOT.md — Erreurs connues et solutions
> version: 1.0 | updated: 2026-04-11
> Chercher ici en premier avant de déboguer de zéro.

---

## ERREURS RÉSOLUES

### [RÉSOLU] Erreur de rendu statique Next.js
**Message :** `Error: Dynamic server usage: Route /api/boutique/products couldn't be rendered statically because it used request.url`
**Cause :** Next.js tente de pré-rendre les routes API en statique.
**Solution :** Ajouter en haut de chaque fichier route.js :
```js
export const dynamic = "force-dynamic";
```
**Fichiers concernés :** Toutes les routes dans `nc-boutique/app/api/`

---

### [RÉSOLU] useSearchParams() Suspense Error
**Message :** `useSearchParams() should be wrapped in a suspense boundary at page "/suivi"`
**Cause :** `useSearchParams()` doit être dans un composant enfant enveloppé par `<Suspense>`.
**Solution :**
```jsx
import { Suspense } from "react";
export default function SuiviPage() {
  return (
    <Suspense fallback={<div>Chargement...</div>}>
      <SuiviForm />
    </Suspense>
  );
}
```

---

### [RÉSOLU] Clé Supabase format sb_publishable_
**Message :** `Error: supabaseUrl is required` ou 500 sur toutes les routes API
**Cause :** supabase-js v2 ne supporte pas le format `sb_publishable_xxx`.
**Solution :** Utiliser la clé JWT format `eyJ...` (disponible dans Supabase Dashboard > API > Project API keys > anon public)
**Fichiers à mettre à jour :** `nc-boutique/.env.local` + variables Vercel

---

### [RÉSOLU] Colonne compare_at_price does not exist
**Message :** `{"error":"column nc_variants.compare_at_price does not exist"}`
**Cause :** La colonne `compare_at_price` n'a pas encore été ajoutée à `nc_variants` (en attente migration Shopify).
**Solution temporaire :** Ne pas sélectionner cette colonne dans les requêtes. Utiliser `image_url` et `display_name` existants.
**Solution définitive :** Exécuter `scripts/migrate-shopify.js` (T01) pour ajouter la colonne.

---

### [RÉSOLU] Vercel Missing Scope Error
**Message :** `status: "action_required", reason: "missing_scope"`
**Cause :** `npx vercel` sans scope dans un workspace multi-équipes.
**Solution :** Ajouter `--scope "najm-webs-projects"` à la commande
```bash
npx vercel --prod --yes --scope "najm-webs-projects"
```

---

## ERREURS ACTIVES (bugs ouverts)

### [RÉSOLU — T06] Fiche produit retourne 0 résultats
**Route :** `GET /api/boutique/products/[slug]`
**Symptôme :** La page produit affichait "Produit non trouvé" pour tous les produits.
**Cause :** Le filtre `.or('sku.eq.X,product_id.eq.X')` PostgREST était fragile (SKU avec tirets/points pouvait casser la syntaxe) et ne retournait qu'une seule variante quand le slug était un SKU.
**Solution appliquée (2026-04-11) :** Stratégie en 2 étapes :
  1. Résoudre le `product_id` via `product_id` direct → `variant_id` → `sku` → fallback titre
  2. Charger TOUTES les variantes actives avec ce `product_id`

---

### [RÉSOLU — T12] Route /track/[id] retourne 500
**Route :** `GET /api/boutique/track/[id]`
**Symptôme :** Erreur 500 "Erreur base de données"
**Cause :** Deux problèmes cumulés :
  1. `SELECT order_name, delivery_mode` → PostgreSQL `42703` si ces colonnes n'existent pas encore dans `nc_orders`
  2. `.throwOnError()` sur l'insert analytics `nc_events` bloquait la réponse en cas d'échec
**Solution appliquée (2026-04-11) :**
  - SELECT en 2 étapes : full select → fallback colonnes garanties si erreur 42703
  - Analytics insert converti en fire-and-forget (`.then().catch()`)
  - Ajout de `export const dynamic = "force-dynamic"` manquant
  - `order_name` fallback vers `#${order_id.slice(0,8)}` si colonne absente

---

## ERREURS FRÉQUENTES ET PRÉVENTION

### Erreur : "Variables d'environnement Supabase manquantes"
**Cause :** Déploiement Vercel sans avoir configuré les variables.
**Vérifier :** `npx vercel env ls` dans `nc-boutique/`
**Référence :** `docs/boutique/ENV.md`

---

### Erreur : Tailwind styles non appliqués
**Cause :** `globals.css` non importé dans `app/layout.js`.
**Vérifier :**
```js
// nc-boutique/app/layout.js
import './globals.css'  // doit être présent
```

---

### Erreur : Panier vide après refresh
**Cause :** CartContext ne lit pas localStorage au montage.
**Vérifier dans CartContext.js :**
```js
const [items, setItems] = useState(() => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('nc_cart');
    return saved ? JSON.parse(saved) : [];
  }
  return [];
});
```

---

### Erreur : RLS bloque une insertion (403)
**Cause :** Route API utilise la clé anon au lieu de la clé service_role pour une opération d'écriture.
**Vérifier :**
```js
// Mauvais (pour écriture)
const supabase = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
// Correct (pour écriture)
const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
```

---

## COMMANDES DE DIAGNOSTIC

```bash
# Vérifier que les variables sont configurées
cd nc-boutique
npx vercel env ls

# Tester l'API locale
curl http://localhost:3001/api/boutique/products | jq .

# Vérifier les tables Supabase (depuis Node)
node -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('nc_variants').select('count').then(r => console.log(r));
"

# Santé globale
node scripts/health-check.js
```
