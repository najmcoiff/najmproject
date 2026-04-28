# STRATEGY.md — NajmCoiff AI Marketing Machine
> version: 1.0 | updated: 2026-04-14
> Document maître : objectifs, KPIs, architecture, métriques de suivi.
> ⚠️ Ce fichier est la source de vérité pour la stratégie marketing IA.

---

## 1. Contexte business

| Donnée | Valeur |
|---|---|
| Marque | NajmCoiff — grossiste coiffure + onglerie, Algérie |
| CA actuel | ~750K DA/mois (~4 500$/mois) |
| Commandes | 10-20/mois (organique, 0 pub) |
| Panier moyen | 2 000 – 5 000 DA |
| Marge | Variable selon produits |
| Audience sociale | 40K Instagram, 30K Facebook, 20K TikTok = 90K |
| Catalogue | 1 000+ produits (coiffure dominant, onglerie nouvelle niche) |
| Clients | 85% B2B (salons), 15% B2C |
| Fidélité | 25% fidèles, 35% dormants (rachètent après mois), 40% nouveaux |
| Livraison | ZR Express, COD, +80% taux livraison réussie |
| Équipe | 5+ personnes (agents dashboard) |
| Concurrents | Vendeurs Facebook/Instagram sans infrastructure e-commerce |
| WhatsApp | WATI configuré basiquement (étiquettes), aucune automatisation |
| Publicité | ZÉRO — aucun budget ads dépensé à ce jour |

### Avantage concurrentiel

