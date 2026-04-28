# NajmCoiff — Business Intelligence Layer
## Document de référence : KPIs opérationnels, règles de calcul, sources de données

> Version 2.0 — 14 avril 2026 (correction majeure des objectifs et KPIs)
> Auteur : IA Chef de projet
> Lire ce document AVANT d'implémenter toute route `/api/bi/` ou page dashboard BI.

---

## Pourquoi ce document existe

Le système NajmCoiff dispose d'une couche marketing solide (`docs/marketing/`) et d'une couche opérationnelle fonctionnelle (commandes, stock, livraison). Ce qui manquait : **une couche décisionnelle** — un tableau de bord qui répond chaque matin à la question du propriétaire :

> *"Est-ce que mon business va bien aujourd'hui ? Combien j'ai GAGNÉ (bénéfice) ? Combien j'ai dépensé ? Où en est ma dette ? Mes agents travaillent-ils bien ?"*

Ce document définit **toutes les règles de calcul** pour que l'IA puisse implémenter sans ambiguïté.

---

## ⚠️ CLARIFICATIONS FONDAMENTALES (session 14 avril 2026)

### L'objectif = BÉNÉFICE, pas CA
L'objectif mensuel du propriétaire est un **bénéfice net** de **250 000 DA / mois**, à atteindre dans 3 mois.
> ❌ L'ancien système utilisait `objectif_ca_mensuel` = 1 500 000 DA → INCORRECT
> ✅ Le nouveau système utilise `objectif_benefice_mensuel` = 250 000 DA

