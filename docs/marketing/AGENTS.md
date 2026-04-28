# AGENTS.md — Spécification technique des 6 agents IA
> version: 1.0 | updated: 2026-04-14
> Détail de chaque agent : inputs, outputs, logique, triggers, tables.
> Référence : `docs/marketing/STRATEGY.md` pour la vue d'ensemble.

---

## Architecture commune

Tous les agents partagent :
- **Runtime** : routes API Next.js dans `vercel-quick/app/api/ai/`
- **Auth** : token owner (`ownerGuard`) ou cron secret (`CRON_SECRET` env var)
- **DB** : Supabase service_role client
- **Logs** : chaque décision écrite dans `nc_ai_decisions_log`
- **Lib commune** : `vercel-quick/lib/ai-helpers.js` (fonctions partagées)

### Cron scheduling

Les crons sont gérés via Vercel Cron Jobs (`vercel.json`) :

```json
{
  "crons": [
    { "path": "/api/ai/catalog-intelligence", "schedule": "0 3 * * *" },
    { "path": "/api/ai/whatsapp-reactivate",  "schedule": "0 9 * * *" },
    { "path": "/api/ai/whatsapp-abandon-cart", "schedule": "0 */2 * * *" },
    { "path": "/api/ai/whatsapp-post-delivery","schedule": "0 10 * * *" },
    { "path": "/api/ai/campaign-optimize",     "schedule": "0 4 * * *" },
    { "path": "/api/ai/generate-content",      "schedule": "0 6 * * *" },
    { "path": "/api/ai/stock-forecast",        "schedule": "0 5 * * 1" },
    { "path": "/api/ai/daily-report",          "schedule": "0 8 * * *" }
  ]
}
```

---

## Agent 1 : Catalog Intelligence

### Route
`POST /api/ai/catalog-intelligence`

### Trigger
- Cron quotidien à 3h (heure Algérie UTC+1)
- Manuel via dashboard owner

### Inputs

| Source | Données | Usage |
|---|---|---|
| `nc_variants` | variant_id, price, inventory_quantity, world, is_new, status | Catalogue complet |
| `nc_orders` | items_json, order_date, total_price, order_source | Historique ventes |
| `nc_page_events` | PRODUCT_VIEW, CART_ADD par variant_id (30j) | Engagement |
| `nc_po_lines` | purchase_price par variant_id | Coût d'achat pour marge |

### Logique de scoring

```
health_score = (
  sales_weight      × normalize(sales_30d, 0, max_sales)     +  -- 35%
  conversion_weight × normalize(conversion_rate, 0, 0.10)    +  -- 25%
  margin_weight     × normalize(margin_pct, 0, 80)           +  -- 20%
  views_weight      × normalize(views_30d, 0, max_views)     +  -- 10%
  stock_weight      × normalize(stock_health, 0, 1)             -- 10%
) × 100
```

Où :
- `sales_30d` = nombre de fois ce variant apparaît dans `items_json` des 30 derniers jours
- `conversion_rate` = `orders_with_variant / product_views` (30j)
- `margin_pct` = `(price - purchase_price) / price × 100` (depuis `nc_po_lines`)
- `stock_health` = 1.0 si stock > seuil barrage, 0.5 si faible, 0.0 si rupture
- `velocity` : fast (top 10%), normal (10-75%), slow (75-90%), dead (90-100% + 0 ventes 90j)

### Outputs

1. **`nc_ai_product_scores`** : un row par variante par jour
2. **`nc_ai_recommendations`** : actions automatiques :

| Condition | Action | Priorité |
|---|---|---|
| velocity=fast + stock < 7j | `restock` | 1 |
| velocity=dead + stock > 0 + age > 90j | `liquidate` | 2 |
| velocity=fast + not is_new | `promote` | 3 |
| 2+ produits souvent achetés ensemble | `bundle` | 3 |
| margin_pct > 60% + velocity=slow | `discount` (5-10%) | 4 |
| margin_pct < 15% + velocity=slow | `price_up` (5-10%) | 5 |

3. **`nc_ai_decisions_log`** : log de chaque recommandation générée

### Actions automatiques

Quand `status = 'approved'` (auto ou owner) :
- `promote` → set `is_new = true` sur `nc_variants`
- `discount` → set `compare_at_price = price`, `price = new_price`
- `liquidate` → crée une campagne flash via Agent 2

