# RULES — NajmCoiff
> version: 1.0 | updated: 2026-04-11

---

## RÈGLES HARD — Ne jamais violer

Ces règles sont absolues. Aucune exception, aucun contournement.

| # | Règle | Raison |
|---|---|---|
| H1 | **Toutes les données dans Supabase** — zéro Google Sheets, zéro fichier local | Source de vérité unique |
| H2 | **3 actions GAS seulement** : `MODIFY_ORDER`, `RUN_INJECT_PO`, `ADD_PO_LINES` — rien d'autre | GAS = legacy, à réduire |
| H3 | **Ne jamais modifier `vercel-quick/` pour la boutique** — ce sont deux projets séparés | Évite de casser le dashboard agents |
| H4 | **Ne jamais créer de table Supabase non documentée** — toute nouvelle table doit être dans `docs/boutique/SCHEMA.md` avant d'être créée | Traçabilité totale |
| H5 | **Doc d'abord, code ensuite** — toute fonctionnalité doit être documentée dans PLAN.md avant d'être codée | Évite l'improvisation |
| H6 | **Jamais de `compare_at_price` fictive** — si le champ n'existe pas en DB, ne pas l'inventer dans le code | Intégrité des données |
| H7 | **Les événements Coiffure et Onglerie ne se croisent jamais** — chaque pixel Facebook reçoit uniquement ses événements | Tracking propre |
| H8 | **Paiement à la livraison uniquement** — aucun système de paiement en ligne en Phase 1/2 | Décision business |
| H9 | **Chaque commande a un `idempotency_key` unique** — re-submit ne crée jamais de doublon | Intégrité commandes |
| H10 | **IP jamais stockée brute** — toujours hashée SHA-256 avant stockage dans `nc_page_events` | RGPD |
| H11 | **Stock 0 = produit invisible** — aucun produit en rupture ne s'affiche en boutique | Expérience client |
| H12 | **Ne jamais déployer sans tester** — `node scripts/test-runner.js` ou `npx playwright test` obligatoire | Qualité |
| H13 | **Zéro improvisation structurelle** — pas de nouvelle route API sans documentation préalable | Cohérence architecture |
| H14 | **`CONTROLE_TOTALE.md` ne sort jamais du repo** — fichier sensible, ne pas committer vers branches publiques | Sécurité |

---

## RÈGLES SOFT — Fortement recommandées

Ces règles peuvent avoir des exceptions justifiées et documentées.

| # | Règle | Pourquoi important |
|---|---|---|
| S1 | Utiliser `createServiceClient()` côté serveur et `supabase` (anon) côté client | Sécurité des accès |
| S2 | Chaque route API retourne `{ error: string }` avec le bon code HTTP en cas d'échec | Cohérence des réponses |
| S3 | Nommer les événements en SNAKE_CASE_MAJUSCULE (ex: `ORDER_PLACED`) | Lisibilité des logs |
| S4 | Toujours vérifier le stock avant une commande | Évite l'oversell |
| S5 | Chaque modification DB doit être loggée dans `nc_events` | Traçabilité agents |
| S6 | Les composants React > 100 lignes doivent être découpés | Maintenabilité |
| S7 | Utiliser des noms de fichiers en kebab-case pour les pages, PascalCase pour les composants | Convention Next.js |
| S8 | Mettre à jour `TASKS.md` après chaque tâche complétée | Cohérence doc |
| S9 | Mettre à jour `DECISIONS.md` pour toute décision technique importante | Historique |
| S10 | Tester sur mobile (375px) avant tout déploiement de la boutique | Cible = mobile algérien |
| S11 | Les textes boutique en arabe RTL, les noms produits en français LTR | Décision UX validée |
| S12 | Le fond boutique est noir uni (`#0a0a0a`) — pas de motif répétitif | Décision design validée |

---

## ACCÈS SUPABASE DIRECT

| Règle | |
|---|---|
| **L'IA exécute le SQL elle-même** | Ne JAMAIS écrire "exécute ce SQL dans Supabase Editor" — utiliser l'API Management directement |
| **API Management** | `POST https://api.supabase.com/v1/projects/alyxejkdtkdmluvgfnqk/database/query` avec `Bearer sbp_b875d6d5cf2859909e5b5c1ffb9fa24cc8a155ea` |
| **Vérification obligatoire** | Après tout DDL (ALTER/CREATE), vérifier avec un SELECT dans `information_schema` |
| **Guillemets PowerShell** | Utiliser `''` pour les apostrophes dans les chaînes JSON, jamais `\'` |

---

## RÈGLES SPÉCIFIQUES — Supabase

| # | Règle |
|---|---|
| SB1 | Utiliser la clé JWT (`eyJ...`) et non la clé `sb_publishable_` — incompatible avec supabase-js v2 |
| SB2 | RLS activé sur toutes les tables boutique — service key pour écriture, anon pour lecture publique |
| SB3 | Ne jamais supprimer une colonne sans vérifier toutes les routes qui l'utilisent |
| SB4 | `nc_variants` est en lecture seule depuis nc-boutique — jamais d'écriture depuis le front public |

---

## RÈGLES SPÉCIFIQUES — Déploiement

| # | Règle |
|---|---|
| D1 | Toujours déployer depuis le bon répertoire (`vercel-quick/` pour dashboard, `nc-boutique/` pour boutique) |
| D2 | Variables d'environnement configurées dans Vercel avant tout déploiement |
| D3 | Toute modification GAS = `clasp push --force` + `clasp deploy` — les deux obligatoires |
| D4 | Ne jamais déployer une migration SQL sans l'avoir testée sur une requête `SELECT` d'abord |
