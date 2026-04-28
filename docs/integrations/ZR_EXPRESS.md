# ZR Express — Documentation Intégration (API officielle)
> version: 2.0 | updated: 2026-04-12
> Source : documentation officielle ZR Express API v1
> Espace fournisseurs : https://api.zrexpress.app

---

## Identifiants & Authentification

| Variable | Description | Où configurer |
|---|---|---|
| `ZR_API_KEY` | Clé API ZR Express (format `secretKey`) | Vercel → Settings → Env Vars (vercel-quick ET nc-boutique) |
| `ZR_TENANT_ID` | ID du tenant NajmCoiff (UUID) | Vercel → Settings → Env Vars (vercel-quick uniquement) |

### Comment générer une clé API
```
POST https://api.zrexpress.app/api/v1/users/keys
Content-Type: application/json

{
  "name": "NajmCoiff Production",
  "expiresInDays": 365
}
```
**Réponse :**
```json
{
  "secretKey": "...",
  "tenantId": "a5507e8b-7615-4d0d-b356-f13241774752",
  "createdAt": "2026-01-05T13:54:15.083Z",
  "expireInDays": 365
}
```

### Header d'authentification (TOUTES les requêtes)
```
Authorization: Bearer {ZR_API_KEY}
X-Tenant: {ZR_TENANT_ID}
Content-Type: application/json
```

---

## Endpoints utilisés par NajmCoiff

### 1. Créer un colis (injection)
```
POST https://api.zrexpress.app/api/v1/parcels
```

**Body :**
```json
{
  "customer": {
    "name": "Prénom Nom du client",
    "phone": {
      "number1": "06XXXXXXXX",
      "number2": null,
      "number3": null
    }
  },
  "deliveryAddress": {
    "cityTerritoryId": "UUID_WILAYA",
    "districtTerritoryId": "UUID_COMMUNE",
    "street": "Adresse libre (optionnel)"
  },
  "deliveryType": "home",
  "description": "NajmCoiff - Commande NC-XXXXXX",
  "amount": 5000,
  "externalId": "NC-XXXXXX",
  "orderedProducts": [
    {
      "productName": "Nom article",
      "productSku": "SKU123",
      "unitPrice": 5000,
      "quantity": 1,
      "stockType": "local"
    }
  ]
}
```

> ⚠️ `cityTerritoryId` et `districtTerritoryId` sont des **UUIDs ZR Express**, pas les noms de wilaya/commune.
> Utiliser `/api/v1/territories/search` pour les obtenir (voir §Territoires).

**Réponse succès (201) :**
```json
{ "id": "UUID_DU_COLIS" }
```
> Le `trackingNumber` n'est pas retourné ici — faire un `GET /parcels/{id}` pour l'obtenir.

**`deliveryType` acceptés :**
- `home` → livraison à domicile
- `pickup-point` → point relais / bureau

---

### 2. Récupérer un colis par trackingNumber
```
GET https://api.zrexpress.app/api/v1/parcels/{trackingNumber}
```

**Réponse (200) — champs utiles pour nc-boutique :**
```json
{
  "id": "UUID",
  "trackingNumber": "ZR-XXXXX",
  "deliveryType": "home",
  "amount": 5000,
  "deliveryPrice": 400,
  "state": {
    "id": "UUID_STATE",
    "name": "En transit",
    "isBlocking": false
  },
  "situation": {
    "name": "string",
    "slug": "string"
  },
  "deliveryAddress": {
    "city": "Alger",
    "district": "Bab Ezzouar"
  },
  "lastStateUpdateAt": "2026-01-07T23:19:24.027Z"
}
```

---

### 3. Historique des statuts d'un colis
```
GET https://api.zrexpress.app/api/v1/parcels/{parcelId}/state-history
```

Retourne un tableau d'événements avec `previousState`, `newState`, `createdAt`, `location`.

---

### 4. Supprimer un colis (avant expédition)
```
DELETE https://api.zrexpress.app/api/v1/parcels/{id}
```
Retourne `{ "id": "UUID" }`.

---

### 5. Générer étiquettes PDF (batch)
```
POST https://api.zrexpress.app/api/v1/parcels/labels/multiple/pdf

{
  "trackingNumbers": ["ZR-XXXXX", "ZR-YYYYY"],
  "format": "A6"
}
```
**Réponse :** `{ "fileUrl": "https://...", "failedTrackingNumbers": [] }`

Max 250 colis. Formats : `A4` (4 étiquettes/page) ou `A6` (1 étiquette/page).

---

### 6. Modifier les infos d'un colis (client ou adresse)
```
PATCH https://api.zrexpress.app/api/v1/parcels/{id}/customer
PATCH https://api.zrexpress.app/api/v1/parcels/{id}/deliveryAddress
PATCH https://api.zrexpress.app/api/v1/parcels/{id}/amount
```

---

## Territoires (Wilaya / Commune)

Les wilaya et communes utilisent des **UUIDs ZR Express** (pas les codes 1-58).

### Rechercher les territoires
```
POST https://api.zrexpress.app/api/v1/territories/search

{
  "keyword": "Alger",
  "pageSize": 50,
  "pageNumber": 1
}
```
**Réponse :**
```json
{
  "items": [
    {
      "id": "UUID_WILAYA",
      "code": 16,
      "name": "Alger",
      "level": "city",
      "delivery": { "hasHomeDelivery": true, "hasPickupPoint": true }
    }
  ]
}
```

> **`level`** : `city` = wilaya, `district` = commune/daïra.
> Les communes ont `parentId` = UUID de leur wilaya.

