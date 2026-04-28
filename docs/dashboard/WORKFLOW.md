# NajmCoiff — Workflow Métier & Routine Agents

> Ce fichier explique le **POURQUOI** du système.
> Pour le COMMENT technique → `ARCHITECTURE.md` et `AGENTS.md`.
> **Lire avant toute correction de bug ou nouvelle fonctionnalité.**

---

## Contexte métier

NajmCoiff est une boutique e-commerce de coiffure et cosmétiques (Algérie).
Les commandes arrivent via Shopify. Des agents traitent ces commandes manuellement chaque jour.
La livraison est assurée par **ZR Express** (injection API → colis → tracking).

---

## Routine journalière des agents

### Matin — Suivi + Confirmation + Préparation (EN PARALLÈLE)

```
[Agent Confirmation]                    [Agent Préparation]
        │                                       │
  Ouvre /dashboard/confirmation          Ouvre /dashboard/preparation
  Voit les commandes "nouveau"           Voit les commandes à préparer
  Appelle le client                      COMMENCE À PRÉPARER même avant confirmation
  Vérifie adresse + produits             (les 2 sont indépendants)
  Peut modifier les articles             │
        │                                │
  Confirme → statut "confirmé"           │
  ou Annule → statut "annulé"            │
```

> **Important** : Préparation et confirmation sont INDÉPENDANTES.
> Un agent peut commencer à préparer une commande avant qu'elle soit officiellement confirmée.
> C'est le soir que les deux flux se rejoignent.

### Soir — Injection ZR + Clôture

```
[Agent Senior]
      │
  Ouvre /dashboard/operations
  Lance injection ZR pour TOUTES les commandes confirmées
      → /api/inject/batch
      → Crée les colis dans ZR Express (API)
      → Imprime les bordereaux (étiquettes de livraison)
      → Met le numéro de tracking dans nc_orders + nc_suivi_zr
      │
  Ouvre /dashboard/cloture (ou bouton Clôturer)
      → /api/cloture
      → Annule automatiquement dans Shopify toutes les commandes NON-confirmées
      → Archive les commandes traitées
      → Génère le rapport de la journée
```

---

## Cycle de vie d'une commande

```
Shopify (client commande)
         │
         ▼ (webhook Shopify → /api/webhooks/shopify)
    nc_orders INSERT
    confirmation_status = "nouveau"
    decision_status     = "en_attente"
         │
         ├─ Agent confirme ──────────────────────────────────────────────┐
         │    • Appelle le client                                         │
         │    • Peut modifier les articles (/api/gas MODIFY_ORDER)       │
         │    • confirmation_status → "confirmé"                          │
         │    • contact_status → "joignable"                             │
         │                                                                │
         ├─ Agent annule ────────────────────────────────────────────────┤
         │    • confirmation_status → "annulé"                            │
         │    • cancellation_reason → (motif)                            │
         │    • Soir : annulation Shopify auto (bouton Clôture)          │
         │    • Retour au stock physique (magasin)                        │
         │                                                                │
         └─ Soir : commandes confirmées ────────────────────────────────►│
                   Injection ZR Express                                   │
                   → tracking_number assigné dans nc_suivi_zr            │
                   → statut "injecté"                                    │
                   → Bordereau imprimé                                   │
                                                                          │
                        Livraison ZR Express (J+1 à J+3)                │
                        Webhook ZR → /api/webhooks/zr                    │
                        → nc_suivi_zr UPDATE statut                      │
                        → "livré" / "retourné"                           │
```

---

## Pages du dashboard — ce que fait chaque page

### `/dashboard/confirmation`
**Rôle** : Agent appelle les clients pour confirmer les commandes.
**Tables** : `nc_orders` (lecture + PATCH)
**Actions** :
- Voir commandes "nouveau" → filtres par wilaya/statut
- Confirmer → `confirmation_status: "confirmé"` + log `CONFIRMATION_STATUS`
- Annuler → `confirmation_status: "annulé"` + `cancellation_reason` + log
- Modifier une commande → `/api/gas (MODIFY_ORDER)` → Draft Order Shopify

### `/dashboard/preparation`
**Rôle** : Agent prépare physiquement les colis.
**Tables** : `nc_orders`
**Actions** :
- Voir commandes à préparer (confirmées ou en attente)
- Marquer "préparé" → `decision_status: "préparé"`

### `/dashboard/operations`
**Rôle** : Agent senior injecte les commandes vers ZR Express.
**Tables** : `nc_orders`, `nc_suivi_zr`, `nc_events`
**Actions** :
- Injection individuelle → `/api/inject/single`
- Injection en batch → `/api/inject/batch`
- Injection manuelle (si ZR bug) → `/api/inject/manuel` → juste le tracking, pas de vrai colis
- Imprimer bordereaux

### `/dashboard/suivi-zr`
**Rôle** : Suivi des colis en transit.
**Tables** : `nc_suivi_zr`
**Actions** :
- Voir statuts ZR (en transit, livré, retourné)
- Forcer une mise à jour tracking → ZR API

### `/dashboard/barrage`
**Rôle** : Vérifier le stock et éviter les ruptures.
**Pourquoi c'est critique** : Shopify peut afficher du stock disponible alors que le stock physique est zéro (décalage positif). Résultat : client commande → agent appelle → rupture → frustrant.
**Tables** : `nc_barrage`, `nc_variants`
**Actions** :
- Voir les produits proches de rupture (seuil barrage)
- Lancer la vérification → `/api/barrage/run`
  → Compare stock Shopify réel vs stock cible
  → Met à jour l'inventaire Shopify si décalage

