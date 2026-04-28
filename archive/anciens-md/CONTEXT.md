# CONTEXT — NajmCoiff
> version: 2.0 | updated: 2026-04-14 | status: ACTIVE — Phase M4 terminée

## Qui
NAJMCOIFF — grossiste coiffure + onglerie, Algérie. Propriétaire : `najm`.

## Quoi
Deux systèmes qui partagent la même base Supabase :
1. **vercel-quick** (dashboard agents) — `https://najmcoiffdashboard.vercel.app`
2. **nc-boutique** (boutique client) — `https://nc-boutique.vercel.app`

## Stack
Next.js 16 · React 19 · Tailwind v4 · Supabase · Vercel · ZR Express (livraison)

## Règles absolues (3)
1. **Toutes les données = Supabase** (`nc_*`). Zéro Google Sheets. Zéro Shopify.
2. **0 GAS** — GAS supprimé définitivement (Phase M4 terminée T206-T208)
3. **Doc d'abord, code ensuite** — toute modification passe par `docs/boutique/PLAN.md`

## Fichiers à lire selon la tâche

| Tâche | Fichier à lire |
|---|---|
| Démarrer une session | `AGENTS.md` + `TASKS.md` |
| Travailler sur nc-boutique | `docs/boutique/PLAN.md` |
| Travailler sur le dashboard | `docs/dashboard/ARCHITECTURE.md` |
| Connaître les accès | `docs/CONTROLE_TOTALE.md` |
| Comprendre le schéma DB | `docs/boutique/SCHEMA.md` |
| Voir les routes API | `docs/boutique/API.md` |
| Résoudre un bug | `docs/boutique/TROUBLESHOOT.md` |
| Voir les tâches | `TASKS.md` |
| Comprendre un terme | `GLOSSARY.md` |
| KPIs opérationnels / BI | `docs/analytics/BUSINESS_INTEL.md` |
| Stratégie marketing IA | `docs/marketing/STRATEGY.md` |

## Deux mondes boutique
- **Coiffure** : noir + rouge, public barbier/coiffeur
- **Onglerie** : thème féminin distinct, tag `onglerie` dans `collections_titles`
- Les événements tracking ne se croisent **jamais** (2 pixels Facebook séparés)

## Tableau des systèmes

| Système | URL | Stack | DB | Déploiement |
|---|---|---|---|---|
| **Dashboard agents** | https://najmcoiffdashboard.vercel.app | Next.js + Tailwind + Supabase | `nc_*` tables | `cd vercel-quick && npx vercel --prod --yes` |
| **Boutique client** | https://nc-boutique.vercel.app | Next.js + Tailwind + Supabase | `nc_*` tables (lecture) | `cd nc-boutique && npx vercel --prod --yes` |
| **Supabase** | https://alyxejkdtkdmluvgfnqk.supabase.co | PostgreSQL | — | SQL direct via API Management |
| ~~GAS (supprimé)~~ | ~~Apps Script~~ | ~~GAS~~ | ~~Shopify~~ | **Archivé** `gas/_archive/` |

---

## Statut migration Shopify — Phase Map

| Phase | Nom | Statut | Critères de sortie |
|---|---|---|---|
| **M1** | Bootstrap nc-boutique | ✅ DONE | Boutique live, catalogue depuis nc_variants, commandes dans nc_orders |
| **M2** | Parité fonctionnelle | ✅ DONE | Toutes tâches 🔴 DONE, Playwright 0 échec, commande test réussie |
| **M3** | Migration images | ✅ DONE | Images Shopify CDN → Supabase Storage (`--phase=images-to-storage`) |
| **M4** | Fermeture Shopify + GAS | ✅ DONE | 0 appel Shopify, 0 GAS, lib/shopify.js supprimé (T200–T208) |

**Phase actuelle : M4 terminée** — 0 Shopify, 0 GAS, tout tourne sur Supabase + Vercel.
**Prochaine étape : T209** — Fermeture définitive Shopify (annuler abonnement + confirmer 0 référence).