### Stratégie d'utilisation dans NajmCoiff
Les `cityTerritoryId` et `districtTerritoryId` doivent être stockés dans `nc_delivery_config` avec les UUIDs ZR correspondants pour chaque wilaya/commune.

```sql
-- Colonnes à ajouter à nc_delivery_config si besoin
ALTER TABLE nc_delivery_config
  ADD COLUMN IF NOT EXISTS zr_city_territory_id TEXT,
  ADD COLUMN IF NOT EXISTS zr_district_territory_id TEXT;
```

---

## Prix de livraison ZR (API directe)

```
GET https://api.zrexpress.app/api/v1/delivery-pricing/rates/{toTerritoryId}
```
**Réponse :**
```json
{
  "toTerritoryId": "UUID",
  "toTerritoryName": "Alger",
  "deliveryPrices": [
    { "deliveryType": "home", "price": 400 },
    { "deliveryType": "pickup-point", "price": 300 }
  ]
}
```

> Les prix ZR prennent automatiquement en compte les tarifs fournisseur-spécifiques.

---

## Webhooks ZR Express (Svix)

Les webhooks ZR utilisent **Svix** pour l'envoi et la signature.

### Configuration webhook endpoint
```
POST https://api.zrexpress.app/api/v1/webhooks/endpoints

{
  "url": "https://najmcoiffdashboard.vercel.app/api/webhooks/zr",
  "description": "NajmCoiff prod webhook",
  "eventTypes": ["parcel.state.updated", "parcel.delivered", "parcel.returned"]
}
```

### Récupérer le secret de signature (pour vérifier les webhooks)
```
GET https://api.zrexpress.app/api/v1/webhooks/endpoints/{endpointId}/secret
```
Retourne `{ "secret": "..." }` → stocker dans les env vars Vercel.

### Vérification de signature côté NajmCoiff
La signature Svix arrive dans les headers :
```
svix-id: ...
svix-timestamp: ...
svix-signature: v1,...
```
Utiliser la lib `svix` pour vérifier :
```js
import { Webhook } from 'svix';
const wh = new Webhook(process.env.ZR_WEBHOOK_SECRET);
const evt = wh.verify(body, headers);
```

---

## Webhook ZR → NajmCoiff

**Endpoint récepteur :** `POST /api/webhooks/zr` (dans `vercel-quick`)

**Fichier :** `vercel-quick/app/api/webhooks/zr/route.js`

### Événements reçus et actions

| Event type | Action dans nc_orders | Données stockées |
|---|---|---|
| `parcel.state.updated` | `status` mis à jour | Log dans `nc_suivi_zr` |
| `parcel.delivered` | `status = 'livré'`, `last = true` | Log + event `nc_events` |
| `parcel.returned` | `status = 'retour'` | Log + alerte agent |

---

## Routes Vercel NajmCoiff utilisant ZR

| Route | Fichier | Usage |
|---|---|---|
| `POST /api/inject/single` | `vercel-quick/app/api/inject/single/route.js` | Créer 1 colis ZR + stocker trackingNumber |
| `POST /api/inject/batch` | `vercel-quick/app/api/inject/batch/route.js` | Injection en masse (anti-doublon via `zr_locked`) |
| `POST /api/webhooks/zr` | `vercel-quick/app/api/webhooks/zr/route.js` | Réception mises à jour statut (Svix) |
| `GET /api/boutique/track/[id]` | `nc-boutique/app/api/boutique/track/[id]/route.js` | Suivi public client (lit `nc_suivi_zr`) |
| `POST /api/po/labels` | `vercel-quick/app/api/po/labels/route.js` | Génération PDF étiquettes |

---

## Données stockées dans Supabase

### Table `nc_suivi_zr`
| Colonne | Type | Description |
|---|---|---|
| `order_id` | TEXT | Référence `nc_orders.id` |
| `tracking` | TEXT | `trackingNumber` ZR (ex: `ZR-12345`) |
| `status` | TEXT | Statut courant (state.name) |
| `raw_payload` | JSONB | Payload brut du webhook |
| `created_at` | TIMESTAMPTZ | Date création/mise à jour |

### Colonne `zr_locked` dans `nc_orders`
Évite les doubles injections :
```js
if (order.zr_locked) return { error: 'Déjà injecté' }
// Après injection réussie :
await supabase.from('nc_orders').update({ zr_locked: true }).eq('id', order.id)
```

---

## Gestion des erreurs courantes

| Scénario | Code HTTP | Comportement recommandé |
|---|---|---|
| `zr_locked = true` | — | Bloquer côté NajmCoiff, retourner trackingNumber existant |
| UUID territoire invalide | 400 | Log erreur, notifier agent pour correction adresse |
| API ZR down | 503 | Retry x3 avec backoff exponentiel, log dans `nc_events` |
| Token expiré | 401 | Régénérer via `POST /api/v1/users/keys`, mettre à jour Vercel env |
| Signature Svix invalide | — | `HTTP 401`, log + ignorer le payload |
| Colis non trouvé | 404 | Afficher "Suivi en cours de traitement" côté client |

---

## Variables d'environnement requises

```bash
# vercel-quick
ZR_API_KEY=secretKey_generee_via_api
ZR_TENANT_ID=a5507e8b-7615-4d0d-b356-f13241774752  # UUID tenant NajmCoiff
ZR_WEBHOOK_SECRET=secret_endpoint_svix              # GET /webhooks/endpoints/{id}/secret

# nc-boutique (lecture suivi seulement)
ZR_API_KEY=secretKey_generee_via_api
```