### `/dashboard/stock`
**Rôle** : Vue globale du stock (articles jamais vendus, KPI achats).
**Tables** : `nc_variants`, `nc_kpi_stock`

### `/dashboard/rapport`
**Rôle** : Agent soumet son rapport de fin de journée.
**Tables** : `nc_rapports`, `nc_events`
**Actions** :
- Saisir le rapport → INSERT `nc_rapports` + log `RAPPORT_SOUMIS`

### `/dashboard/finance`
**Rôle** : Gestion de la caisse et des recettes.
**Tables** : `nc_gestion_fond`, `nc_recettes`
**Actions** :
- Voir solde caisse
- RAZ caisse → `/api/fond/reset`
- Voir recettes journalières

### `/dashboard/logs`
**Rôle** : Historique complet de toutes les actions.
**Tables** : `nc_events` (lecture seule)
**Filtre** : par agent, par type d'action, par date

### `/dashboard/admin`
**Rôle** : Gestion des utilisateurs agents.
**Tables** : `nc_users`
**Actions** : Créer/désactiver agents → `/api/admin/users`

### `/dashboard/organisation`
**Rôle** : Gestion des quotas agents.
**Tables** : `nc_quota`, `nc_quota_orders`
**Actions** : Générer les quotas → `/api/quota/generate`

---

## Barrage — logique détaillée

Le "barrage" est le mécanisme anti-rupture de stock.

**Problème** : Shopify peut montrer du stock disponible alors que le stock physique est 0.
Cela arrive à cause des décalages (commandes annulées remises en stock Shopify mais pas physiquement).

**Solution** :
1. `nc_barrage` contient les seuils cibles par produit
2. `/api/barrage/run` compare stock Shopify vs seuil
3. Si stock Shopify > seuil cible → on BLOQUE le surplus dans Shopify (inventory set)
4. Résultat : le client ne peut plus commander ce qui n'existe pas physiquement

---

## Injection ZR Express — logique détaillée

**Normal** : `/api/inject/single` ou `/api/inject/batch`
→ Appel API ZR → ZR crée le colis → retourne tracking_number
→ On sauvegarde tracking dans `nc_suivi_zr` + `nc_orders.tracking`
→ Webhook ZR `/api/webhooks/zr` met à jour le statut automatiquement

**Manuel** (quand ZR API bug) : `/api/inject/manuel`
→ Agent saisit manuellement le tracking
→ On enregistre dans `nc_suivi_zr` sans appel API ZR
→ Utiliser seulement en cas de panne ZR

---

## Modification de commande — logique détaillée

**Quand** : Client appelle pour changer un article, ou agent détecte une erreur.

**Flux** :
1. `/dashboard/confirmation` → bouton "Modifier"
2. → `/api/orders/for-modify` → récupère les line items Shopify
3. → Agent modifie les quantités dans l'UI
4. → `/api/gas (MODIFY_ORDER)` → GAS → `_modifyOrder_()` dans `🌐DASHBOARD API.js`
5. → GAS : fetchOriginalOrder → createDraftOrder → completeDraftOrder → cancelOldOrder
6. → Nouvelle commande créée dans Shopify avec les bons articles
7. → Ancienne commande annulée
8. → `nc_orders` mis à jour (ancienne commande → "annulé", nouvelle commande insérée via webhook)

**Attention** : La modification crée une NOUVELLE commande Shopify.
L'ancienne est annulée. Le nc_orders.order_id change.

---

## Log des actions — comment ça marche

**Tout passe par** `lib/logsv2.js` (côté client) → `POST /api/log` → `nc_events` (Supabase)

**Diagnostic si un log ne se lance pas** :
1. Vérifier que `SUPABASE_SERVICE_ROLE_KEY` est bien configuré dans Vercel env vars
2. Vérifier dans Vercel logs : `/api/log` retourne-t-il une erreur ?
3. Vérifier que la page importe bien `logsv2.js` et appelle la bonne fonction
4. Regarder dans `nc_events` si le log est arrivé quand même

**Fonctions de log disponibles dans `lib/logsv2.js`** :
- `logConfirmationStatus(agent, orderId, ancien, nouveau, contact, reason)`
- `logZRInjection(agent, orderId, tracking, wilaya)`
- `logRapport(agent, ...)`
- `logBarrage(agent, ...)`
- Ajouter d'autres si besoin

---

## Diagostic rapide bug (protocole IA)

Quand un bouton ne fonctionne pas, suivre ce protocole :

```
1. Quel est le message d'erreur exact dans la console browser ?
   → Chercher dans AGENTS.md la route appelée
   → Lire le fichier de la route

2. La route retourne quel HTTP status ?
   → 401 → problème de token (session expirée ?)
   → 404 → route inexistante ou table Supabase absente
   → 405 → méthode HTTP incorrecte (GET vs POST)
   → 500 → erreur dans le code → lire le message error

3. Si erreur Supabase :
   → "column X does not exist" → mauvais nom de colonne (voir AGENTS.md § Tables)
   → "table X not found"       → table à créer (SQL via management API)
   → "violates unique constraint" → doublon (order_id déjà présent ?)

4. Si erreur GAS :
   → Vérifier via : POST GAS_URL {"source":"DASHBOARD","action":"PING"}
   → Si HTML en retour → GAS a besoin d'être redéployé (npx clasp push + deploy)

5. Si log manquant :
   → Vérifier SUPABASE_SERVICE_ROLE_KEY dans Vercel dashboard
   → Regarder Vercel logs pour /api/log
```

---

*Mis à jour : 2026-04-10 — S7*
