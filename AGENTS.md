# NajmCoiff â€” Guide Agent IA (V3.0 â€” Phase M5 Marketing IA active)

> Lire `CONTEXT.md` d'abord (rÃ©sumÃ© express).
> Ensuite ce fichier pour les rÃ¨gles et le protocole complet.
> AccÃ¨s : `docs/CONTROLE_TOTALE.md` | Plan boutique : `docs/boutique/PLAN.md`
> War Room : `https://najmcoiffdashboard.vercel.app/dashboard/owner/marketing`
>
> âš¡ **Phase M5 active** â€” Agents IA marketing opÃ©rationnels. Meta Ads + WhatsApp WATI configurÃ©s.

---

## ACCÃˆS API MARKETING (PERMANENT â€” mÃ©moriser pour toutes les sessions)

### Meta Marketing API
```
Business Manager ID  : 301096122408704
Ad Account ID        : act_880775160439589
System User ID       : 122096713976691856
Pixel Coiffure       : 1436593504886973
Pixel Onglerie       : 839178319213103
FB Page ID (NAJMCOIFF): 108762367616665
IG Account ID (@najm_coiff): 17841442358614439
Catalogue ID         : 1598091401402032
META_MARKETING_TOKEN : Variable Vercel â†’ getEnv("META_MARKETING_TOKEN")
META_AD_ACCOUNT_ID   : Variable Vercel â†’ act_880775160439589
META_APP_ID          : 3650763411728600
META_APP_SECRET      : 496d2ee47a8bb3f48c8c8d21ca964aa0
App Access Token     : {APP_ID}|{APP_SECRET} (gÃ©nÃ©rer Ã  la demande)
API version          : v21.0
Endpoint             : https://graph.facebook.com/v21.0/
```

**GÃ©nÃ©rer un App Access Token (PowerShell) :**
```powershell
$APP_TOKEN = "3650763411728600|496d2ee47a8bb3f48c8c8d21ca964aa0"
# Utiliser pour : mise Ã  jour paramÃ¨tres app, publication app devâ†’live
```

**Product Sets catalogue (crÃ©Ã©s) :**
```
NajmCoiff Coiffure : 2007325089858160
NajmCoiff Onglerie : 1491537002645728
```

**Audiences crÃ©Ã©es (IDs stables):**
```
Custom Clients        : 120245469075640520  (566 contacts SHA-256)
Lookalike 1% DZ       : 120245471392660520  (~300k profils)
Retargeting Coiffure 7j : 120245471426530520
Retargeting Coiffure 30j: 120245471426750520
Retargeting Onglerie 7j : 120245471426950520
Retargeting Onglerie 30j: 120245471427000520
```

**RÃ©cupÃ©rer le token Meta depuis Vercel (PowerShell) :**
```powershell
$TV = "VOIR_CONTROLE_TOTALE_MD"
$PID_VQ = "prj_5l5MXmfLo25CCtEuZGAdDGBLGvXL"
$hv = @{"Authorization"="Bearer $TV"}
$e = ((Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$PID_VQ/env" -Headers $hv).envs | Where-Object { $_.key -eq "META_MARKETING_TOKEN" })
$META_TOKEN = (Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$PID_VQ/env/$($e.id)" -Headers $hv).value.Trim()
```

### WATI WhatsApp API
```
WATI_URL    : https://live-mt-server.wati.io/10113367
WATI_TOKEN  : Variable Vercel â†’ getEnv("WATI_API_TOKEN")
wabaId      : 1707034187331243
Tenant ID   : 10113367
Owner Phone (test) : +213542186574
```