---

## Agent 2 : Campaign Engine

### Routes
- `POST /api/ai/campaign-create` — créer une campagne
- `POST /api/ai/campaign-optimize` — optimiser les campagnes actives
- `GET /api/ai/campaign-report` — rapport performance

### Trigger
- Cron quotidien à 4h (optimisation)
- Événements Agent 1 (nouvelle recommandation `promote` ou `liquidate`)
- Manuel via dashboard owner

### Prérequis externes

| Prérequis | Variable d'environnement | Statut |
|---|---|---|
| Pixel coiffure | `META_PIXEL_ID_COIFFURE` | T14 — à configurer |
| Pixel onglerie | `META_PIXEL_ID_ONGLERIE` | T14 — à configurer |
| CAPI token | `META_CAPI_TOKEN` | T21 — à implémenter |
| Marketing API token | `META_MARKETING_TOKEN` | Owner à fournir |
| Ad account ID | `META_AD_ACCOUNT_ID` | Owner à fournir |

### Types de campagnes

| Type | Trigger | Audience | Budget/jour |
|---|---|---|---|
| `retargeting` | quotidien | Visiteurs pixel 7j sans achat | 500-1000 DA |
| `new_arrival` | détection `is_new` | Followers + lookalike | 300-700 DA |
| `flash_sale` | Agent 1 `liquidate` | Tous + retarget | 500-1500 DA |
| `best_seller` | Agent 1 top 10 | Lookalike acheteurs | 300-700 DA |
| `lookalike` | hebdomadaire | Lookalike clients à haut panier | 500-1000 DA |

### Logique d'optimisation

Exécutée quotidiennement sur les campagnes actives :

```
Pour chaque campagne active :
  1. Récupérer métriques Meta API (impressions, clicks, conversions, spend)
  2. Calculer ROAS = revenue / spend
  3. Si ROAS < 2.0 depuis 3+ jours → PAUSE + log décision
  4. Si ROAS > 5.0 → augmenter budget +20% (max 150% budget initial)
  5. Si CTR < 0.5% → marquer pour nouveau creative (trigger Agent 4)
  6. Si CPA > panier moyen × 0.3 → PAUSE
  7. Mettre à jour nc_ai_campaigns avec les nouvelles métriques
```

### Séparation des mondes (H7)

- Chaque campagne porte un `world` obligatoire
- Les audiences sont construites avec le pixel correspondant
- Les produits d'une campagne doivent tous avoir le même `world`
- Erreur fatale si un produit coiffure est dans une campagne onglerie

---

## Agent 3 : Client Reactivation

### Routes
- `POST /api/ai/whatsapp-reactivate` — relance dormants
- `POST /api/ai/whatsapp-abandon-cart` — abandon panier
- `POST /api/ai/whatsapp-post-delivery` — post-livraison

### Trigger
- Cron quotidien 9h (relance + post-delivery)
- Cron toutes les 2h (abandon panier)
- Événements : nouvelle commande (post-order J+3), livraison ZR (post-delivery J+1)

### Prérequis

| Prérequis | Variable d'environnement |
|---|---|
| WATI API endpoint | `WATI_API_URL` |
| WATI API token | `WATI_API_TOKEN` |
| Templates approuvés | Soumis via WATI → approbation Meta |

### Logique de segmentation quotidienne

```
1. SELECT DISTINCT phone, full_name, MAX(order_date), COUNT(*), SUM(total_price)
   FROM nc_orders
   WHERE order_source IN ('nc_boutique', 'pos')
   GROUP BY phone, full_name

2. Pour chaque client :
   days_since = NOW() - last_order_date
   segment =
     if orders >= 5 OR total_spent > 50000 → 'vip'
     if days_since <= 30 → 'new' (ou 'active')
     if days_since 31-60 → 'dormant_30'
     if days_since 61-90 → 'dormant_60'
     if days_since > 90 → 'dormant_90'
     if orders == 1 → 'one_time'

3. UPSERT dans nc_ai_client_segments
4. Synchroniser étiquettes WATI via API
```

### Flux WhatsApp automatisés

