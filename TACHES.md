# 📋 Tâches actives — NajmCoiff

> Dernière mise à jour : 2026-04-28 — Phase M5 active
> Pour l'historique des tâches terminées (M1 → M5) : voir `archive/taches-faites/taches-m1-m5-completes.md`

---

## 🎨 Légende

| Priorité | Sens |
|---|---|
| 🔴 CRITIQUE | Bloque la prod ou cause des erreurs actives |
| 🟠 HAUTE | Fonctionnalité ou correctif important |
| 🟡 MOYENNE | Amélioration significative |
| 🟢 BASSE | Cosmétique / futur |

| Statut | |
|---|---|
| `TODO` | Non commencé |
| `EN_COURS` | En cours |
| `BLOQUÉ` | Attente d'info ou d'action externe |

---

## 🟠 ACTIF

### Tests Playwright boutique — **25 rouges à corriger**

| ID | Cluster | Tests rouges | Cause probable | Statut |
|---|---|---|---|---|
| T_FIX_SMART_SORT | smart-sort | 6 | `nc_ai_product_scores` non peuplé / cron Agent 1 cassé | TODO |
| T_FIX_COUPON_MARGIN | coupon-margin | 5 | `nc_variants.cost_price` manquant ou route `/api/boutique/coupon` HS | TODO |
| T_FIX_DELIVERY_PRICES | delivery-prices | 5 | Wilaya Blida 550/350 + Alger 400 DZD KO | TODO |
| T_FIX_FLOATING_CART | floating-cart | 2 | Badge panier non MAJ depuis `/collections/[world]` | TODO |
| T_FIX_META_FEED_PAGINATION | meta-feed | 2 | Pagination `page=2` retourne mêmes items | TODO |
| T_FIX_CATALOGUE_SEARCH | catalogue | 1 | Barre de recherche absente Desktop | TODO |
| T_FIX_IMAGE_PERF | image-perf | 1 | Timeout 45s sur `/collections/coiffure` | TODO |

**Baseline 2026-04-28 :** 214 passed / 25 failed / 4 flaky / 9 skipped (6m54s).

### Réorganisation projet

| ID | Tâche | Priorité | Statut |
|---|---|---|---|
| T_CLEANUP_DIR_VIDE | Supprimer le dossier vide `nc-boutique/` qui traîne (Cursor IDE le verrouille — fermer Cursor puis `Remove-Item nc-boutique`). Le code a déjà été migré vers `boutique/`. | 🟢 BASSE | BLOQUÉ (lock Cursor) |
| T_DOCS_MARKETING | Fusion des 6 fichiers `docs/marketing/` en 2 (`marketing.md` + `marketing-tech.md`) | 🟢 BASSE | TODO |

---

## ⛔ BLOQUÉ — Action propriétaire requise

> Ces éléments ne peuvent pas être faits par l'IA. C'est toi qui dois les fournir/exécuter.

| ID | Action | Bloque | Comment |
|---|---|---|---|
| T_OWNER_SHOPIFY_CANCEL | **Annuler abonnement Shopify** | T209 (clôture définitive) | Connexion à Shopify Admin → Settings → Plan → Cancel subscription |
| T_OWNER_DETTE_INITIALE | Saisir la dette fournisseur initiale (en DA) dans la page Config BI | T_BI_CONFIG | Dashboard owner → BI → Config → champ "Dette fournisseur initiale" |

---

## ✅ Phases terminées (M1 → M5)

Détail complet : `archive/taches-faites/taches-m1-m5-completes.md`

| Phase | Période | Nb tâches | Résumé |
|---|---|---|---|
| **M5 — Marketing IA** | 2026-04-14 → en cours | 14+ | 12 routes `/api/ai/*`, 13 tables `nc_ai_*`, page War Room, 4 agents (Catalog, Meta, WhatsApp, Contenu) |
| **M4 — Fermeture GAS/Shopify** | 2026-04-13/14 | 9 | 0 Shopify, 0 GAS, routes Vercel natives (T200-T208) |
| **M3 — Stock & POS** | 2026-04-12/13 | 16 | decrement_stock, POS comptoir + mobile, barcode, modify-items |
| **M2 — Catalogue & Dashboard** | 2026-04-11/13 | 30+ | Catalogue owner, collections, upload images, quota, rapports, smart search |
| **M1 — Bootstrap boutique** | 2026-04-11/12 | 60+ | nc-boutique live, 2 mondes, commande, suivi, PWA, analytique |

---

## 📌 Modèle pour ajouter une tâche

```
| T_<NOM_COURT> | <description claire 1 ligne> | 🔴/🟠/🟡/🟢 | TODO/EN_COURS/BLOQUÉ |
```

Insérer dans la section `🟠 ACTIF` ou `⛔ BLOQUÉ` selon le cas.
