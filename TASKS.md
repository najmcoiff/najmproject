# TASKS — NajmCoiff
> version: 3.3 | updated: 2026-04-15
> Phase M4 terminée — 0 Shopify, 0 GAS

---

## LÉGENDE

| Priorité | Signification |
|---|---|
| 🔴 CRITIQUE | Bloque le lancement ou cause des erreurs actives |
| 🟠 HAUT | Fonctionnalité manquante importante |
| 🟡 MOYEN | Amélioration significative |
| 🟢 BAS | Cosmétique ou futur |

| Statut | |
|---|---|
| `TODO` | Non commencé |
| `IN_PROGRESS` | En cours |
| `DONE` | Terminé |
| `BLOCKED` | Bloqué (préciser pourquoi) |

| Domaine | Code couleur |
|---|---|
| 📊 BI / Analytics | Business Intelligence opérationnelle |
| 🤖 Marketing IA | Agents automatisés (campagnes, WhatsApp, contenu) |
| 🖥️ Dashboard | vercel-quick — interface agents + owner |
| 🛒 Boutique | nc-boutique — site public clients |
| ⚙️ Infra | Base de données, déploiement, configuration |

---

## 🔴 TÂCHES ACTIVES (TODO / IN_PROGRESS)

> Trier par priorité et domaine. L'IA choisit la prochaine tâche 🔴 ou 🟠.

### 📊 BI / Analytics — `docs/analytics/BUSINESS_INTEL.md`

> ✅ V3 déployée : objectif BÉNÉFICE 250k DA (plus CA), POS fixé (order_date backfillé), taux livraison = livré/confirmé, ZR récupérable temps réel, boutique/POS séparés, decision_status='modifier' = confirmé.
> 🔗 Accès : https://najmcoiffdashboard.vercel.app/dashboard/owner/bi

### 🤖 Marketing IA — `docs/marketing/STRATEGY.md` + `docs/marketing/AGENTS.md`

> ✅ Code implémenté : 12 routes `/api/ai/*`, 13 tables `nc_ai_*`, page `/dashboard/owner/ai`, 8 crons `vercel.json`, composant `MetaPixel.js`, CAPI dans `track-event/route.js`.
> ⏳ Ce qui reste = **activer** les agents avec les vraies credentials (voir section "Données en attente").

| ID | Tâche | Priorité | Dépend de |
|---|---|---|---|
| T_MKT_ACTIVATE_AGENT1 | **Activer Agent 1 (Catalog Intelligence)** — injecter `CRON_SECRET` dans Vercel vercel-quick → déclencher manuellement `POST /api/ai/catalog-intelligence` → vérifier `nc_ai_product_scores` rempli | ✅ DONE | — |
| T_MKT_ACTIVATE_AGENT4 | **Activer Agent 4 (Contenu)** — ajouter `OPENAI_API_KEY` ou `ANTHROPIC_API_KEY` dans Vercel → tester `POST /api/ai/generate-content` → vérifier `nc_ai_content_queue` | ✅ DONE | — |
| T_MKT_ACTIVATE_AGENT3 | **Activer Agent 3 (WhatsApp Reactivation)** — ajouter `WATI_API_URL` + `WATI_API_TOKEN` dans Vercel → créer les 9 templates dans WATI dashboard → tester `POST /api/ai/whatsapp-reactivate` | ✅ DONE | T_MKT_WATI_SETUP |
| T_MKT_WATI_SETUP | **6 templates NajmCoiff créés dans WATI** via API `/api/v1/whatsApp/templates` — statut PENDING Meta (approbation 24-48h). Campaign Dashboard + Template Lab + attribution 72h built | ✅ DONE | — |
| T_MKT_CAMPAIGN_TRACKING | **Système tracking campagnes WhatsApp** — tables `nc_wati_campaigns` + `nc_wati_message_log` + `nc_wati_templates` + page `/dashboard/owner/campaigns` + Template Lab A/B | ✅ DONE | — |
| T_WATI_DASHBOARD_FIX | **Correction dashboard WhatsApp** — segments vrais totaux (13 449 dormant_90), 6 métriques (envoyés/livrés/lus/réponses/convertis/échoués), campagnes vides filtrées, barre haut séparée Meta/WA, `total_failed`+`total_cost_da` en DB, sync WATI amélioré, attribution revenue 72h, 11/11 tests Playwright ✅ | ✅ DONE | — |
| T_MKT_COUPON_MARGIN | **Codes promo 50% bénéfice** — REACT30 + REACT60 + VIPGOLDEN insérés dans nc_partenaires, calcul sur marge réelle (prix_vente - coût) × 50% | ✅ DONE | — |
| T_MKT_ACTIVATE_AGENT2 | **Agent 2 (Meta Campaigns) actif** — `META_AD_ACCOUNT_ID=act_880775160439589` + `META_MARKETING_TOKEN` + `META_PAGE_ID_COIFFURE` configurés — pixels liés au compte pub — Agent 2 testé : `created:5 campaigns` | ✅ DONE | — |
| T_MKT_PIXEL_IDS | **Pixels actifs** — `1436593504886973` (coiffure) + `839178319213103` (onglerie) créés + CAPI configuré + déployé www.najmcoiff.com | ✅ DONE | — |

