# DECISIONS — NajmCoiff
> version: 1.0 | updated: 2026-04-11
> Toute décision technique ou business importante est documentée ici.
> Format : Date | Décision | Pourquoi | Alternative rejetée

---

## 2026-04-11 — Session initiale architecture

| Date | Décision | Pourquoi | Alternative rejetée |
|---|---|---|---|
| 2026-04-11 | Stack nc-boutique = Next.js + Tailwind + Supabase (identique au dashboard) | Cohérence totale, zéro nouvel outil, même infrastructure | Vue.js, SvelteKit |
| 2026-04-11 | nc-boutique = projet Vercel **séparé** du dashboard | Audiences différentes (public vs agents), déploiements indépendants, rollback simple | Tout dans vercel-quick sous `/boutique/*` |
| 2026-04-11 | `nc_page_events` table dédiée au tracking (séparée de `nc_events`) | Volume et objectif différents (marketing vs opérationnel) | Réutiliser `nc_events` pour tout |
| 2026-04-11 | Paiement COD uniquement (paiement à la livraison) | Seul mode viable en Algérie, simplifie le MVP | Paiement en ligne (Stripe, CIB) |
| 2026-04-11 | `nc_variants` comme source catalogue Phase 1 (pas `nc_products`) | Livraison rapide, 0 migration, données déjà peuplées | Créer `nc_products` immédiatement |
| 2026-04-11 | `ORDER_PLACED` collecté côté **serveur** | Fiabilité 100% (non bloquable par adblockers) | Tracking purement client |
| 2026-04-11 | Session tracking via localStorage (pas de cookie) | RGPD simplifié, pas de bandeau cookie | Cookies de session |
| 2026-04-11 | Clé anon Supabase format `eyJ...` (JWT) obligatoire | Format `sb_publishable_` non supporté par supabase-js v2 | Clé publishable |
| 2026-04-11 | `dynamic = 'force-dynamic'` sur les routes API boutique | Évite l'erreur de rendu statique Next.js sur routes dynamiques | Laisser Next.js décider |

---

## 2026-04-11 — Session documentation Rounds 1, 2, 3

| Date | Décision | Pourquoi | Alternative rejetée |
|---|---|---|---|
| 2026-04-11 | **Deux mondes séparés** : Coiffure + Onglerie | Deux niches distinctes, audiences complètement différentes | Un seul catalogue unifié |
| 2026-04-11 | Fond boutique = **noir uni** (pas de motif répétitif) | Plus propre, plus rapide, plus premium que Shopify actuel | Fond avec motif outils coiffure |
| 2026-04-11 | Page de choix Coiffure/Onglerie à **chaque visite** | Décision UX du propriétaire | Mémoriser le choix (sessionStorage) |
| 2026-04-11 | Interface boutique en **arabe RTL**, noms produits en **français LTR** | Compromis langue/lisibilité produits | Tout en arabe ou tout en français |
| 2026-04-11 | **Migration Shopify = sortie définitive** (pas progressive) | Décision propriétaire — zéro dépendance à terme, frais supprimés | Migration progressive avec coexistence |
| 2026-04-11 | Dashboard owner **intégré dans vercel-quick** (pas nouveau site) | Cohérence, pas de nouveau domaine, pas de nouveau déploiement | Nouveau site owner séparé |
| 2026-04-11 | **2 pixels Facebook séparés** (Coiffure + Onglerie) + server-side CAPI | Audiences distinctes, tracking le plus propre possible | Un seul pixel pour tout |
| 2026-04-11 | **Analytics propre** via `nc_events` et `nc_page_events` (pas Google Analytics) | Indépendance totale, données 100% propriétaires | Google Analytics 4 |
| 2026-04-11 | Prix livraison **domicile ≠ bureau** | ZR Express a deux tarifs distincts | Tarif unique |
| 2026-04-11 | **AWAKHIR** = nouveautés absolues (pas promotions) | Clarification du propriétaire — ce sont de nouveaux articles jamais entrés | Collection de destockage |
| 2026-04-11 | Champ code partenaire dans **le panier** (drawer) | Décision UX basée sur capture Shopify actuelle | Sur la page commander |
| 2026-04-11 | Pas de variantes produits — chaque article est **distinct et indépendant** | Simplifie la navigation pour les clients algériens | Système de variantes (taille, couleur) |
| 2026-04-11 | **Panier = drawer latéral** (slide depuis droite) | Fidèle à l'UX Shopify actuelle que les clients connaissent | Page dédiée /panier |

---

## 2026-04-12 — Session Architecture Stock complète

### Décisions techniques implémentées

