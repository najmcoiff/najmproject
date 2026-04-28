# META_ADS.md — Intégration Meta Marketing API + Pixels + CAPI
> version: 2.0 | updated: 2026-04-15
> Guide complet pour T14 (pixels), T21 (CAPI), et Agent 2 (Campaign Engine).
> Prérequis : Meta Business Manager avec pages FB/IG connectées.

---

## CONFIGURATION ACTIVE (IDs RÉELS — NE PAS MODIFIER)

| Élément | Valeur | Statut |
|---|---|---|
| Business Manager | NAJM COIFF — ID `301096122408704` | ✅ Actif |
| System User | new apisysteme — ID `122096713976691856` | ✅ Token permanent |
| Pixel Coiffure | `1436593504886973` — NajmCoiff Coiffure | ✅ Créé |
| Pixel Onglerie | `839178319213103` — NajmCoiff Onglerie | ✅ Créé |
| Page Facebook | **NAJM COIFF** — ID `108762367616665` ← **Utilisé pour toutes les pubs** | ✅ Active |
| Instagram | **@najm_coiff** — ID `17841442358614439` ← **Utilisé pour toutes les pubs** | ✅ Actif |
| ~~Najmcoiff team~~ | ~~ID `560687320459849`~~ — ancienne page, ne plus utiliser | ⛔ Ignorée |
| ~~Morsli atelier~~ | ~~ID `410611305468000`~~ + ~~@morsli_atelier~~ — ne jamais utiliser pour les pubs | ⛔ Ignorée |
| CAPI Token | Stocké dans `META_CAPI_TOKEN` (Vercel nc-boutique) | ✅ Configuré |
| Ad Account | **⚠️ À LIER** — voir section 6 ci-dessous | 🔴 MANQUANT |

### Variables d'environnement Vercel (nc-boutique) — ACTIVES
```
NEXT_PUBLIC_META_PIXEL_COIFFURE = 1436593504886973
NEXT_PUBLIC_META_PIXEL_ONGLERIE = 839178319213103
META_CAPI_TOKEN = EAAz4WZA... (permanent, système)
NEXT_PUBLIC_SITE_URL = https://www.najmcoiff.com
```

### CAPI — Test validé ✅
```
events_received: 1 | fbtrace_id: A3XuCMk0489eEFut4zpxWK8
Pixel Coiffure répond correctement aux événements server-side.
```

---

---

## 1. Configuration pixels (T14) — ✅ TERMINÉ

### Deux pixels séparés (H7 — règle inviolable)

| Monde | Pixel ID | Variable d'env | Usage |
|---|---|---|---|
| Coiffure | `1436593504886973` | `NEXT_PUBLIC_META_PIXEL_COIFFURE` | Tracking coiffure uniquement |
| Onglerie | `839178319213103` | `NEXT_PUBLIC_META_PIXEL_ONGLERIE` | Tracking onglerie uniquement |

### Implémentation côté client (`nc-boutique/app/layout.js`)

```javascript
// Injecter le pixel correspondant au monde sélectionné
// Le monde est stocké dans sessionStorage('nc_world')

function getPixelId(world) {
  if (world === 'onglerie') return process.env.NEXT_PUBLIC_META_PIXEL_ONGLERIE;
  return process.env.NEXT_PUBLIC_META_PIXEL_COIFFURE;
}
```

### Script pixel dans le `<head>`

```html
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', 'PIXEL_ID_ICI');
fbq('track', 'PageView');
</script>
```

### Mapping événements → pixel

| Événement interne (nc_page_events) | Événement Meta Pixel | Paramètres |
|---|---|---|
| `PAGE_VIEW` | `PageView` | — |
| `PRODUCT_VIEW` | `ViewContent` | content_ids, content_type, value, currency |
| `CART_ADD` | `AddToCart` | content_ids, content_type, value, currency |
| `CHECKOUT_START` | `InitiateCheckout` | content_ids, num_items, value, currency |
| `ORDER_PLACED` | `Purchase` | content_ids, value, currency, order_id |
| `SEARCH` | `Search` | search_string |

### Déduplication pixel ↔ CAPI

Chaque événement doit inclure un `event_id` unique pour permettre la déduplication :