| T_META_CATALOG | **Catalogue produits Meta (Dynamic Ads)** — Route `/api/boutique/meta-feed` XML paginé (500/page) depuis `nc_variants` — 14/14 tests Playwright ✅ | ✅ DONE | — |
| T_META_AUDIENCES | **Audiences Meta** — Custom Audience 566 clients hashés SHA-256 ✅ + Lookalike 1% DZ `120245471392660520` ✅ | ✅ DONE | T_META_CATALOG |
| T_META_RETARGETING | **Audiences retargeting pixel ✅ DONE** — 4 audiences visiteurs site (coiffure/onglerie × 7j/30j) — créées ✅ après acceptation TOS Meta | ✅ DONE | T_META_AUDIENCES |
| T_AGENT2_COMPLETE | **Agent 2 complet** — `/api/ai/campaign-create` : Campagne → Ad Set (targeting) → Creative (image + texte arabe) → Ad — 5 types, 2 mondes ✅ | ✅ DONE | T_META_AUDIENCES |
| T_CAMPAIGNS_DASHBOARD | **Page dashboard campagnes Meta** — `/dashboard/owner/campaigns` : KPIs ROAS, tableau campagnes, setup Meta (catalog/feed/audiences/clients), créer campagne par type ✅ | ✅ DONE | T_AGENT2_COMPLETE |
| T_WAR_ROOM | **War Room Marketing** — `/dashboard/owner/marketing` : KPIs globaux + Kanban campagnes + Journal IA + Audiences + Workflow complet 9 étapes — table `nc_campaign_plans` + route `/api/marketing/campaigns` — AGENTS.md V3.0 avec accès Meta + WATI explicites | ✅ DONE | — |

### 🖥️ Dashboard — `docs/dashboard/ARCHITECTURE.md`

| ID | Tâche | Priorité | Dépend de |
|---|---|---|---|
| T209 | **Fermeture définitive Shopify** — 0 appel API Shopify actif confirmé, colonnes `shopify_*` = données historiques uniquement, route `/api/webhooks/shopify` → 410 Gone | ✅ DONE | Annuler abonnement Shopify manuellement (action owner) |
| T_DISC_UNREAD | **Badges non-lus Discussions (style WhatsApp)** — `salon_reads` table + badges verts par salon + canal RT global | ✅ DONE | — |
| T_FORMATION_UPDATE | **Mettre à jour page Formation** — 2 nouvelles sections ajoutées : BI Dashboard + Campagnes WhatsApp — badge V4.86 — 10/10 tests green | ✅ DONE | — |
| T_NAV_CLEANUP | **Allègement navigation dashboard** — Stock + Collections + War Room + Campagnes + Utilisateurs retirés du menu principal → déplacés dans Espace Owner. Documentation supprimée du menu Owner. 7/7 tests Playwright green | ✅ DONE | — |
| T_NAV_ACCESS | **Correction accès pages critiques** — Stock + Collections remis dans nav principal (tous agents). Utilisateurs accessible aux chef d'équipe + owner (filtre `chefOnly`). 7/7 tests nav-cleanup green | ✅ DONE | T_NAV_CLEANUP |

### 🛒 Boutique — `docs/boutique/PLAN.md`

| ID | Tâche | Priorité | Dépend de |
|---|---|---|---|
| T116 | **Test e2e inscription client** — Playwright complet : inscription → login → vérification `nc_customers` | ✅ DONE | — |
| T_MKT_WATI_APPROVED | **Templates WATI approuvés et activés** — 6/6 APPROVED (najm_order_followup, najm_delivery_confirm, najm_reactivation_30/60, najm_cart_reminder, najm_vip_exclusive) — tests ok sur +213542186574 — agents WhatsApp actifs (reactivation + cart + post-delivery) | ✅ DONE | — |
| T_MKT_META_PIXEL | **Pixels + CAPI actifs** — 2 pixels créés par API, CAPI server-side configuré, country SHA-256 hashé, events Purchase + PageView + ViewContent → Meta Events Manager | ✅ DONE | — |
| T_MKT_META_ADS | **Meta Ads prêt** — compte pub `act_880775160439589` lié, pixels liés, Agent 2 opérationnel. | ✅ DONE | — |
| T_BI_DAILY_REPORT | **Page rapport quotidien enrichie** — top produits du jour, section WhatsApp Marketing (messages/lus/convertis/revenus), évolution J-1 (▲▼ commandes + bénéfice + CA), sources UTM, rapport WhatsApp 600 chars — 6/6 tests green | ✅ DONE | — |
| T_IMG_PERF | **Optimisation images boutique** — Next.js Image + WebP/AVIF + priority LCP + lazy hors-fold | ✅ DONE | — |