### Définition du bénéfice
Le bénéfice dans NajmCoiff = **Marge brute** uniquement :
```
Bénéfice = Prix de vente - Prix d'achat produit
```
- ✅ Inclus : prix de vente (`total_price` ou `item.price × qty`) − coût achat (`nc_variants.cost_price`)
- ❌ Non inclus (pour l'instant) : salaires agents, frais fixes, loyer — trop complexe à automatiser
- ❌ Non inclus : frais de livraison payés par le client (c'est du CA, pas du bénéfice)

### Calcul précis du bénéfice
Pour chaque commande confirmée avec `total_price > 0` :
```
1. Chercher items_json de la commande
2. Pour chaque item : itemsCOGS += nc_variants.cost_price[variant_id] × qty
3. Si cost_price inconnu → fallback 50% du prix de vente (estimation)
4. Normaliser COGS : cogs_final = itemsCOGS × (total_price / items_price_sum)
   (pour tenir compte des réductions/coupons)
5. Bénéfice = total_price − cogs_final
6. Taux marge = (bénéfice / total_price) × 100
```
**Couverture** : 91% des variantes actives ont `cost_price > 0` → résultat très précis.
**Commandes legacy** (Shopify importées avec `total_price = null`) → EXCLUES du calcul bénéfice.

---

## Architecture de la couche BI

```
Sources de données (Supabase)
    │
    ├── nc_orders          → commandes (récolte, confirmation, annulation, POS)
    ├── nc_suivi_zr        → livraisons (statuts ZR Express)
    ├── nc_gestion_fond    → caisse (entrées/sorties)
    ├── nc_recettes        → récettes agents
    ├── nc_po_lines        → achats fournisseurs
    ├── nc_variants        → stock valorisé (price + cost_price)
    ├── nc_page_events     → trafic boutique (sessions, UTMs)
    │
    ▼
Route API : /api/bi/dashboard     (agrège tous les KPIs)
Route API : /api/bi/config        (GET/PATCH objectifs)
Route API : /api/bi/snapshot      (sauvegarde journalière — cron 22h55)
Route API : /api/bi/daily-report  (rapport WhatsApp — cron 19h)
Route API : /api/bi/snapshots     (historique 30j pour graphiques)
    │
    ▼
Page dashboard : /dashboard/owner/bi
    │
    ▼
WhatsApp Owner : rapport automatique chaque soir
```

---

## MODULE 1 — Commandes (séparation obligatoire Boutique vs POS)

### Source : `nc_orders`
- **Filtre date** : `WHERE order_date >= 'date'T00:00:00 AND order_date <= 'date'T23:59:59 AND is_archived IS NOT TRUE`

### Séparation Boutique vs POS
Les commandes se divisent en **deux catégories distinctes** avec des logiques différentes :

| Caractéristique | Boutique en ligne | POS Comptoir |
|---|---|---|
| `order_source` | `nc_boutique` ou `online` | `pos` |
| Processus | Reçue → à confirmer par agent | Créée = confirmée + encaissée |
| `total_price` | Toujours renseigné | Toujours renseigné (via route `/api/pos/order`) |
| `confirmation_status` | `nouveau` → agent met à jour | `confirmé` (automatique) |
| `decision_status` | `en_attente` → `confirmer`/`annuler`/`modifier` | `confirmé` (automatique) |
| Encaissement | Via ZR (livraison) | Immédiat en espèces |

### KPI 1.1 — Boutique en ligne (commandes à traiter)
```
Récoltées boutique = COUNT(nc_orders)
WHERE order_source != 'pos'
  AND DATE(order_date) = $date
  AND is_archived IS NOT TRUE
```
*Ce KPI représente les leads entrants qui nécessitent une action agent.*

### KPI 1.2 — POS Comptoir (ventes du jour)
```
Ventes POS = COUNT(nc_orders)
WHERE order_source = 'pos'
  AND DATE(order_date) = $date
  AND is_archived IS NOT TRUE
```
*Les POS ne passent pas par le process de confirmation — ils sont confirmés et encaissés sur place.*

### KPI 1.3 — Commandes confirmées (boutique seulement)
**Statuts qui comptent comme "confirmé" :**
```
decision_status IN ('confirmer', 'modifier')
OR confirmation_status LIKE 'confirm%'
```
> ⚠️ `'modifier'` = commande en cours de modification mais considérée confirmée
> ⚠️ Les POS ont `confirmation_status = 'confirmé'` automatiquement — mais ils sont comptés séparément dans KPI 1.2

### KPI 1.4 — Taux de confirmation (boutique)
```
taux_confirmation = (confirmées / récoltées_boutique) × 100
```
*Objectif : > 70%*

### KPI 1.5 — CA confirmé
```
ca_confirme = SUM(total_price) des commandes confirmées du jour
```
- ✅ Précis pour `nc_boutique` et `pos` (total_price toujours renseigné)
- ❌ Les commandes Shopify legacy ont `total_price = null` → exclues automatiquement
> *Pas de renommage — "CA confirmé" est clair et adopté*

### KPI 1.6 — Panier moyen boutique
```
panier_moyen = ca_confirme / nb_confirmées
```

### KPI 1.7 — CA POS du jour
```
ca_pos = SUM(total_price) WHERE order_source = 'pos' AND DATE(order_date) = $date
```

---

## MODULE 2 — Bénéfice (KPI central)

### KPI 2.1 — Bénéfice confirmé (boutique)
```
= calcProfit(commandes_confirmées_boutique, costMap)
  → Exclut les commandes avec total_price = null (legacy)
  → Inclut uniquement order_source != 'pos' et confirmées
Taux marge attendu : 40-55% selon les produits
```

### KPI 2.2 — Bénéfice POS (encaissé sur place)
```
= calcProfit(commandes_pos_du_jour, costMap)
  → POS sont automatiquement comptés (order_source = 'pos')
  → Argent déjà dans la caisse
```

### KPI 2.3 — Bénéfice total du jour
```
benefice_total_jour = benefice_confirme + benefice_pos
```

### KPI 2.4 — Bénéfice mensuel
```
= calcProfit(toutes_confirmées_du_mois + pos_du_mois, costMap)
```

### KPI 2.5 — Progression vers objectif bénéfice mensuel
```
progression_pct = (benefice_mois / objectif_benefice_mensuel) × 100
objectif_benefice_mensuel = 250 000 DA (configurable dans nc_bi_config)
```
> ⚠️ L'objectif est le **BÉNÉFICE**, pas le CA !

### ❌ KPI SUPPRIMÉ — Bénéfice livré estimé
> Trop fragile (estimation approximative sur taux moyen). Supprimé définitivement.

---

## MODULE 3 — Livraison ZR Express

### KPI 3.1 — Colis livrés aujourd'hui
```
COUNT(nc_suivi_zr) WHERE statut_livraison ILIKE 'Livré%'
  AND date_livraison = $date
```

### KPI 3.2 — Retours aujourd'hui
```
COUNT(nc_suivi_zr) WHERE statut_livraison ILIKE '%retour%'
  AND updated_at = $date
```

### KPI 3.3 — Taux livraison 30 jours (CORRIGÉ)
> ⚠️ Ancienne formule : `livré / total_ZR` → INCORRECTE (denominator inclut des commandes pas encore finalisées)
> ✅ Nouvelle formule :
```
taux_livraison = (nb_livré_30j / nb_confirmé_30j) × 100

nb_livré_30j = COUNT(nc_suivi_zr) WHERE statut ILIKE 'Livré%'
               AND date_injection > NOW() - 30 jours

nb_confirmé_30j = COUNT(nc_orders) WHERE (confirmé) 
                  AND order_date > NOW() - 30 jours
                  AND order_source != 'pos'  ← POS ne passe pas par ZR
```
*Objectif : > 75%*

### KPI 3.4 — En transit
```
COUNT(nc_suivi_zr) WHERE statut ne contient pas 'livré' ni 'retour' ni 'encaissé'
  AND date_injection > NOW() - 30 jours
```

### KPI 3.5 — Montant récupérable ZR (NOUVEAU — remplace "montant à encaisser")
> Ce KPI montre l'argent que tu peux aller chercher chez ZR Express.

**Deux niveaux :**
```
Prêt à récupérer = SUM(order_total) WHERE statut ILIKE 'Encaiss%'
                   (ZR a collecté le cash, tu peux le récupérer maintenant)

Livré en attente = SUM(order_total) WHERE statut ILIKE 'Livré%'
                   AND statut NOT ILIKE 'Encaiss%'
                   (livré mais ZR n'a pas encore traité le paiement)
```

**Source** : Table `nc_suivi_zr` dans Supabase (mise à jour par webhooks ZR).
> ⚠️ Note technique : L'endpoint ZR API `/finances` retourne 401 — probablement une permission spéciale.
> Si ZR fournit l'accès à cet endpoint dans le futur, remplacer par les données temps réel.
> Pour l'instant : utiliser `nc_suivi_zr` qui est mis à jour par les webhooks (fiable si webhooks actifs).

### ❌ KPI SUPPRIMÉ — "Bénéfice livré estimé"
> Supprimé car trop imprécis (estimation sur taux moyen). On affiche les montants ZR bruts.

---

## MODULE 4 — Clients & Fidélité

### Source : `nc_orders.customer_phone`

### KPI 4.1 — Nouveaux clients du jour
```
COUNT(DISTINCT customer_phone) des commandes du jour
WHERE customer_phone NOT IN (
  SELECT DISTINCT customer_phone FROM nc_orders
  WHERE order_date < '$date'T00:00:00
)
```
*Définition : téléphone qui apparaît pour la PREMIÈRE fois dans tout l'historique.*

### KPI 4.2 — Clients fidèles du jour
```
COUNT(DISTINCT customer_phone) des commandes du jour
WHERE customer_phone IN (
  SELECT DISTINCT customer_phone FROM nc_orders
  WHERE order_date < '$date'T00:00:00
)
```

### KPI 4.3 — Taux fidélité
```
taux_fidelite = (clients_fideles / total_clients_jour) × 100
```
*Objectif : > 30%*

### KPI 4.4 — Panier moyen par type client
```
pm_nouveaux = SUM(total_price) des confirmées nouvelles / COUNT
pm_fidelite = SUM(total_price) des confirmées fidèles / COUNT
```

---

## MODULE 5 — Finance & Caisse

### Source : `nc_gestion_fond`, `nc_recettes`, `nc_po_lines`

### KPI 5.1 — Entrées caisse du jour
```
SUM(montant) WHERE type IN ('ENTRÉE', 'ENTREE', 'ENT%')
  AND DATE(synced_at) = $date
```

### KPI 5.2 — Sorties caisse du jour
```
SUM(montant) WHERE type = 'SORTIE'
  AND DATE(synced_at) = $date
```

### KPI 5.3 — Solde net
```
solde_net = entrees_caisse - sorties_caisse
```

### KPI 5.4 — Récettes agents déclarées
```
SUM(total_declare) FROM nc_recettes WHERE DATE(depot_timestamp) = $date
```

### KPI 5.5 — Écart caisse
```
ecart = |SUM(ecart)| FROM nc_recettes WHERE DATE(depot_timestamp) = $date
```
*Alert si > 500 DA*

### KPI 5.6 — Dette fournisseur
- **Méthode** : saisie manuelle par le propriétaire dans `nc_bi_config.dette_initiale`
- **Raison** : le propriétaire est le seul à connaître sa dette réelle (paiements partiels, crédits, accords informels)
- La dette n'est PAS calculée automatiquement depuis `nc_po_lines` (trop imprécis)

---

## MODULE 6 — Stock

### Source : `nc_variants`

### KPI 6.1 — Ruptures de stock
```
COUNT(*) WHERE status = 'active' AND inventory_quantity = 0
```

### ❌ KPI SUPPRIMÉ — "Alertes stock faible" (inventory 1-5)
> Supprimé du dashboard BI — géré dans le module stock dédié.

### KPI 6.2 — Valeur stock (prix de vente)
```
SUM(price × inventory_quantity) WHERE status = 'active'
```

### KPI 6.3 — Valeur stock (prix d'achat)
```
SUM(cost_price × inventory_quantity) WHERE status = 'active'
```

### KPI 6.4 — Marge potentielle stock
```
marge_potentielle = valeur_vente - valeur_achat
```
*Ce que tu gagnes si tu vends TOUT le stock.*

### KPI 6.5 — Taux ruptures
```
ruptures_pct = nb_ruptures / (nb_actifs_totaux) × 100
```

---

## MODULE 7 — Agents

### Source : `nc_orders` + filtre `sold_by`

### KPI par agent
```
Pour chaque agent (sold_by) :
  - Traitées = COUNT(orders WHERE sold_by = agent AND date = $date)
  - Confirmées = COUNT(WHERE confirmé)
  - Annulées = COUNT(WHERE annulé)
  - CA = SUM(total_price WHERE confirmé)
  - Taux = confirmées / traitées × 100
```

### ❌ Non inclus dans BI
Les POS sont attribués à l'agent mais ne font pas partie du "traitement" (pas de confirmation à faire).

---

## MODULE 8 — Boutique en ligne (Marketing)

### Source : `nc_page_events`

### KPI 8.1 — Visiteurs uniques
```
COUNT(DISTINCT session_id) WHERE DATE(created_at) = $date
```

### KPI 8.2 — Taux de conversion
```
taux = (nb commandes nc_boutique confirmées / visiteurs_uniques) × 100
```

### KPI 8.3 — Paniers abandonnés
```
= sessions avec event CHECKOUT_START mais sans commande dans nc_orders
```

### KPI 8.4 — Top source trafic
```
UTM source le plus fréquent dans nc_page_events du jour
```

---

## MODULE 9 — Score de Santé Business

### Calcul du score (sur 100)
Le score reflète l'état global du business. Il démarre à 100 et perd des points :

| Composant | Condition | Perte |
|---|---|---|
| Taux confirmation boutique | < 50% | -30 |
| | < 65% | -15 |
| | < 75% | -5 |
| Taux livraison 30j | < 60% | -25 |
| | < 70% | -15 |
| | < 80% | -5 |
| **Progression bénéfice** | **< 50% de l'objectif journalier** | **-20** |
| | **< 75%** | **-10** |
| | **< 90%** | **-3** |
| Taux ruptures stock | > 20% | -15 |
| | > 10% | -8 |
| | > 5% | -3 |
| Écart caisse | > 2000 DA | -10 |
| | > 500 DA | -5 |

> ⚠️ CHANGEMENT : le composant "objectif" utilise maintenant le BÉNÉFICE (pas le CA)
> `progression_benef_vs_objectif = benefice_jour / (objectif_benefice_mensuel / 30) × 100`

**Interprétation :**
- 85-100 → 🟢 Excellente santé
- 70-84  → 🟡 Quelques points à surveiller
- 50-69  → 🟠 Attention requise
- 0-49   → 🔴 Action immédiate

---

## Tables Supabase BI

### `nc_bi_config` (unique ligne id=1)
```sql
CREATE TABLE IF NOT EXISTS nc_bi_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  dette_initiale NUMERIC DEFAULT 0,
  objectif_benefice_mensuel NUMERIC DEFAULT 250000,   -- ← BÉNÉFICE (remplace objectif_ca_mensuel)
  objectif_ca_mensuel NUMERIC DEFAULT 1500000,         -- ← GARDÉ pour référence CA uniquement
  objectif_commandes_jour INTEGER DEFAULT 20,
  objectif_taux_livraison NUMERIC DEFAULT 75,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  CONSTRAINT nc_bi_config_single_row CHECK (id = 1)
);
```

### `nc_bi_daily_snapshots`
Voir DDL dans `docs/migration/SUPABASE_SQL_S6.sql`.
Colonnes clés : `snapshot_date`, `ca_confirme`, `benefice_confirme`, `benefice_pos`, `benefice_total`, `progression_benefice_pct`, `health_score`, `nouveaux_clients`, `taux_fidelite`.

---

## Routes API BI

### `GET /api/bi/dashboard?date=YYYY-MM-DD`
Retourne tous les KPIs pour la date donnée. Protégé par `ownerGuard`.

**Structure de réponse :**
```json
{
  "date": "2026-04-14",
  "health_score": 72,
  "health_status": "yellow",
  "health_message": "...",
  "orders": {
    "boutique": { "recoltes": 12, "confirmees": 9, "annulees": 2, "attente": 1, "taux_confirmation": 75.0 },
    "pos": { "ventes": 5, "ca_pos": 15000 },
    "ca_confirme": 45000,
    "panier_moyen": 5000,
  },
  "benefice": {
    "confirme": 20250,
    "taux_marge_confirme": 45.0,
    "pos": 6750,
    "taux_marge_pos": 45.0,
    "total_jour": 27000,
    "mois": 135000,
    "taux_marge_mois": 44.5,
    "objectif_mensuel": 250000,
    "progression_pct": 54
  },
  "clients": {
    "nouveaux": 8,
    "fidelite_count": 4,
    "taux_fidelite": 33.3,
    "pm_nouveaux": 4500,
    "pm_fidelite": 6200
  },
  "mensuel": {
    "ca_mois": 303000,
    "ca_mois_pos": 90000,
    "ca_mois_boutique": 213000,
    "objectif_benefice": 250000,
    "benefice_mois": 135000,
    "progression_pct": 54,
    "commandes_mois": 67
  },
  "delivery": {
    "livres_jour": 8,
    "retours_jour": 1,
    "taux_livraison_30j": 76.5,
    "en_transit": 42,
    "pret_a_recuperer": 125000,
    "livre_en_attente_zr": 87000
  },
  "finance": { "..." },
  "stock": { "..." },
  "agents": [...],
  "marketing": { "..." }
}
```

---

## Config dans `nc_bi_config`

### Champs configurables par le propriétaire
| Champ | Valeur par défaut | Description |
|---|---|---|
| `dette_initiale` | 0 | Dette fournisseur manuelle (DA) — **seul le propriétaire connaît le vrai chiffre** |
| `objectif_benefice_mensuel` | 250 000 DA | **Objectif bénéfice** — cible à 3 mois |
| `objectif_ca_mensuel` | 1 500 000 DA | Objectif CA (référence secondaire) |
| `objectif_commandes_jour` | 20 | Nb commandes/jour attendu |
| `objectif_taux_livraison` | 75 | Taux livraison cible (%) |

---

## Problèmes connus et corrections en attente

### P1 — Commandes POS legacy avec statut vide
**Symptôme** : Anciennes commandes POS ont `decision_status = ""` et `total_price = null`.
**Cause** : Créées avant que la route `/api/pos/order` soit finalisée.
**Solution** : Les nouvelles commandes POS créées via `/api/pos/order` ont `confirmation_status = 'confirmé'`, `decision_status = 'confirmé'`, `total_price = total` correctement.
**Action** : Les anciennes données legacy ne sont pas à corriger — elles sont ignorées car `total_price = null`.

### P2 — ZR API `/finances` endpoint non accessible
**Symptôme** : GET `https://api.zrexpress.app/api/v1/parcels/finances` retourne 401.
**Cause** : Endpoint protégé par une permission spéciale non documentée.
**Solution temporaire** : Utiliser `nc_suivi_zr` (mis à jour par webhooks ZR) pour calculer "prêt à récupérer" et "livré en attente".
**Action future** : Contacter ZR Express pour obtenir accès à l'endpoint treasury.

### P3 — Taux fidélité = 0% en dehors des jours actifs
**Cause** : Si peu de commandes dans l'historique, tous les clients semblent nouveaux.
**Note** : Comportement CORRECT — le système a peu d'historique pour l'instant.

---

## Roadmap d'implémentation

### Phase BI-1 (terminée ✅)
- [x] Tables `nc_bi_config` + `nc_bi_daily_snapshots` créées
- [x] Route `/api/bi/dashboard` — bénéfice réel, nouveaux clients, sources
- [x] Route `/api/bi/config` — GET/PATCH objectifs
- [x] Route `/api/bi/snapshot` — sauvegarde journalière (cron 22h55)
- [x] Route `/api/bi/daily-report` — rapport WhatsApp
- [x] Route `/api/bi/snapshots` — historique 30j
- [x] Page `/dashboard/owner/bi` — UI complète

### Phase BI-2 (en attente d'implémentation)
- [ ] Corriger le calcul taux livraison (confirmé comme dénominateur) — **formule documentée ci-dessus**
- [ ] Ajouter `objectif_benefice_mensuel` dans `nc_bi_config` (DDL + UI config)
- [ ] Remplacer progression CA → progression BÉNÉFICE dans Health Score
- [ ] Séparer l'affichage boutique vs POS dans la section commandes
- [ ] Remplacer "montant à encaisser" par "prêt à récupérer" + "livré en attente ZR"
- [ ] Supprimer "alertes stock faible" de l'UI BI
- [ ] Supprimer "bénéfice livré estimé" de l'UI BI
- [ ] Ajouter bénéfice total jour (boutique + POS)
- [ ] Ajouter `WATI_OWNER_PHONE` dans Vercel pour activer rapport WhatsApp automatique