```javascript
const eventId = `${sessionId}_${eventType}_${Date.now()}`;
fbq('track', 'ViewContent', { ... }, { eventID: eventId });
// Le même eventId est envoyé côté serveur via CAPI
```

---

## 2. Conversions API (CAPI) — T21

### Pourquoi CAPI ?

- Les adblockers bloquent le pixel JS (~30% des utilisateurs)
- CAPI envoie les événements depuis le serveur → 100% fiabilité
- Meta pondère mieux les campagnes avec pixel + CAPI
- Obligatoire pour le matching avancé (email, phone hash)

### Variables d'environnement

```
META_CAPI_TOKEN=EAA...     # System User Token (permanent)
META_PIXEL_ID_COIFFURE=... # Même ID que le pixel client
META_PIXEL_ID_ONGLERIE=... # Même ID que le pixel client
```

### Endpoint CAPI

```
POST https://graph.facebook.com/v21.0/{pixel_id}/events
```

### Implémentation dans `track-event/route.js`

Ajouter l'envoi CAPI en parallèle de l'insert `nc_page_events` :

```javascript
async function sendCAPI(pixelId, eventName, eventData, userData) {
  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventData.event_id,
      event_source_url: eventData.page_url,
      action_source: "website",
      user_data: {
        client_ip_address: eventData.client_ip,
        client_user_agent: eventData.user_agent,
        ph: userData.phone_hash || null,    // SHA-256 du téléphone
        external_id: userData.session_id,
        country: ["dz"],
      },
      custom_data: {
        content_ids: eventData.content_ids || [],
        content_type: "product",
        value: eventData.value || 0,
        currency: "DZD",
        order_id: eventData.order_id || null,
      },
    }],
    access_token: process.env.META_CAPI_TOKEN,
  };

  return fetch(
    `https://graph.facebook.com/v21.0/${pixelId}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}
```

### Sélection du pixel par monde

```javascript
function getPixelForWorld(world) {
  if (world === "onglerie") return process.env.META_PIXEL_ID_ONGLERIE;
  return process.env.META_PIXEL_ID_COIFFURE;
}
```

---

## 3. Meta Marketing API (Agent 2)

### Prérequis

| Élément | Comment obtenir |
|---|---|
| App ID | Meta for Developers → créer une app Business |
| System User Token | Business Manager → System Users → Generate Token |
| Ad Account ID | Business Manager → Ad Accounts → copier l'ID (format: act_XXXXX) |
| Page ID | Business Manager → Pages → copier l'ID |

### Variables d'environnement

```
META_MARKETING_TOKEN=EAA...     # System User Token (permanent)
META_AD_ACCOUNT_ID=act_XXXXX    # ID du compte publicitaire
META_PAGE_ID_COIFFURE=XXXXX     # Page Facebook coiffure
META_PAGE_ID_ONGLERIE=XXXXX     # Page Facebook onglerie (si séparée)
```

### Créer une campagne

```
POST https://graph.facebook.com/v21.0/act_{ad_account_id}/campaigns
```

```json
{
  "name": "NajmCoiff - Best Sellers Coiffure - Auto",
  "objective": "OUTCOME_SALES",
  "status": "PAUSED",
  "special_ad_categories": [],
  "access_token": "..."
}
```

### Créer un Ad Set (audience + budget)

```
POST https://graph.facebook.com/v21.0/act_{ad_account_id}/adsets
```

```json
{
  "name": "Retargeting Coiffure 7j",
  "campaign_id": "{campaign_id}",
  "daily_budget": 100,
  "billing_event": "IMPRESSIONS",
  "optimization_goal": "OFFSITE_CONVERSIONS",
  "targeting": {
    "geo_locations": { "countries": ["DZ"] },
    "custom_audiences": [{ "id": "{audience_id}" }]
  },
  "status": "ACTIVE",
  "access_token": "..."
}
```

### Créer une audience personnalisée

```
POST https://graph.facebook.com/v21.0/act_{ad_account_id}/customaudiences
```

**Audience de visiteurs (pixel) :**
```json
{
  "name": "Visiteurs Coiffure 30j",
  "subtype": "WEBSITE",
  "rule": {
    "inclusions": {
      "operator": "or",
      "rules": [{
        "event_sources": [{ "id": "{pixel_id}", "type": "pixel" }],
        "retention_seconds": 2592000,
        "filter": {
          "operator": "and",
          "filters": [{ "field": "url", "operator": "i_contains", "value": "coiffure" }]
        }
      }]
    }
  },
  "access_token": "..."
}
```

**Audience de clients (upload téléphone) :**
```json
{
  "name": "Clients Coiffure Existants",
  "subtype": "CUSTOM",
  "customer_file_source": "USER_PROVIDED_ONLY",
  "access_token": "..."
}
```

Puis upload des données :
```
POST https://graph.facebook.com/v21.0/{audience_id}/users
```

```json
{
  "payload": {
    "schema": ["PHONE"],
    "data": [
      ["e3b0c44298fc1c149afbf4c8996fb924..."],
      ["..."]
    ]
  },
  "access_token": "..."
}
```

### Lookalike

```
POST https://graph.facebook.com/v21.0/act_{ad_account_id}/customaudiences
```

```json
{
  "name": "Lookalike Meilleurs Clients Coiffure",
  "subtype": "LOOKALIKE",
  "origin_audience_id": "{custom_audience_id}",
  "lookalike_spec": {
    "type": "similarity",
    "country": "DZ",
    "ratio": 0.02
  },
  "access_token": "..."
}
```

### Récupérer les métriques d'une campagne

```
GET https://graph.facebook.com/v21.0/{campaign_id}/insights
  ?fields=impressions,clicks,spend,actions,action_values,cpc,cpm,ctr
  &date_preset=last_7d
  &access_token=...
