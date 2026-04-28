# nc-boutique — NajmCoiff Boutique Publique

> Lire `../AGENTS.md` pour le contexte global et les accès API.

## Stack
- Next.js 16, React 19, Tailwind 4
- Supabase (@supabase/supabase-js) — tables : nc_orders, nc_variants, nc_page_events, nc_customers, nc_carts
- Playwright e2e (Mobile Chrome 375px + Desktop Chrome)
- Vercel (projet séparé : prj_EoJJHWnBxmXlB1VJIJvVERG4Iu5b)

## Structure
- `app/` — pages Next.js (App Router)
- `app/api/boutique/` — routes API publiques (products, order, track, auth...)
- `components/` — Header, Footer, CartDrawer, ProductCard, FloatingCart...
- `lib/` — supabase.js, cart.js, track.js, utils.js, customer-auth.js
- `tests/e2e/` — 15 specs Playwright

## Commandes importantes
- Dev : `npm run dev -- --port 3001`
- Tests : `npx playwright test --reporter=list`
- Build : `npm run build`
- Deploy : `npx vercel --prod --yes`

## Règles absolues
- 0 Shopify — tout passe par Supabase (nc_*)
- Jamais de secrets dans le code → variables Vercel uniquement
- Tester avec Playwright AVANT de déclarer une tâche terminée
- Vérifier Supabase après chaque action UI dans les tests
- `order_source = 'nc_boutique'` pour toutes les commandes boutique