NajmCoiff possède le seul système e-commerce professionnel dans sa niche en Algérie :
- Site boutique dédié avec suivi ZR intégré
- Dashboard opérationnel complet (confirmation, préparation, stock, POS)
- Tracking clickstream propriétaire (`nc_page_events`)
- Catalogue structuré dans Supabase (1 000+ produits, stock, prix d'achat)
- Séparation des deux univers (coiffure/onglerie) jusqu'au pixel Facebook

Les concurrents vendent via Facebook/Instagram sans site, sans suivi, sans automatisation.

---

## 2. Objectifs chiffrés (90 jours)

### Objectif principal : x3 du CA

| Période | CA cible | Commandes cibles | Actions clés |
|---|---|---|---|
| Mois 1 (S1-S4) | 1 000 000 DA | 30-40 | Infrastructure IA + premières campagnes Meta |
| Mois 2 (S5-S8) | 1 500 000 DA | 50-70 | Automatisations actives + relance WhatsApp |
| Mois 3 (S9-S12) | 2 000 000 – 2 500 000 DA | 80-100 | Machine en vitesse de croisière |

### Pourquoi x3 (et pas x10)

- Le COD en Algérie impose un plafond de conversion réaliste (~3-5%)
- Le panier moyen B2B (2-5K DA) est modéré → croissance par **volume + fréquence**
- Avec 0 pub actuelle, même un budget modeste génère un ROAS élevé (5-8x)
- Les 35% de clients dormants = levier #1 quasi gratuit

### KPIs de pilotage

| KPI | Baseline | Cible M1 | Cible M3 | Fréquence |
|---|---|---|---|---|
| CA mensuel (DA) | ~750K | 1M | 2-2.5M | Quotidien |
| Commandes / mois | 10-20 | 30-40 | 80-100 | Quotidien |
| Panier moyen (DA) | 2-5K | 3-5K | 4-6K | Hebdomadaire |
| Taux conversion site | inconnu | 2% | 3-5% | Quotidien |
| Clients réactivés | 0 | 20 | 50+/mois | Hebdomadaire |
| ROAS Meta Ads | n/a | 5x | 8x | Quotidien |
| Taux abandon panier | inconnu | mesurer | -30% vs baseline | Quotidien |
| Score santé business | n/a | établir | 80+/100 | Quotidien |
| Contenu publié/mois | ~0 | 30 posts | 60 posts | Hebdomadaire |
| Messages WhatsApp envoyés | 0 auto | 100 | 500+/mois | Quotidien |

---

## 3. Architecture : 6 Agents IA Autonomes

```
┌─────────────────────────────────────────────────────────┐
│                   COUCHE DONNÉES (Supabase)              │
│  nc_orders │ nc_variants │ nc_page_events │ nc_events   │
│  nc_customers │ nc_partenaires │ nc_po_lines            │
└──────────────────────┬──────────────────────────────────┘
                       │
           ┌───────────┴───────────┐
           │   CERVEAU IA (6 Agents) │
           │                         │
           │  A1: Catalog Intelligence │ → Scoring produits, bundles, prix
           │  A2: Campaign Engine      │ → Meta Ads automatiques
           │  A3: Client Reactivation  │ → WhatsApp WATI automation
           │  A4: Content Generator    │ → Textes arabe/français via LLM
           │  A5: Stock Optimizer      │ → Prédiction demande, alertes
           │  A6: Analytics Commander  │ → CEO virtuel, rapports, décisions
           │                         │
           └───────────┬─────────────┘
                       │
           ┌───────────┴───────────┐
           │    CANAUX DE SORTIE    │
           │                       │
           │  WhatsApp (WATI API)  │
           │  Meta Ads (Marketing API) │
           │  Boutique (nc-boutique)│
           │  Dashboard Owner      │
           └───────────────────────┘
```

### Agent 1 : Catalog Intelligence
- **Trigger** : cron quotidien
- **Input** : `nc_variants`, `nc_orders`, `nc_page_events`, `nc_po_lines`
- **Output** : `nc_ai_product_scores`, `nc_ai_recommendations`
- **Actions** : score produits, détection stock mort, bundles, prix optimal

### Agent 2 : Campaign Engine
- **Trigger** : cron quotidien + événements Agent 1
- **Input** : Agent 1 scores, Meta Marketing API
- **Output** : `nc_ai_campaigns`, `nc_ai_audiences`
- **Actions** : créer/optimiser campagnes Meta, audiences, A/B tests

### Agent 3 : Client Reactivation
- **Trigger** : cron quotidien + cron 2h (abandon panier)
- **Input** : `nc_orders`, `nc_page_events`, WATI API
- **Output** : `nc_ai_client_segments`, `nc_ai_whatsapp_queue`
- **Actions** : relance dormants, abandon panier, post-livraison, cross-sell

### Agent 4 : Content Generator
- **Trigger** : cron quotidien + à la demande
- **Input** : `nc_variants`, Agent 1 scores, templates
- **Output** : `nc_ai_content_queue`
- **Actions** : descriptions produits, posts sociaux, ad copy, scripts reels

### Agent 5 : Stock Optimizer
- **Trigger** : cron hebdomadaire
- **Input** : `nc_orders`, `nc_variants`, `nc_page_events`, `nc_po_lines`
- **Output** : `nc_ai_demand_forecast`, `nc_ai_stock_alerts`
- **Actions** : prédiction demande, alertes restock, liquidation stock mort

### Agent 6 : Analytics Commander
- **Trigger** : cron quotidien 8h + temps réel dashboard
- **Input** : tous les agents + toutes les tables
- **Output** : `nc_ai_daily_reports`, `nc_ai_decisions_log`
- **Actions** : rapports, décisions automatiques, score santé business

---

## 4. Budget et ROI

### Investissement

| Poste | Mois 1 | Mois 2 | Mois 3 |
|---|---|---|---|
| Système existant (amorti) | 600$ (déjà payé) | - | - |
| Budget Meta Ads | ~100$ (15-20K DA) | ~150$ | ~200$ |
| API IA (OpenAI/Claude) | ~20$ | ~20$ | ~20$ |
| WATI | inclus (déjà payé) | inclus | inclus |
| **Total additionnel** | **~120$** | **~170$** | **~220$** |

### ROI projeté

| Métrique | Mois 1 | Mois 2 | Mois 3 | Total 90j |
|---|---|---|---|---|
| CA | 1M DA (~6K$) | 1.5M DA (~9K$) | 2M+ DA (~12K$) | ~27K$ |
| Coût marketing | 120$ | 170$ | 220$ | 510$ |
| ROAS global | 50x | 53x | 55x | - |

**Investissement total : ~1 110$ (système + 3 mois) → CA projeté : ~27K$ en 3 mois**

---

## 5. Prérequis owner (actions humaines)

1. **Meta Business Manager** : créer 2 pixels (coiffure + onglerie) → fournir les IDs
2. **Meta Marketing API** : générer un token d'accès longue durée
3. **WATI API** : fournir le token API et l'endpoint
4. **Budget ads initial** : 15-20K DA (~100$) pour les 2 premières semaines
5. **Templates WhatsApp** : soumettre à Meta pour approbation (textes rédigés par l'IA)
6. **Clé API OpenAI ou Anthropic** : pour le content generator (~20$/mois)

---

## 6. Règles inviolables

- **H7** : les événements coiffure/onglerie ne se mélangent JAMAIS entre pixels
- **H8** : COD uniquement — aucun paiement en ligne Phase 1/2
- **H10** : IP hashée SHA-256 dans `nc_page_events` — jamais l'IP brute
- **NEW-M1** : aucune action IA irréversible sans log dans `nc_ai_decisions_log`
- **NEW-M2** : budget ads plafonné à 150% du budget paramétré — jamais de dépassement silencieux
- **NEW-M3** : messages WhatsApp limités à 3/semaine/client pour éviter le spam
- **NEW-M4** : tout contenu généré passe par une file de validation avant publication auto
- **NEW-M5** : l'IA ne modifie jamais les prix au-delà de ±15% sans alerte owner

---

## 7. Tables Supabase (nouvelles — module marketing IA)

Voir `docs/marketing/SCHEMA.md` pour le DDL complet.

| Table | Rôle |
|---|---|
| `nc_ai_product_scores` | Scores quotidiens par produit (Agent 1) |
| `nc_ai_recommendations` | Actions recommandées (promouvoir, liquider, bundler) |
| `nc_ai_campaigns` | Campagnes Meta créées et métriques |
| `nc_ai_audiences` | Segments d'audience Meta |
| `nc_ai_client_segments` | Segmentation IA des clients |
| `nc_ai_whatsapp_queue` | File de messages WhatsApp à envoyer |
| `nc_ai_whatsapp_logs` | Suivi des envois et réponses |
| `nc_ai_content_queue` | Contenu généré en attente de publication |
| `nc_ai_content_templates` | Prompts et templates par type |
| `nc_ai_demand_forecast` | Prévisions de demande par produit |
| `nc_ai_stock_alerts` | Alertes stock automatiques |
| `nc_ai_daily_reports` | Rapports quotidiens générés |
| `nc_ai_decisions_log` | Historique de toutes les décisions IA |

---

## 8. Routes API (nouvelles — vercel-quick)

| Route | Méthode | Agent | Trigger |
|---|---|---|---|
| `/api/ai/catalog-intelligence` | POST | A1 | cron quotidien |
| `/api/ai/campaign-create` | POST | A2 | cron / trigger A1 |
| `/api/ai/campaign-optimize` | POST | A2 | cron quotidien |
| `/api/ai/campaign-report` | GET | A2 | dashboard |
| `/api/ai/whatsapp-reactivate` | POST | A3 | cron quotidien |
| `/api/ai/whatsapp-abandon-cart` | POST | A3 | cron 2h |
| `/api/ai/whatsapp-post-delivery` | POST | A3 | cron quotidien |
| `/api/ai/generate-content` | POST | A4 | cron / demande |
| `/api/ai/content-queue` | GET | A4 | dashboard |
| `/api/ai/stock-forecast` | POST | A5 | cron hebdomadaire |
| `/api/ai/dashboard` | GET | A6 | dashboard |
| `/api/ai/daily-report` | POST | A6 | cron quotidien 8h |

---

## 9. Fichiers de référence

| Document | Chemin |
|---|---|
| Spécification agents | `docs/marketing/AGENTS.md` |
| Intégration WATI | `docs/marketing/WATI_INTEGRATION.md` |
| Intégration Meta | `docs/marketing/META_ADS.md` |
| Prompts IA | `docs/marketing/AI_PROMPTS.md` |
| Schéma SQL | `docs/marketing/SCHEMA.md` |
| Roadmap | `docs/marketing/ROADMAP.md` |