| # | Flow | Délai | Template | Contenu |
|---|---|---|---|---|
| F1 | Post-commande | J+3 après ORDER_PLACED | `order_followup` | "Commande NC-XXXX en route. Problème ? Répondez ici." |
| F2 | Post-livraison | J+1 après statut ZR `delivered` | `delivery_confirm` | "Colis arrivé ? Tout OK ? Laissez un avis." |
| F3 | Relance dormant 30j | Quand days_since ≥ 30 | `reactivation_30` | "Salam! Nouveautés {world}. Code -10% : RETOUR10" |
| F4 | Relance dormant 60j | Quand days_since ≥ 60 | `reactivation_60` | "Ça fait un moment! Offre spéciale -15% : REVIENS15" |
| F5 | Abandon panier | 2h après CHECKOUT_START sans ORDER_PLACED | `cart_reminder` | "Vous avez oublié votre panier! Finalisez ici." |
| F6 | Alerte restock | stock revient > 0 sur produit vu | `restock_alert` | "Le produit {title} est de retour en stock!" |
| F7 | Cross-sell | J+7 après commande coiffure | `cross_sell` | "Découvrez notre gamme onglerie professionnelle" |
| F8 | VIP offer | Mensuel pour segment vip | `vip_exclusive` | "Offre VIP exclusive -20% avant tout le monde" |

### Anti-spam (NEW-M3)

- Maximum 3 messages par client par semaine
- Minimum 48h entre deux messages au même numéro
- Les clients qui répondent "STOP" sont exclus définitivement (flag WATI)
- Fenêtre d'envoi : 9h-20h heure Algérie uniquement

---

## Agent 4 : Content Generator

### Routes
- `POST /api/ai/generate-content` — génération à la demande ou cron
- `GET /api/ai/content-queue` — file d'attente pour review/publication

### Trigger
- Cron quotidien 6h
- Manuel via dashboard owner
- Trigger Agent 1 : nouveau produit `is_new` ou promo détectée

### Moteur LLM

| Variable | Valeur |
|---|---|
| `AI_PROVIDER` | `openai` ou `anthropic` |
| `AI_API_KEY` | clé API OpenAI ou Anthropic |
| `AI_MODEL` | `gpt-4o` ou `claude-sonnet-4-20250514` |

### Types de contenu

| Type | Volume | Langue | Plateforme |
|---|---|---|---|
| `product_description` | batch 1000+ | ar + fr | boutique |
| `social_post` | 2-3/jour | ar | IG, FB, TikTok |
| `ad_copy` | par campagne | ar + fr | Meta Ads |
| `reel_script` | 1/jour | ar | IG Reels, TikTok |
| `whatsapp_template` | par besoin | ar | WhatsApp/WATI |
| `banner_text` | par besoin | ar | nc-boutique |
| `seo_meta` | batch | fr | nc-boutique meta tags |

### Processus

```
1. Agent 4 sélectionne le type de contenu à générer (via cron ou trigger)
2. Charge le template depuis nc_ai_content_templates
3. Injecte les variables (produit, prix, monde, etc.)
4. Appelle le LLM (OpenAI/Claude)
5. Insère dans nc_ai_content_queue (status = 'draft')
6. Si auto-approval activé (pour descriptions produit) → status = 'approved'
7. Owner review via dashboard pour social posts et ad copy
8. Publication = mise à jour nc_variants.description ou envoi via API sociale
```

### Prompts

Voir `docs/marketing/AI_PROMPTS.md` pour les prompts complets.

---

## Agent 5 : Stock Optimizer

### Route
`POST /api/ai/stock-forecast`

### Trigger
- Cron hebdomadaire (lundi 5h)
- Manuel via dashboard owner

### Logique de prédiction

```
Pour chaque variant avec stock > 0 ou ventes > 0 dans les 90j :
  1. sales_history = SELECT items_json->>variant_id, COUNT(*)
     FROM nc_orders WHERE order_date > NOW() - 90 days
     GROUP BY week

  2. trend = régression linéaire sur les 12 dernières semaines
     - coefficient > 0.1 → 'rising'
     - coefficient < -0.1 → 'declining'
     - sinon → 'stable'

  3. demand_30d = extrapolation linéaire des ventes hebdo × 4.3
  4. stock_days = current_stock / (demand_30d / 30)

  5. reorder_point = demand_30d × 1.5 (buffer 50%)
  6. reorder_qty = demand_30d × 2 - current_stock (2 mois de stock)

  7. Si stock_days < 14 → alerte 'low_stock' severity 'high'
  8. Si stock_days < 7 → alerte 'low_stock' severity 'critical'
  9. Si 0 ventes 90j + stock > 0 → alerte 'dead_stock'
  10. Si stock > demand_90d × 2 → alerte 'overstock'
```