**Templates v2 (PENDING Meta â€” ne pas utiliser v1 encodage corrompu) :**
```
najm_order_v2    â†’ waTemplateId: 968304442329443   (PENDING)
najm_delivery_v2 â†’ waTemplateId: 961947683463668   (PENDING)
najm_react30_v2  â†’ waTemplateId: 1657564345575982  (PENDING)
najm_react60_v2  â†’ waTemplateId: 955608527374472   (PENDING)
najm_cart_v2     â†’ waTemplateId: 1467869854789450  (PENDING)
najm_vip_v2      â†’ waTemplateId: 1517215279934806  (PENDING)
Codes promo associÃ©s : REACT30=50%, REACT60=50%, VIPGOLDEN=50% (dans nc_partenaires)
```

**RÃ©cupÃ©rer le token WATI depuis Vercel (PowerShell) :**
```powershell
$WATI_TOKEN = (Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$PID_VQ/env/$((($e = ((Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$PID_VQ/env" -Headers $hv).envs | Where-Object { $_.key -eq "WATI_API_TOKEN" })); $e.id))" -Headers $hv).value.Trim()
```

### Vercel API (pour dÃ©ployer et gÃ©rer les env vars)
```
VERCEL_TOKEN : VOIR_CONTROLE_TOTALE_MD
PROJECT vercel-quick : prj_5l5MXmfLo25CCtEuZGAdDGBLGvXL
PROJECT nc-boutique  : prj_EoJJHWnBxmXlB1VJIJvVERG4Iu5b (dÃ©ployer sÃ©parÃ©ment)
```

---

## PROTOCOLE DE SESSION OBLIGATOIRE

Chaque session de travail avec l'IA suit cet ordre sans exception :

```
1. CHARGER   â†’ Lire CONTEXT.md (50 lignes)
2. LIRE      â†’ Lire TASKS.md (tÃ¢ches en attente)
3. CONSULTER â†’ Lire la section doc concernÃ©e (docs/boutique/PLAN.md ou autre)
4. EXÃ‰CUTER  â†’ Faire le travail demandÃ©
5. DÃ‰PLOYER  â†’ OBLIGATOIRE aprÃ¨s toute modification de code (autorisation permanente â€” PAS besoin de demander) :
               â€¢ vercel-quick  â†’ cd vercel-quick && npx vercel --token VOIR_CONTROLE_TOTALE_MD --prod --yes
               â€¢ nc-boutique   â†’ cd nc-boutique  && npx vercel --prod --yes
               â›” GAS supprimÃ© â€” ne plus utiliser clasp
6. TESTER    â†’ OBLIGATOIRE SANS EXCEPTION pour chaque tÃ¢che touchant du code :
               â€¢ cd vercel-quick && npx playwright test --reporter=list   (dashboard)
               â€¢ cd nc-boutique  && npx playwright test --reporter=list   (boutique)
               â€¢ node scripts/health-check.js                             (sanity global)
               âš ï¸ RÃˆGLES PLAYWRIGHT HUMAIN (non nÃ©gociables) :
                 - Ã‰crire/Ã©tendre le test Playwright AVANT de marquer DONE
                 - Simuler un vrai humain : goto â†’ click â†’ keyboard.type â†’ waitForTimeout
                 - VÃ©rifier la DB APRÃˆS l'action UI via sbQuery (SELECT Supabase)
                 - 0 test Ã©chouÃ© = condition NÃ‰CESSAIRE pour marquer DONE
                 - Ne jamais valider sans test â†’ un bug non testÃ© = un bug en prod
7. METTRE Ã€ JOUR â†’ Modifier docs + statuts dans TASKS.md + CHANGELOG.md + NEXT.md
8. NOTIFIER  â†’ Lancer : powershell -ExecutionPolicy Bypass -File scripts\notify.ps1
```

**Jamais de code sans avoir lu la doc.**
**Jamais de tÃ¢che considÃ©rÃ©e "terminÃ©e" sans dÃ©ploiement effectif.**
**L'autorisation de dÃ©ployer est PERMANENTE â€” voir docs/CONTROLE_TOTALE.md Â§5.**
**L'Ã©tape 8 (notifier) est OBLIGATOIRE Ã  la fin de chaque rÃ©ponse complÃ¨te.**

