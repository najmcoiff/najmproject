# 🤖 Marketing IA — NajmCoiff

> Documentation des 4 agents marketing automatisés (Phase M5).
> Pour la stratégie en français simple : voir `JOURNAL.md` à la racine.

---

## 🗺️ Plan de lecture rapide

| Tu veux comprendre... | Lis |
|---|---|
| **La stratégie globale** (objectifs, KPI, segments) | [`STRATEGY.md`](STRATEGY.md) |
| **Le calendrier de déploiement** | [`ROADMAP.md`](ROADMAP.md) |
| **Les 4 agents IA** (Catalog, Meta, WhatsApp, Contenu) | [`AGENTS.md`](AGENTS.md) |
| **Les prompts utilisés** par les agents | [`AI_PROMPTS.md`](AI_PROMPTS.md) |
| **Le schéma DB marketing** (tables `nc_ai_*`, `nc_wati_*`) | [`SCHEMA.md`](SCHEMA.md) |
| **Configuration Meta Ads** (pixels, audiences, catalogue) | [`META_ADS.md`](META_ADS.md) |
| **Configuration WATI WhatsApp** (templates, tenant) | [`WATI_INTEGRATION.md`](WATI_INTEGRATION.md) |

---

## 🎯 Les 4 agents en bref

| # | Agent | Rôle | Cron / Trigger | Tables impactées |
|---|---|---|---|---|
| **1** | Catalog Intelligence | Score de santé produits, smart-sort | Cron 06:00 quotidien | `nc_ai_product_scores` |
| **2** | Meta Campaigns | Création campagnes Meta Ads (5 types × 2 mondes) | Manuel ou cron quotidien | `nc_campaign_plans`, audiences Meta |
| **3** | WhatsApp Reactivation | Relance clients dormants 30j/60j + paniers + post-livraison | Cron quotidien + event-driven | `nc_wati_campaigns`, `nc_wati_message_log` |
| **4** | Content Generator | Génération textes/visuels arabes (campagnes) | Sur demande | `nc_ai_content_queue` |

---

## 🔑 Accès API (résumé)

Détail complet et tokens : voir `AGENTS.md` racine § "Accès API Marketing" et `secrets/README.md`.

- **Meta** : Business Manager `301096122408704` · Ad Account `act_880775160439589` · API v21.0
- **WATI** : Tenant `10113367` · WABA `1707034187331243`
- **Pixels** : Coiffure `1436593504886973` · Onglerie `839178319213103`

---

## 📊 Dashboards live

- [War Room marketing](https://najmcoiffdashboard.vercel.app/dashboard/owner/marketing)
- [Campagnes Meta + WhatsApp](https://najmcoiffdashboard.vercel.app/dashboard/owner/campaigns)
- [Page IA agents](https://najmcoiffdashboard.vercel.app/dashboard/owner/ai)