### Saisonnalité

| Période | Facteur | Impact |
|---|---|---|
| Ramadan | +30% sur soins cheveux | Restock préventif 2 semaines avant |
| Rentrée (septembre) | +20% sur onglerie | Campagne promo Agent 2 |
| Été (juin-août) | -15% sur coiffure | Réduire les achats PO |
| Fin d'année | +25% sur les deux | Préparer stock + campagnes |

### Scoring fournisseur

```
Pour chaque variant via nc_po_lines :
  profit_margin = (price - purchase_price) / price × 100
  sell_through = units_sold / units_purchased × 100
  supplier_score = profit_margin × 0.5 + sell_through × 0.5
```

---

## Agent 6 : Analytics Commander

### Routes
- `GET /api/ai/dashboard` — données temps réel pour page owner
- `POST /api/ai/daily-report` — rapport quotidien

### Trigger
- Cron quotidien 8h (rapport + envoi WhatsApp au owner)
- Temps réel sur page `/dashboard/owner/ai`

### KPIs calculés

| KPI | Source | Calcul |
|---|---|---|
| revenue_da | `nc_orders` | SUM(total_price) WHERE order_date >= today |
| orders_count | `nc_orders` | COUNT WHERE order_date >= today |
| avg_order_value | dérivé | revenue / orders |
| conversion_rate | `nc_page_events` | ORDER_PLACED sessions / PAGE_VIEW sessions |
| new_customers | `nc_ai_client_segments` | COUNT WHERE segment='new' AND created_at >= today |
| reactivated | `nc_ai_client_segments` | COUNT WHERE segment changé de dormant → commande |
| cart_abandon_rate | `nc_page_events` | 1 - (ORDER_PLACED / CHECKOUT_START) |
| campaigns_roas | `nc_ai_campaigns` | AVG(roas) WHERE status='active' |
| whatsapp_sent | `nc_ai_whatsapp_logs` | COUNT WHERE direction='outbound' AND today |
| content_published | `nc_ai_content_queue` | COUNT WHERE status='published' AND today |
| stock_critical | `nc_ai_stock_alerts` | COUNT WHERE severity='critical' AND acknowledged=false |

### Décisions automatiques

| Condition | Action | Agent cible |
|---|---|---|
| ROAS campagne < 2.0 depuis 3j | Pause campagne | Agent 2 |
| Stock < seuil barrage | Notification + PO suggéré | Agent 5 → Dashboard |
| Abandon panier > 70% sur un produit | Promo -5% | Agent 1 |
| Client VIP inactif 45j+ | Relance prioritaire | Agent 3 |
| Contenu publié < objectif semaine | Générer batch contenu | Agent 4 |
| Nouveau produit `is_new` sans description | Générer description | Agent 4 |

### Score de santé business

```
health_score = (
  revenue_vs_target × 30 +      -- 30% : CA vs objectif
  conversion_rate_health × 20 +  -- 20% : taux conversion
  stock_health × 15 +            -- 15% : pas de ruptures critiques
  campaign_health × 15 +         -- 15% : ROAS campagnes
  customer_health × 10 +         -- 10% : clients réactivés
  content_health × 10            -- 10% : contenu publié vs objectif
)
```

### Rapport WhatsApp quotidien (owner)

Envoyé chaque matin à 8h via WATI au numéro owner :

```
📊 NajmCoiff — Rapport du {date}

💰 CA hier : {revenue_da} DA ({variation}%)
📦 Commandes : {orders_count}
🛒 Panier moyen : {avg_order_value} DA
📈 Conversion : {conversion_rate}%

🔄 Clients réactivés : {reactivated}
📱 Messages WA envoyés : {whatsapp_sent}
🎯 Campagnes actives : {campaigns_active} (ROAS {roas})

⚠️ Alertes : {stock_critical} produits critiques
🏥 Score santé : {health_score}/100

{top_insight}
```
