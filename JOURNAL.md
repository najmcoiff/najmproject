# 📘 Journal NajmCoiff

> Le **seul** fichier que tu lis pour suivre le projet. En français simple.
> L'IA met à jour ce fichier après chaque tâche terminée.
>
> Dernière mise à jour : 2026-04-28

---

## 🚦 Où on en est

**Phase active : M5 — Marketing IA** ✅
- Agents IA marketing opérationnels (Meta Ads, WhatsApp WATI, contenu, campagnes)
- Dashboard agents en production : https://najmcoiffdashboard.vercel.app
- Boutique client en production : https://nc-boutique.vercel.app
- Phase M1 → M4 (bootstrap, parité, images, fermeture Shopify/GAS) : **terminées**

**Prochaine étape majeure :** finir le rééquilibrage de la base de tests (25 tests rouges sur la boutique).

---

## ✅ Ce qui marche aujourd'hui

| Système | URL | Statut |
|---|---|---|
| 🏪 Boutique client | https://nc-boutique.vercel.app | ✅ En ligne |
| 📊 Dashboard agents | https://najmcoiffdashboard.vercel.app | ✅ En ligne |
| 💬 WhatsApp (WATI) | 6 templates v2 PENDING Meta | ⏳ Approbation 24-48h |
| 📢 Meta Ads | Pixels actifs + audiences créées | ✅ Prêt à scaler |
| 📦 ZR Express | Webhook signé Svix | ✅ |
| 🗄️ Supabase | 21+ tables `nc_*`, RLS actif | ✅ |

---

## ⚠️ Ce qui est cassé / à finir

### Tests Playwright boutique
**214 passed / 25 failed / 4 flaky** (baseline 2026-04-28).

Les 25 échecs se groupent en 7 clusters :
- **smart-sort** (6 tests) — `nc_ai_product_scores` pas peuplé / cron cassé
- **coupon-margin** (5 tests) — `nc_variants.cost_price` manquant
- **delivery-prices** (5 tests) — Wilaya Blida + Alger
- **floating-cart** (2 tests) — badge panier non MAJ
- **meta-feed** (2 tests) — pagination
- **catalogue search** (1 test) — barre cachée Desktop
- **image-perf** (1 test) — timeout 45s

### Action manuelle owner
- ⏳ **Annuler abonnement Shopify** — code à 410, mais l'abonnement payant tourne toujours

---

## 🎯 Prochaine action

**Travailler sur le cluster `smart-sort`** (6 tests rouges = priorité car feature transverse).
Étapes prévues :
1. Vérifier `nc_ai_product_scores` dans Supabase (rempli ou vide ?)
2. Vérifier le cron Agent 1 (`/api/ai/catalog-intelligence`)
3. Faire passer les 6 tests
4. Déployer et notifier

Pour me lancer, tape `continue` dans le chat.

---

## 🔧 Comment je travaille (rappel)

### Toi (owner)
- **Pour me lancer** : double-clique sur `lancer-claude.bat` à la racine. Ça ouvre Claude Code en mode autonome (zéro prompt).
- Une fois que je suis prêt, tu tapes `continue` + Entrée
- Tu lis ce fichier (`JOURNAL.md`) quand tu veux savoir où on en est
- Tu reçois une notification (son + voix française) quand j'ai fini
- Tu n'as **rien** à valider entre les étapes — j'enchaîne

### Moi (l'IA)
- Je lis JOURNAL + TACHES + docs/regles → je comprends le contexte
- Je fais le travail → code, tests, déploiement, notification
- Je mets à jour ce JOURNAL → tu vois la nouvelle situation au prochain regard

### Quand je te dérange (rare)
- ⚠️ Action irréversible avec impact client/argent (envoi WhatsApp à tous, suppression prod, dépense pub Meta)
- ⚠️ Vraie ambiguïté business (genre "promo 30% ou 50%")
- Sinon : silence radio, j'avance.

---

## 📂 Où trouver quoi

| Tu veux... | Fichier |
|---|---|
| Suivre l'avancement | **`JOURNAL.md`** (ce fichier) |
| Voir les tâches actives | `TACHES.md` |
| Présentation projet 1 page | `README.md` |
| Règles techniques détaillées | `docs/regles.md` |
| Lexique des termes | `docs/glossaire.md` |
| Historique des décisions | `docs/decisions.md` |
| Plan boutique | `docs/boutique/PLAN.md` |
| Plan dashboard | `docs/dashboard/ARCHITECTURE.md` |
| Stratégie marketing IA | `docs/marketing/` |
| Tokens et secrets | `secrets/README.md` (gitignored) |

---

## 🕓 Historique récent

| Date | Action |
|---|---|
| 2026-04-28 | Réorganisation complète du repo (cleanup-organisation branch). 12 fichiers .md racine → 4 propres (JOURNAL/README/AGENTS V4/TACHES). Dossiers renommés : `nc-boutique/` → `boutique/` ✅ et `vercel-quick/` → `dashboard/` ✅. Reste un dossier vide `nc-boutique/` (Cursor lock — à supprimer avec Cursor fermé). |
| 2026-04-15 | RLS Supabase activé sur toutes les tables. Codes promo 50% sur marge créés. Mobile dashboard fixé (6 pages). |
| 2026-04-14 | Phase M5 lancée. 13 tables `nc_ai_*`, 12 routes agents, page War Room. |
| 2026-04-13/14 | Phase M4 terminée. 0 Shopify, 0 GAS, routes Vercel natives. |
| 2026-04-12/13 | Phase M3 — POS comptoir, modify-items, decrement_stock. |
| 2026-04-11/13 | Phases M1+M2 — Bootstrap boutique, catalogue, dashboard. |

> Détail complet : `archive/historique/changelog-2025-2026.md` (3 340 lignes).