| Date | Décision | Pourquoi | Alternative rejetée |
|---|---|---|---|
| 2026-04-12 | **Déduction stock immédiate** à la pose de commande (`POST /api/boutique/order`) via RPC `decrement_stock` avec `FOR UPDATE` | Éviter l'oversell pendant l'intervalle entre commande et snapshot GAS | Attendre le snapshot GAS (gap critique) |
| 2026-04-12 | **`GREATEST(0, stock - qty)`** dans `decrement_stock` | Stock jamais négatif en cas de race condition | Laisser aller négatif + corriger manuellement |
| 2026-04-12 | **`nc_stock_movements`** comme piste d'audit de tous les mouvements stock | Traçabilité complète (PO in, vente out, retour, ajustement) | Auditer via nc_events uniquement |
| 2026-04-12 | **POS dans vercel-quick** (`/dashboard/pos`) et non dans nc-boutique | POS = outil interne agents, nc-boutique = interface client public | Route API nc-boutique pour POS |
| 2026-04-12 | **`/api/pos/order`** = route dédiée POS (order_source='pos', confirmation_status='confirmé' direct) | Vente comptoir = déjà confirmée, pas de workflow de confirmation agent | Réutiliser /api/boutique/order avec paramètre |
| 2026-04-12 | **`/api/orders/modify-items`** = route PATCH native Supabase pour modifier les articles d'une commande nc_boutique/pos | Remplace MODIFY_ORDER → GAS → Shopify pour les commandes natives ; atomique (restore + verify + deduct) | Continuer via GAS pour toutes les commandes |
| 2026-04-12 | **`increment_stock`** RPC PostgreSQL pour restaurer le stock lors d'une modification | Symétrique à `decrement_stock`, même garantie d'atomicité via `FOR UPDATE` | UPDATE direct sans verrou |
| 2026-04-12 | **`stock_deducted` BOOLEAN** dans nc_orders | Auditer si la déduction a réussi, détecter les commandes avec stock non déduit | Vérifier uniquement via nc_stock_movements |
| 2026-04-12 | **Phase `images-to-storage`** = migration images Shopify CDN → Supabase Storage via script | Prérequis bloquant avant M4 (fermeture Shopify) — images cdn.shopify.com deviennent inaccessibles | Héberger les images sur un autre CDN externe |
| 2026-04-12 | **`sold_by` TEXT** dans nc_orders pour identifier l'agent POS | Traçabilité vente comptoir, reporting par agent | Lire l'agent depuis les métadonnées items_json |

---

### Décisions stock — réponses propriétaire requises

Les questions suivantes impactent l'implémentation future. Répondre en changeant le Statut.

| # | Question | Impact | Statut | Réponse |
|---|---|---|---|---|
| S1 | **Seuil stock alerte** : à partir de combien d'unités alerter l'agent ? (suggestion : 3) | `stock_alert_threshold` dans nc_variants, nc_barrage config | **⏳ À décider** | — |
| S2 | **Oversell policy** : si 2 clients commandent le dernier article simultanément, lequel garde sa commande ? | Logique `decrement_stock` retourne qty_after=0 si le 2e arrive ; le 2e reçoit une erreur 422 automatiquement | **✅ Décidé** | Premier arrivé premier servi — le 2e reçoit erreur 422 |
| S3 | **POS — qui l'utilise ?** Les agents vendent-ils physiquement au comptoir ? | Priorité de la page `/dashboard/pos` déployée | **⏳ À confirmer** | — |
| S4 | **Retours produits** : quand un client retourne un article, le stock remonte-t-il ? Qui valide ? | Route RETURN dans nc_stock_movements + UI validation | **⏳ À décider** | — |
| S5 | **PO après M4** : quand du stock neuf arrive après fermeture Shopify, comment l'agent le saisit ? | Remplacer GAS `RUN_INJECT_PO → Shopify` par `RUN_INJECT_PO → nc_variants directement` | **⏳ À décider avant M4** | — |
| S6 | **Un seul entrepôt ou plusieurs** dépôts ZR Express ? | Colonne `location_id` éventuelle dans nc_variants et nc_stock_movements | **⏳ À confirmer** | — |
| S7 | **Images migration timing** : migrer maintenant (pendant M2) ou juste avant M4 ? | `node scripts/migrate-shopify.js --phase=images-to-storage` prêt à lancer | **⏳ Recommandé : lancer maintenant** | — |
| S8 | **Commande minimum grossiste** : y a-t-il une quantité minimum par article sur nc-boutique ? | Champ `min_order_qty` dans nc_variants + validation dans /api/boutique/order | **⏳ À décider** | — |
| S9 | **Historique modifications** : garder seulement l'état final ou un historique complet ? | JSONB `items_history` dans nc_orders vs table dédiée `nc_order_history` | **✅ Décidé** | État final uniquement via nc_events.metadata |
| S10 | **MODIFY_ORDER GAS** après M4 : doit-on le conserver ou le remplacer entièrement par `/api/orders/modify-items` ? | GAS `MODIFY_ORDER` crée des Draft Orders Shopify qui n'existent plus après M4 | **✅ Décidé** | Remplacer par `/api/orders/modify-items` — timing = lors de M4 |

---

## 2026-04-15 — Sécurité RLS Supabase

| Date | Décision | Pourquoi | Alternative rejetée |
|---|---|---|---|
| 2026-04-15 | Activer RLS sur toutes les tables sans exception | Alerte Supabase : 9 tables publiquement accessibles — données sensibles (recettes, quotas, POS) exposées | Laisser certaines tables sans RLS "pour simplifier" |
| 2026-04-15 | `nc_collections` + `nc_communes` : policy SELECT anon autorisée | Données catalogue publiques, non sensibles, pourraient être lues directement par des clients | Bloquer l'accès anon total sur ces tables |
| 2026-04-15 | Les 7 autres tables (`nc_gas_logs`, `nc_logscript`, `nc_pos_daily_counter`, `nc_quota`, `nc_quota_orders`, `nc_recettes_v2`, `salon_reads`) : 0 policy anon | Données internes uniquement — jamais besoin d'un accès public | Créer des policies anon en lecture seule |
| 2026-04-15 | Aucun code modifié — uniquement DDL | Toutes les routes API utilisent `service_role` (bypass RLS automatique) → 0 risque de régression | Modifier les routes API pour gérer RLS manuellement |

---

## MODÈLE pour ajouter une décision

```
| YYYY-MM-DD | [La décision prise] | [Pourquoi cette décision] | [Alternative considérée et rejetée] |
```

Ajouter dans la section correspondant à la date de la session.
