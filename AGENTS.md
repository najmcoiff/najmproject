# NajmCoiff — Guide Agent IA (V4 — Phase M5 Marketing IA active)

> Fichier technique pour l'IA. Pour la version humaine en français simple : voir `JOURNAL.md`.
>
> ⚡ **Phase M5 active** — Agents IA marketing opérationnels. Meta Ads + WhatsApp WATI configurés.

---

## PROTOCOLE DE SESSION OBLIGATOIRE

Chaque session de travail avec l'IA suit cet ordre :

```
1. CHARGER   → Lire JOURNAL.md (résumé express français)
2. LIRE      → Lire TACHES.md (tâches en attente)
3. CONSULTER → Lire la doc concernée (docs/boutique/PLAN.md, docs/regles.md, docs/glossaire.md)
4. EXÉCUTER  → Faire le travail demandé
5. DÉPLOYER  → OBLIGATOIRE après toute modification de code (autorisation permanente — PAS besoin de demander) :
               • dashboard (anciennement vercel-quick) → cd dashboard && npx vercel --prod --yes
               • boutique  (anciennement nc-boutique)  → cd boutique  && npx vercel --prod --yes
               ⛔ GAS supprimé — ne plus utiliser clasp
6. TESTER    → OBLIGATOIRE pour chaque tâche touchant du code :
               • cd dashboard && npx playwright test --reporter=list
               • cd boutique  && npx playwright test --reporter=list
               • node scripts/health-check.js
               ⚠️ RÈGLES PLAYWRIGHT HUMAIN (non négociables) :
                 - Écrire/étendre le test Playwright AVANT de marquer DONE
                 - Simuler un vrai humain : goto → click → keyboard.type → waitForTimeout
                 - Vérifier la DB APRÈS l'action UI via Supabase API
                 - 0 test échoué = condition NÉCESSAIRE pour marquer DONE
7. METTRE À JOUR → JOURNAL.md (français) + TACHES.md (statut)
8. NOTIFIER  → powershell -ExecutionPolicy Bypass -File scripts\notify.ps1
```

**Jamais de code sans avoir lu la doc.**
**Jamais de tâche "terminée" sans déploiement effectif.**
**Autorisation de déployer PERMANENTE — voir secrets/README.md.**
**Étape 8 (notifier) OBLIGATOIRE à la fin de chaque réponse complète.**

---

## ACCÈS API MARKETING (PERMANENT — mémoriser pour toutes les sessions)

### Meta Marketing API
```
Business Manager ID    : 301096122408704
Ad Account ID          : act_880775160439589
System User ID         : 122096713976691856
Pixel Coiffure         : 1436593504886973
Pixel Onglerie         : 839178319213103
FB Page ID (NAJMCOIFF) : 108762367616665
IG Account (@najm_coiff): 17841442358614439
Catalogue ID           : 1598091401402032
META_MARKETING_TOKEN   : Variable Vercel → getEnv("META_MARKETING_TOKEN")
META_AD_ACCOUNT_ID     : Variable Vercel → act_880775160439589
META_APP_ID            : 3650763411728600
API version            : v21.0
Endpoint               : https://graph.facebook.com/v21.0/
```

**Product Sets catalogue (créés) :**
```
NajmCoiff Coiffure : 2007325089858160
NajmCoiff Onglerie : 1491537002645728
```

**Audiences créées (IDs stables) :**
```
Custom Clients          : 120245469075640520  (566 contacts SHA-256)
Lookalike 1% DZ         : 120245471392660520  (~300k profils)
Retargeting Coiffure 7j : 120245471426530520
Retargeting Coiffure 30j: 120245471426750520
Retargeting Onglerie 7j : 120245471426950520
Retargeting Onglerie 30j: 120245471427000520
```

### WATI WhatsApp API
```
WATI_URL    : https://live-mt-server.wati.io/10113367
WATI_TOKEN  : Variable Vercel → getEnv("WATI_API_TOKEN")
wabaId      : 1707034187331243
Tenant ID   : 10113367
Owner Phone : +213542186574
```