---

## RÃ¨gles IA

- **0 Google Sheets** â€” toutes les donnÃ©es sont dans Supabase (`nc_*`)
- **0 GAS** â€” GAS archivÃ© dÃ©finitivement (Phase M4 â€” T206-T208)
- **0 Shopify** â€” lib/shopify.js supprimÃ©, webhooks â†’ 410, abonnement Ã  annuler (T209)
- **Toutes les opÃ©rations** â†’ routes Vercel natives (`/api/...`) + Supabase direct
- Avant toute modification : lire la section doc concernÃ©e
- **DÃ©ployer SYSTÃ‰MATIQUEMENT aprÃ¨s chaque modification** â€” autorisation permanente, 0 confirmation nÃ©cessaire
- **Tester avec Playwright HUMAIN** (`npx playwright test --reporter=list`) â€” OBLIGATOIRE aprÃ¨s tout dÃ©ploiement
- Ã‰crire/Ã©tendre le test Playwright pour chaque fonctionnalitÃ© â€” simuler un vrai utilisateur (click, saisie, navigation), vÃ©rifier la DB aprÃ¨s l'action UI
- ZÃ©ro tÃ¢che "DONE" sans 0 test Ã©chouÃ© â€” tester avant de dÃ©clarer terminÃ©
- Tester avec `node scripts/health-check.js` aprÃ¨s chaque changement
- **nc-boutique** = projet Vercel sÃ©parÃ© dans `nc-boutique/` â€” NE PAS modifier `vercel-quick/` pour la boutique
- **0 Shopify dans nc-boutique** â€” nc-boutique lit/Ã©crit uniquement Supabase (nc_*)
- RÃ¨gles complÃ¨tes : voir `RULES.md`

## GAS â€” ARCHIVÃ‰ (Phase M4 â€” T208)

> âœ… Tous les fichiers GAS dÃ©placÃ©s dans `gas/_archive/`. Ne plus y toucher.
> Routes Vercel natives qui ont remplacÃ© GAS :

| Ancienne action GAS | Route Vercel native | TÃ¢che |
|---|---|---|
| `MODIFY_ORDER` | `/api/orders/modify-items` | T202 |
| `RUN_INJECT_PO` | `/api/po/inject` | T203 |
| `ADD_PO_LINES` | `/api/po/lines` | T204 |
| webhook doPost | `/api/webhooks/shopify` â†’ 410 | T205 |
| proxy `/api/gas` | `/api/gas` â†’ 410 | T207 |

## Tables Supabase (ne pas inventer de noms)

```
# â”€â”€ Tables Dashboard (existantes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
nc_orders           â†’ commandes (nc_boutique + pos + Shopify archive). order_source='nc_boutique' pour boutique
nc_variants         â†’ catalogue produits natif (images Supabase Storage)
nc_events           â†’ tous les logs (source: Vercel | nc_boutique | WEBHOOK)
nc_gas_logs         â†’ logs legacy (ne plus Ã©crire ici)
nc_barrage          â†’ seuils stock produits
nc_users            â†’ agents dashboard (DISTINCT de nc_customers)
nc_suivi_zr         â†’ suivi colis ZR Express
nc_rapports         â†’ rapports agents
nc_po_lines         â†’ lignes PO (colonnes: po_id, variant_id, qty_add, purchase_price, sell_price, barcode, display_name, product_title)
nc_gestion_fond     â†’ transactions caisse
nc_kpi_stock        â†’ KPI stock (achats, jamais vendus)
nc_quota            â†’ quotas agents
nc_quota_orders     â†’ commandes quota
nc_partenaires      â†’ codes partenaires (colonnes: code, nom, percentage, active, created_by)
nc_recettes         â†’ recettes journaliÃ¨res
nc_orders_archive   â†’ archive historique commandes (21 fÃ©v 2026 â†’ prÃ©sent, 25 752+ lignes, mÃªmes colonnes que nc_orders + global_order_key, source_system, data_quality_level, reliability_flag, replacement_status, type_de_produit, statut_retour, action_requise, import_batch_id)

# â”€â”€ Tables nc-boutique (nouvelles â€” crÃ©er via docs/BOUTIQUE_SCHEMA.sql) â”€â”€
nc_page_events      â†’ tracking clickstream boutique (vues, paniers, tunnels, UTMs)
nc_products         â†’ catalogue produits natif (Phase 2 â€” crÃ©Ã© en Phase 1 pour anticiper)
nc_stock_movements  â†’ piste d'audit mouvements stock (Phase 2)
nc_customers        â†’ comptes clients boutique publique (Phase 2)
nc_carts            â†’ paniers persistÃ©s (optionnel Phase 1)
```