---

## ⛔ DONNÉES EN ATTENTE (actions propriétaire — bloquent certaines tâches)

> Ces éléments ne peuvent pas être faits par l'IA. C'est toi qui dois les fournir.

| Donnée | Bloque | Où la trouver |
|---|---|---|
| `WATI_API_URL` + `WATI_API_TOKEN` | T_MKT_WATI_SETUP, T_MKT_ACTIVATE_AGENT3 | Tableau de bord WATI → Settings → API Access |
| `OPENAI_API_KEY` ou `ANTHROPIC_API_KEY` | T_MKT_ACTIVATE_AGENT4 | platform.openai.com → API keys **ou** console.anthropic.com |
| `META_AD_ACCOUNT_ID` | T_MKT_ACTIVATE_AGENT2, T_MKT_META_ADS | ~~Token System User : ✅ configuré~~ / ~~Pixels : ✅ créés (coiffure: 1436593504886973, onglerie: 839178319213103)~~ / **RESTE : lier compte pub au BM `301096122408704`** → https://business.facebook.com/settings/ad-accounts?business_id=301096122408704 |
| ~~`CRON_SECRET`~~ | ~~T_MKT_ACTIVATE_AGENT1~~ | ✅ **Généré et injecté automatiquement** — `m5KjAbNWudGHFcZpY4heMtJrz2wskq3D` |
| ~~`OPENAI_API_KEY`~~ | ~~T_MKT_ACTIVATE_AGENT4~~ | ✅ **Déjà en Vercel** — nettoyé + `AI_API_KEY` + `AI_PROVIDER=openai` + `AI_MODEL=gpt-4o` ajoutés |
| ~~`WATI_API_URL` + `WATI_API_TOKEN`~~ | ~~T_MKT_ACTIVATE_AGENT3~~ | ✅ **Déjà en Vercel** — nettoyés + header `Bearer` corrigé |
| Dette fournisseur initiale (en DA) | T_BI_CONFIG | Toi seul connais ce chiffre → saisir dans la page Config BI une fois T_BI_PAGE terminé |

---

## ✅ TÂCHES TERMINÉES — Voir CHANGELOG.md pour le détail complet

> Les tâches DONE sont archivées dans CHANGELOG.md par version.
> Ce fichier ne liste que les tâches actives pour garder le focus.

| Phase | Période | Nb tâches | Résumé |
|---|---|---|---|
| **Fix images fiche produit** | 2026-04-15 | 1 bug critique | Vercel retournait 402 sur /_next/image → `unoptimized:true` → Supabase CDN direct — 28/28 tests green |
| **Fix delivery_mode ZR + Dashboard** | 2026-04-15 | 1 bug critique | delivery_mode affiché en confirmation/preparation + ZR inject pickup-point/home correct — 5/5 tests green |
| **Mobile Bugs (Finance + Stock)** | 2026-04-15 | 2 bugs | Finance : erreur `verified` supprimée du SELECT nc_gestion_fond. Stock/BonTab : layout `flex-col md:flex-row` — 13/13 tests MOB-11+MOB-12 green |
| **Mobile Dashboard** | 2026-04-15 | 6 pages | Correction affichage mobile : sidebar hamburger (owner + database), vue cartes catalogue, collections flex-wrap, finance flex-wrap, achats header responsive — 11/11 tests MOB-1→MOB-10 green |
| **BI / Analytics** | 2026-04-14 | 1 | `docs/analytics/BUSINESS_INTEL.md` — règles calcul, KPIs, DDL, routes spec |
| **Marketing IA** | 2026-04-14 | 14 | 7 docs marketing + 13 tables `nc_ai_*` + 12 routes agents + page `/dashboard/owner/ai` + 8 crons + MetaPixel + CAPI |
| **M4 — Fermeture GAS/Shopify** | 2026-04-13/14 | 9 | 0 Shopify, 0 GAS, routes Vercel natives (T200-T208) |
| **M3 — Stock & POS** | 2026-04-12/13 | 16 | decrement_stock, POS comptoir + mobile, barcode, modify-items |
| **M2 — Catalogue & Dashboard** | 2026-04-11/13 | 30+ | Catalogue owner, collections, upload images, quota, rapports, smart search |
| **M1 — Bootstrap boutique** | 2026-04-11/12 | 60+ | nc-boutique live, 2 mondes, commande, suivi, PWA, analytique |