```

---

## 4. Client Meta API (`lib/meta-ads.js`)

```javascript
const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

async function metaRequest(endpoint, method = "GET", body = null) {
  const url = `${META_BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: { "Content-Type": "application/json" },
  };

  if (body) {
    body.access_token = process.env.META_MARKETING_TOKEN;
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url + (method === "GET" ? `&access_token=${process.env.META_MARKETING_TOKEN}` : ""), options);
  const data = await res.json();

  if (data.error) {
    throw new Error(`Meta API: ${data.error.message} (code ${data.error.code})`);
  }
  return data;
}
```

---

## 5. Budget et limites

### Limites de l'API

| Limite | Valeur |
|---|---|
| Appels API/heure | 200 par ad account |
| Budget minimum/jour | 100 DA (~0.60$) par ad set |
| Audiences max | 500 par ad account |
| Campagnes actives max | 1000 par ad account |

### Plafonds NajmCoiff (NEW-M2)

| Paramètre | Valeur | Justification |
|---|---|---|
| Budget quotidien max total | 5 000 DA (~30$) | Phase de test |
| Budget par campagne/jour | 500-1 500 DA | Selon le type |
| Campagnes actives simultanées | max 10 | Contrôle qualité |
| Dépassement budget autorisé | 150% du paramétré | Jamais au-delà |

---

## 6. Étapes owner pour la configuration

### Étape 1 : Créer les pixels (10 min)

1. Aller sur https://business.facebook.com/events_manager
2. Cliquer "Connecter des sources de données" → "Web" → "Meta Pixel"
3. Nommer le premier pixel "NajmCoiff Coiffure"
4. Répéter pour "NajmCoiff Onglerie"
5. Copier les deux Pixel IDs → les envoyer à l'IA

### Étape 2 : Créer un System User Token (15 min)

1. Business Manager → Paramètres → System Users
2. Ajouter un System User (type Admin)
3. Assigner les assets : Ad Account + Pages + Pixels
4. Générer un token avec les permissions :
   - `ads_management`
   - `ads_read`
   - `business_management`
   - `pages_read_engagement`
5. Copier le token → le fournir comme `META_MARKETING_TOKEN`

### Étape 3 : Lier le compte publicitaire au BM `301096122408704` 🔴 BLOQUANT

1. Aller sur https://business.facebook.com/settings/ad-accounts?business_id=301096122408704
2. Cliquer "Ajouter" → "Demander l'accès à un compte pub existant" ou "Créer un nouveau compte"
3. Copier l'ID obtenu (format `act_XXXXXXXXXX`)
4. L'envoyer à l'IA → elle configure `META_AD_ACCOUNT_ID` et active Agent 2

**Sans ce compte pub, les campagnes Meta restent bloquées.**