## Routes Vercel actives

### Dashboard (vercel-quick/) â€” Phase M4
```
POST /api/auth/login            â† body: {username, password}
POST /api/orders/online         â† body: {token, limit?}
POST /api/orders/pos            â† body: {token, limit?}
PATCH /api/orders/modify-items  â† body: {token, order_id, new_items[]}  â† remplace GAS MODIFY_ORDER
PATCH /api/orders/update-customer â† body: {token, order_id, ...fields}
DELETE /api/orders/[id]         â† body: {token}  â† suppression + restock
POST /api/pos/order             â† body: {token, items[], customer}  â† POS natif
POST /api/inject/single         â† body: {token, order_id, ...}
POST /api/inject/batch          â† body: {token, order_ids[]}
POST /api/inject/manuel         â† body: {token, order_id, tracking}
POST /api/barrage/run           â† body: {token}  â† Supabase direct (0 Shopify)
POST /api/cloture               â† body: {token}  â† Supabase direct (0 Shopify)
POST /api/po/inject             â† body: {token, po_id?}  â† remplace GAS RUN_INJECT_PO
POST /api/po/lines              â† body: {token, po_id, lines[]}  â† remplace GAS ADD_PO_LINES
POST /api/po/labels             â† body: {token, po_id?}
GET  /api/quota                 â† ?token=
POST /api/quota/generate        â† body: {token}
GET  /api/rapports/count        â† token dans body ou Authorization header
GET/POST /api/partenaires       â† Authorization: Bearer <token>
POST /api/fond/reset            â† body: {token}
POST /api/variants/mark-achete  â† body: {token, variant_ids[]}
GET/POST /api/barcodes          â† body: {token, po_id?} ou ?token=&po_id=
POST /api/webhooks/shopify      â† 410 Gone (T205)
POST /api/webhooks/zr           â† signature Svix ZR Express
POST /api/gas                   â† 410 Gone (T207)
POST /api/sb-write              â† body: {table, data, token}
POST /api/log                   â† body: {log_type, note, ...}
POST /api/push/subscribe        â† body: {subscription}
POST /api/push/send             â† body: {token, title, body}
GET/POST /api/admin/users       â† admin only
POST /api/admin/migrate-users   â† admin only
GET/POST /api/owner/catalogue   â† owner + agents
GET/POST /api/owner/collections â† owner + agents
```

### nc-boutique (nc-boutique/) â€” nouvelles routes publiques
```
GET  /api/boutique/products           â† ?category=&search=&sort=&limit=&offset=
GET  /api/boutique/products/[slug]    â† fiche produit unique
POST /api/boutique/order              â† body: {items, customer, session_id, idempotency_key, utm}
GET  /api/boutique/track/[id]         â† suivi public (order_name ou order_id)
POST /api/boutique/track-event        â† body: {session_id, event_type, ...} fire & forget
```

## Flux rapides