**Templates v2 (statut Meta) :**
```
najm_order_v2     → 968304442329443
najm_delivery_v2  → 961947683463668
najm_react30_v2   → 1657564345575982
najm_react60_v2   → 955608527374472
najm_cart_v2      → 1467869854789450
najm_vip_v2       → 1517215279934806
Codes promo : REACT30=50%, REACT60=50%, VIPGOLDEN=50% (table nc_partenaires)
```

### Vercel API
```
PROJECT dashboard (ex-vercel-quick) : prj_5l5MXmfLo25CCtEuZGAdDGBLGvXL
PROJECT boutique  (ex-nc-boutique)  : prj_EoJJHWnBxmXlB1VJIJvVERG4Iu5b
VERCEL_TOKEN : voir secrets/README.md
```

### Supabase Direct (accès SQL complet via API Management)
```
Project ID : alyxejkdtkdmluvgfnqk
PAT        : voir secrets/README.md (sbp_...)
Endpoint   : https://api.supabase.com/v1/projects/{PROJECT}/database/query
```

L'IA exécute le SQL elle-même. Ne JAMAIS demander à l'utilisateur d'exécuter du SQL.

---

## RÈGLES IA

- **0 Google Sheets** — toutes les données sont dans Supabase (`nc_*`)
- **0 GAS** — archivé définitivement (Phase M4)
- **0 Shopify** — `lib/shopify.js` supprimé, webhooks → 410
- Toutes les opérations → routes Vercel natives (`/api/...`) + Supabase direct
- Avant toute modification : lire la doc concernée
- **Déployer SYSTÉMATIQUEMENT après chaque modification** — autorisation permanente, 0 confirmation nécessaire
- **Tester avec Playwright HUMAIN** après tout déploiement — simuler un vrai utilisateur
- **0 tâche "DONE" sans 0 test échoué** — tester avant de déclarer terminé
- **boutique/** = projet Vercel séparé du **dashboard/** — ne pas mélanger
- **0 Shopify dans boutique/** — lit/écrit uniquement Supabase
- Règles complètes : voir `docs/regles.md`
- Glossaire métier + technique : `docs/glossaire.md`
- Décisions historiques : `docs/decisions.md`

---

## STRUCTURE DU PROJET

```
najmproject/
├── JOURNAL.md          ← seul fichier humain (français, lu par owner)
├── README.md           ← présentation projet 1 page
├── AGENTS.md           ← ce fichier (technique, pour IA)
├── TACHES.md           ← tâches actives uniquement
├── boutique/           ← site client public (Next.js — anciennement nc-boutique/)
├── dashboard/          ← interface agents (Next.js — anciennement vercel-quick/)
├── docs/               ← documentation technique
│   ├── regles.md       ← règles HARD/SOFT (ex-RULES.md)
│   ├── glossaire.md    ← termes métier+tech (ex-GLOSSARY.md)
│   ├── decisions.md    ← historique décisions (ex-DECISIONS.md)
│   ├── boutique/       ← PLAN, API, SCHEMA, COMPONENTS, DATA_FLOWS, ENV, TROUBLESHOOT
│   ├── dashboard/      ← ARCHITECTURE, WORKFLOW
│   ├── marketing/      ← STRATEGY, AGENTS, ROADMAP, META_ADS, WATI_INTEGRATION
│   ├── analytics/      ← BUSINESS_INTEL
│   ├── integrations/   ← ZR_EXPRESS
│   └── migration/      ← SQL setups + scripts migration
├── archive/            ← obsolète (gas, anciens MD, historique)
│   ├── historique/     ← changelog complet 2025-2026
│   ├── taches-faites/  ← phases M1-M4 terminées
│   ├── gas-obsolete/   ← Apps Script archivé
│   └── anciens-md/     ← CONTEXT, START, NEXT, PROMPT (pré-V4)
├── secrets/            ← creds.json + tokens (GITIGNORED)
├── scripts/            ← scripts d'auto (notify, health-check, migrations)
└── .github/            ← workflows CI
```

---

## TABLES SUPABASE (ne pas inventer de noms)

```
# ── Tables Dashboard ─────────────────────────────────────────────
nc_orders           → commandes (boutique + pos + Shopify archive). order_source='nc_boutique' pour boutique
nc_variants         → catalogue produits natif (images Supabase Storage)
nc_events           → tous les logs (source: Vercel | nc_boutique | WEBHOOK)
nc_gas_logs         → logs legacy (ne plus écrire)
nc_barrage          → seuils stock produits
nc_users            → agents dashboard (DISTINCT de nc_customers)
nc_suivi_zr         → suivi colis ZR Express
nc_rapports         → rapports agents
nc_po_lines         → lignes PO (po_id, variant_id, qty_add, purchase_price, sell_price, ...)
nc_gestion_fond     → transactions caisse
nc_kpi_stock        → KPI stock (achats, jamais vendus)
nc_quota            → quotas agents
nc_quota_orders     → commandes quota
nc_partenaires      → codes partenaires (code, nom, percentage, active, created_by)
nc_recettes         → recettes journalières
nc_orders_archive   → archive historique commandes (25 752+ lignes)

# ── Tables boutique ──────────────────────────────────────────────
nc_page_events      → tracking clickstream boutique (vues, paniers, UTMs)
nc_products         → catalogue produits natif (Phase 2)
nc_stock_movements  → piste d'audit mouvements stock (Phase 2)
nc_customers        → comptes clients boutique publique
nc_carts            → paniers persistés

# ── Tables Marketing IA (Phase M5) ──────────────────────────────
nc_ai_product_scores → scores santé produits (smart-sort)
nc_ai_content_queue  → contenu IA généré
nc_wati_campaigns    → campagnes WhatsApp
nc_wati_message_log  → logs envois WATI
nc_wati_templates    → templates approuvés
nc_campaign_plans    → plans Kanban war room
```

---

## ROUTES VERCEL ACTIVES

### Dashboard (dashboard/) — Phase M4
```
POST  /api/auth/login                  ← {username, password}
POST  /api/orders/online               ← {token, limit?}
POST  /api/orders/pos                  ← {token, limit?}
PATCH /api/orders/modify-items         ← {token, order_id, new_items[]}  (remplace GAS MODIFY_ORDER)
PATCH /api/orders/update-customer      ← {token, order_id, ...fields}
DEL   /api/orders/[id]                 ← {token}  (suppression + restock)
POST  /api/pos/order                   ← POS natif
POST  /api/inject/single               ← {token, order_id, ...}
POST  /api/inject/batch                ← {token, order_ids[]}
POST  /api/inject/manuel               ← {token, order_id, tracking}
POST  /api/barrage/run                 ← Supabase direct (0 Shopify)
POST  /api/cloture                     ← Supabase direct
POST  /api/po/inject                   ← (remplace GAS RUN_INJECT_PO)
POST  /api/po/lines                    ← (remplace GAS ADD_PO_LINES)
GET   /api/quota                       ← ?token=
POST  /api/webhooks/shopify            ← 410 Gone (T205)
POST  /api/webhooks/zr                 ← signature Svix ZR Express
POST  /api/gas                         ← 410 Gone (T207)

# Marketing IA (Phase M5)
POST  /api/ai/catalog-intelligence     ← Agent 1
POST  /api/ai/campaign-create          ← Agent 2 (Meta)
POST  /api/ai/whatsapp-reactivate      ← Agent 3 (WATI)
POST  /api/ai/generate-content         ← Agent 4
GET   /dashboard/owner/marketing       ← War Room
GET   /dashboard/owner/campaigns       ← Dashboard campagnes
```

### Boutique (boutique/) — routes publiques
```
GET  /api/boutique/products            ← ?category=&search=&sort=&limit=&offset=
GET  /api/boutique/products/[slug]
POST /api/boutique/order               ← {items, customer, session_id, idempotency_key, utm}
GET  /api/boutique/track/[id]          ← suivi public
POST /api/boutique/track-event         ← fire & forget
POST /api/boutique/auth/login | register
GET  /api/boutique/coupon              ← validation code partenaire
GET  /api/boutique/delivery            ← prix ZR par wilaya
GET  /api/boutique/meta-feed           ← flux Meta Catalogue XML
```

---

## FLUX RAPIDES

```
# Dashboard — Phase M4 (0 Shopify, 0 GAS)
Commande boutique → /api/boutique/order → nc_orders (order_source='nc_boutique')
Commande POS      → /api/pos/order → nc_orders (order_source='pos') + decrement_stock
Confirmation      → lib/supabase-direct.js → nc_orders PATCH
ZR Express        → /api/inject/single → ZR API → nc_suivi_zr + nc_events
Modifier commande → /api/orders/modify-items → nc_orders + increment/decrement_stock
Injection PO      → /api/po/inject → nc_po_lines → nc_variants (increment_stock)
Clôture journée   → /api/cloture → nc_orders (last=OUI) + increment_stock annulés
Barrage stock     → /api/barrage/run → nc_variants (UPDATE direct)

# Boutique
Commande boutique → /api/boutique/order → nc_orders + nc_page_events + nc_events
Catalogue         → /api/boutique/products → nc_variants (lecture seule, anon key)
Suivi             → /api/boutique/track/[id] → nc_orders + nc_suivi_zr
Tracking          → /api/boutique/track-event → nc_page_events (fire & forget)
```

---

## ACCÈS SUPABASE DIRECT (OBLIGATOIRE)

L'IA a un accès SQL **complet et direct** à Supabase via l'API Management.
**Ne jamais demander à l'utilisateur d'exécuter du SQL** — toujours le faire soi-même.

```powershell
# PowerShell (shell projet Windows)
$PAT  = "<voir secrets/README.md>"
$body = '{"query":"SELECT COUNT(*) FROM nc_variants"}'
Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/alyxejkdtkdmluvgfnqk/database/query" `
  -Method POST -Headers @{"Authorization"="Bearer $PAT";"Content-Type"="application/json"} -Body $body
```

⚠️ Guillemets PowerShell : utiliser `''` (doubles apostrophes) pour les apostrophes dans le SQL, pas `\'`.
Après chaque DDL : vérifier avec `information_schema.columns` ou `information_schema.tables`.

---

## DÉPLOIEMENT

```bash
# Dashboard (dans dashboard/)
npx vercel --prod --yes

# Boutique (dans boutique/)
npx vercel --prod --yes

# Tests
cd dashboard && npx playwright test --reporter=list
cd boutique  && npx playwright test --reporter=list
node scripts/health-check.js
```

> ⛔ GAS supprimé définitivement (Phase M4) — ne plus utiliser `clasp`

---

## VARIABLES D'ENVIRONNEMENT

### Dashboard (dashboard/)
```
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY
ZR_API_KEY
ZR_TENANT_ID
DASHBOARD_SECRET
META_MARKETING_TOKEN
META_AD_ACCOUNT_ID
WATI_API_URL
WATI_API_TOKEN
AI_API_KEY
AI_PROVIDER=openai
AI_MODEL=gpt-4o
CRON_SECRET
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
```

### Boutique (boutique/)
```
NEXT_PUBLIC_SUPABASE_URL       (même valeur que dashboard)
NEXT_PUBLIC_SUPABASE_ANON_KEY  (même valeur)
SUPABASE_SERVICE_ROLE_KEY      (même valeur)
BOUTIQUE_SECRET                (token inter-services)
ZR_API_KEY                     (même valeur)
META_PIXEL_COIFFURE=1436593504886973
META_PIXEL_ONGLERIE=839178319213103
META_CAPI_TOKEN
```

---

## ROLLBACK D'URGENCE

```bash
# Dashboard
cd dashboard && npx vercel rollback --yes

# Boutique
cd boutique && npx vercel rollback --yes
```

Ou via interface Vercel : Dashboard → projet → Deployments → version précédente → "Promote to Production".

### Critères pour déclencher un rollback
- Page blanche ou erreur 500 sur boutique ou dashboard
- `npx playwright test` retourne > 2 échecs sur tests critiques
- Commandes impossibles à créer (POST /api/boutique/order échoue)
- Stock en négatif dans nc_variants

---

## GUIDE DÉMARRAGE SESSION (pour le propriétaire)

> Pour la version simplifiée pas-à-pas en français : voir `JOURNAL.md`.

### En 3 étapes

**1.** Ouvrir le terminal Cursor.

**2.** Lancer :
```powershell
.\scripts\session-start.ps1
```

**3.** Taper dans le chat Cursor :
```
continue
```

L'IA lit JOURNAL.md, voit où on en est, enchaîne tout seule. Tu n'as rien à valider entre les étapes.