```
# Dashboard â€” Phase M4 (0 Shopify, 0 GAS)
Commande boutique â†’ /api/boutique/order â†’ nc_orders (order_source='nc_boutique')
Commande POS     â†’ /api/pos/order â†’ nc_orders (order_source='pos') + decrement_stock
Confirmation     â†’ lib/supabase-direct.js â†’ nc_orders PATCH
ZR Express       â†’ /api/inject/single â†’ ZR API â†’ nc_suivi_zr + nc_events
Modifier commande â†’ /api/orders/modify-items â†’ nc_orders + increment/decrement_stock
Injection PO     â†’ /api/po/inject â†’ nc_po_lines â†’ nc_variants (increment_stock)
ClÃ´ture journÃ©e  â†’ /api/cloture â†’ nc_orders (last=OUI) + increment_stock annulÃ©s
Barrage stock    â†’ /api/barrage/run â†’ nc_variants (UPDATE direct)

# nc-boutique
Commande boutique â†’ /api/boutique/order â†’ nc_orders + nc_page_events + nc_events
Catalogue â†’ /api/boutique/products â†’ nc_variants (lecture seule, anon key)
Suivi â†’ /api/boutique/track/[id] â†’ nc_orders + nc_suivi_zr (lecture seule publique)
Tracking â†’ /api/boutique/track-event â†’ nc_page_events (fire & forget)
```

## AccÃ¨s Supabase Direct (OBLIGATOIRE â€” ne jamais oublier)

L'IA a un accÃ¨s SQL **complet et direct** Ã  Supabase via l'API Management.
**Ne jamais demander Ã  l'utilisateur d'exÃ©cuter du SQL** â€” toujours le faire soi-mÃªme.

```powershell
# Syntaxe PowerShell (shell du projet â€” Windows)
$PAT  = "sbp_b875d6d5cf2859909e5b5c1ffb9fa24cc8a155ea"
$body = '{"query":"SELECT COUNT(*) FROM nc_variants"}'
Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/alyxejkdtkdmluvgfnqk/database/query" `
  -Method POST -Headers @{"Authorization"="Bearer $PAT";"Content-Type"="application/json"} -Body $body
```

âš ï¸ Guillemets PowerShell : utiliser `''` (doubles apostrophes) pour les apostrophes dans le SQL, pas `\'`.
AprÃ¨s chaque DDL : vÃ©rifier avec `information_schema.columns` ou `information_schema.tables`.
RÃ©fÃ©rence : `docs/CONTROLE_TOTALE.md Â§1`

---

## DÃ©ploiement

```bash
# Dashboard (dans vercel-quick/)
npx vercel --token VOIR_CONTROLE_TOTALE_MD --prod --yes

# nc-boutique (dans nc-boutique/)
npx vercel --prod --yes

# Tests
cd vercel-quick && npx playwright test --reporter=list
cd nc-boutique && npx playwright test --reporter=list
node scripts/health-check.js
```

> â›” GAS supprimÃ© dÃ©finitivement (Phase M4) â€” ne plus utiliser `clasp`

## Variables d'environnement â€” Dashboard (vercel-quick/)

```
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY
SHOPIFY_ACCESS_TOKEN
SHOPIFY_WEBHOOK_SECRET
ZR_API_KEY
ZR_TENANT_ID
DASHBOARD_SECRET
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
```

## Variables d'environnement â€” nc-boutique (projet Vercel sÃ©parÃ©)

```
NEXT_PUBLIC_SUPABASE_URL       (mÃªme valeur que dashboard)
NEXT_PUBLIC_SUPABASE_ANON_KEY  (mÃªme valeur que dashboard)
SUPABASE_SERVICE_ROLE_KEY      (mÃªme valeur que dashboard)
BOUTIQUE_SECRET                (nouveau â€” token inter-services boutique)
ZR_API_KEY                     (mÃªme valeur que dashboard)
```

## PrÃ©requis avant dÃ©ploiement nc-boutique

1. ExÃ©cuter `docs/BOUTIQUE_SCHEMA.sql` dans Supabase SQL Editor
2. VÃ©rifier que `nc_variants` contient bien des produits (snapshot GAS)
3. Configurer les variables d'environnement dans le nouveau projet Vercel
4. Tester une commande de bout en bout en dev

---

## ROLLBACK D'URGENCE

Si un dÃ©ploiement casse la production, suivre cet ordre :

### Rollback Vercel (30 secondes)
```bash
# Dashboard
cd vercel-quick
npx vercel rollback --yes

# Boutique
cd nc-boutique
npx vercel rollback --yes
```

Ou via l'interface : https://vercel.com/dashboard â†’ projet â†’ Deployments â†’ cliquer sur la version prÃ©cÃ©dente â†’ "Promote to Production"

### Rollback SQL Supabase (si migration DB problÃ©matique)
```powershell
# VÃ©rifier l'Ã©tat actuel
$PAT = "sbp_b875d6d5cf2859909e5b5c1ffb9fa24cc8a155ea"
$body = '{"query":"SELECT column_name FROM information_schema.columns WHERE table_name=''nc_variants'' ORDER BY ordinal_position"}'
Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/alyxejkdtkdmluvgfnqk/database/query" `
  -Method POST -Headers @{"Authorization"="Bearer $PAT";"Content-Type"="application/json"} -Body $body

# Annuler une colonne ajoutÃ©e par erreur
# ALTER TABLE nc_variants DROP COLUMN IF EXISTS colonne_ajoutee_par_erreur;
```

### Rollback GAS
```bash
# Lister les dÃ©ploiements GAS
npx clasp deployments

# Re-dÃ©ployer sur une version prÃ©cÃ©dente
npx clasp deploy --deploymentId AKfycbz... --versionNumber N
```

### CritÃ¨res pour dÃ©clencher un rollback
- Page blanche ou erreur 500 sur nc-boutique ou dashboard
- `npx playwright test` retourne > 2 Ã©checs sur tests critiques
- Commandes impossibles Ã  crÃ©er (POST /api/boutique/order Ã©choue)
- Stock en nÃ©gatif dans nc_variants

---

## GUIDE DÃ‰MARRAGE SESSION (pour le propriÃ©taire)

> Pas besoin de savoir coder. Lis uniquement cette section avant chaque session.

### En 4 Ã©tapes

**Ã‰tape 1** â€” Ouvrir le terminal dans Cursor : menu **Terminal** â†’ **New Terminal**

**Ã‰tape 2** â€” Lancer le script de statut :
```powershell
.\scripts\session-start.ps1
```
Ce script affiche les tÃ¢ches en cours et bloquÃ©es.

**Ã‰tape 3** â€” Coller ce prompt dans Cursor Chat et envoyer :
```
Tu travailles sur le projet NajmCoiff. Lis CONTEXT.md, TASKS.md, RULES.md dans cet ordre, identifie la prochaine tÃ¢che prioritaire (ðŸ”´ ou ðŸŸ  TODO), et dis-moi ce que tu vas faire.
```

**Ã‰tape 4** â€” RÃ©pondre aux questions de l'IA. Elle dÃ©ploie automatiquement sans demander permission.

### Quand accepter / refuser

| L'IA dit... | Tu fais... |
|---|---|
| "j'ai crÃ©Ã© / modifiÃ© [fichier]" | Clique **Accept** |
| "voulez-vous que je..." | RÃ©ponds **"oui"** ou **"non"** |
| "erreur / bug trouvÃ©" | RÃ©ponds **"corrige"** |
| Elle attend depuis longtemps | Ã‰cris **"continue"** |

### CritÃ¨res de lancement PRÃŠT âœ…
- [ ] Toutes les tÃ¢ches ðŸ”´ CRITIQUE dans TASKS.md sont `DONE`
- [ ] `node scripts/health-check.js` retourne 100% vert
- [ ] `npx playwright test` retourne 0 Ã©chec
- [ ] Le design a Ã©tÃ© validÃ© visuellement
- [ ] Une commande test de bout en bout a rÃ©ussi

