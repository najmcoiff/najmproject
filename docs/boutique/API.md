# API.md — Routes nc-boutique
> version: 1.0 | updated: 2026-04-11 | status: DONE
> Contrat complet de toutes les routes API de nc-boutique.
> Base URL production : `https://nc-boutique.vercel.app`

---

## GET /api/boutique/products

**Rôle :** Retourne la liste des produits actifs depuis `nc_variants`.

**Query params :**
| Param | Type | Obligatoire | Description |
|---|---|---|---|
| `category` | string | Non | Filtrer par collection (ex: `مشط`) |
| `search` | string | Non | Recherche texte dans `product_title` |
| `sort` | string | Non | `price_asc`, `price_desc`, `stock_desc` (défaut) |
| `limit` | integer | Non | Nombre de résultats (défaut: 20, max: 100) |
| `offset` | integer | Non | Pagination (défaut: 0) |
| `world` | string | Non | `coiffure` ou `onglerie` (filtre par monde) |

**Réponse succès (200) :**
```json
{
  "products": [
    {
      "variant_id": "51649987313960",
      "product_id": "9384065728808",
      "product_title": "Papier bleu frams",
      "vendor": "FRAMS",
      "price": 900,
      "compare_at_price": null,
      "inventory_quantity": 19,
      "sku": "PAP-BLEU-001",
      "image_url": "https://cdn.shopify.com/...",
      "display_name": "Papier bleu frams",
      "collections": ["مستحضرات وكوسميتيك"],
      "is_new": false
    }
  ],
  "pagination": {
    "total": 1200,
    "limit": 20,
    "offset": 0
  }
}
```

**Réponse erreur (500) :**
```json
{ "error": "Erreur base de données" }
```

**Notes :**
- Filtre automatique : `inventory_quantity > 0` et `status = 'active'`
- `compare_at_price` = null si pas de promotion (colonne à migrer depuis Shopify)

---

## GET /api/boutique/products/[slug]

**Rôle :** Retourne un produit unique par SKU, product_id ou titre.

**Params URL :** `slug` = SKU du produit OU product_id Shopify

**Réponse succès (200) :**
```json
{
  "product_id": "9384065728808",
  "product_title": "Papier bleu frams",
  "vendor": "FRAMS",
  "collections": ["مستحضرات وكوسميتيك"],
  "image_url": "https://cdn.shopify.com/...",
  "slug": "9384065728808",
  "variants": [
    {
      "variant_id": "51649987313960",
      "variant_title": "Default Title",
      "display_name": "Papier bleu frams",
      "price": 900,
      "inventory_quantity": 19,
      "sku": "PAP-BLEU-001",
      "barcode": "123456789",
      "image_url": "https://cdn.shopify.com/..."
    }
  ]
}
```

**Réponse erreur (404) :**
```json
{ "error": "Produit non trouvé" }
```

**Bug connu :** Recherche par `product_id` (numérique) retourne 0 résultats — voir `TROUBLESHOOT.md`.

---

## POST /api/boutique/order

**Rôle :** Crée une commande. Vérifie le stock, applique le code partenaire, génère le numéro NC-.

**Body (JSON) :**
```json
{
  "items": [
    { "variant_id": "51649987313960", "qty": 1, "price": 900, "title": "Papier bleu frams" }
  ],
  "customer": {
    "first_name": "Mohamed",
    "last_name": "Salah",
    "phone": "0551234567",
    "wilaya": "Alger",
    "commune": "Bab El Oued",
    "delivery_type": "home"
  },
  "delivery_price": 400,
  "session_id": "uuid-v4",
  "idempotency_key": "uuid-v4-unique",
  "coupon_code": "PARTNER10",
  "utm": {
    "utm_source": "facebook",
    "utm_medium": "cpc",
    "utm_campaign": "promo_avril"
  }
}
```

**Réponse succès (201) :**
```json
{
  "order_id": "uuid",
  "order_name": "NC-260411-0001",
  "total": 1300,
  "status": "pending"
}
```

**Réponses erreur :**
| Code | Message | Cause |
|---|---|---|
| 400 | "Données manquantes" | Champ obligatoire absent |
| 400 | "Téléphone invalide" | Format non algérien |
| 409 | "Commande déjà existante" | Idempotency key déjà utilisée |
| 422 | "Stock insuffisant pour [produit]" | Stock épuisé entre ajout panier et commande |
| 500 | "Erreur création commande" | Erreur DB |

**Effets de bord :**
1. INSERT dans `nc_orders` (`order_source = 'nc_boutique'`)
2. INSERT dans `nc_page_events` (`event_type = 'ORDER_PLACED'`)
3. INSERT dans `nc_events` (`log_type = 'BOUTIQUE_ORDER_PLACED'`)
4. Push notification vers tous les agents dashboard

---

## GET /api/boutique/track/[id]

**Rôle :** Suivi public d'une commande par numéro NC- ou UUID.

**Params URL :** `id` = `NC-260411-0001` ou UUID de la commande

**Réponse succès (200) :**
```json
{
  "order_name": "NC-260411-0001",
  "status": "confirmed",
  "items": [...],
  "total": 1300,
  "wilaya": "Alger",
  "delivery_type": "home",
  "tracking_number": "ZR123456",
  "timeline": [
    { "step": "placed", "label": "تم تأكيد الطلب", "done": true, "date": "2026-04-11" },
    { "step": "preparing", "label": "قيد التحضير", "done": true, "date": "2026-04-11" },
    { "step": "shipped", "label": "تم الإرسال", "done": false },
    { "step": "delivered", "label": "تم التوصيل", "done": false }
  ]
}
```

**Réponse erreur (404) :**
```json
{ "error": "Commande non trouvée" }
```

**Bug connu :** Retourne 500 "Erreur base de données" — voir `TROUBLESHOOT.md`.

---

## POST /api/boutique/track-event

**Rôle :** Reçoit les événements de tracking client (fire & forget).

**Body (JSON) :**
```json
{
  "session_id": "uuid-v4",
  "event_type": "CART_ADD",
  "world": "coiffure",
  "page": "/produits/9384065728808",
  "product_id": "9384065728808",
  "variant_id": "51649987313960",
  "metadata": { "title": "Papier bleu frams", "price": 900, "qty": 1 },
  "utm_source": "facebook",
  "utm_campaign": "promo_avril",
  "referrer": "https://www.facebook.com/"
}
```

**Réponse succès (200) :**
```json
{ "ok": true }
```

**Notes :**
- L'IP est hashée SHA-256 avant stockage (jamais l'IP brute)
- La réponse est immédiate — l'insertion DB est asynchrone (fire & forget)
- Si l'insertion échoue, aucune erreur n'est remontée au client

**Types d'événements valides :**
`PAGE_VIEW`, `PRODUCT_VIEW`, `CART_ADD`, `CART_REMOVE`, `CART_VIEW`, `CHECKOUT_START`, `CHECKOUT_STEP`, `ORDER_PLACED`, `ORDER_FAILED`, `TRACK_VIEW`, `SEARCH`, `FILTER_APPLIED`

---

## POST /api/boutique/coupon — garde-fou bénéfice (T112)

**Rôle :** Valide un code promo et vérifie qu'il ne dépasse pas 50% du bénéfice total de la commande.

**Body (JSON) :**
```json
{
  "coupon_code": "PARTNER10",
  "items": [
    { "variant_id": "51649987313960", "qty": 2, "price": 900 }
  ]
}
```

**Réponse succès (200) — coupon valide et marge respectée :**
```json
{
  "valid": true,
  "discount_type": "percentage",
  "discount_value": 10,
  "discount_amount": 180,
  "partner_name": "Ahmed Ali"
}
```

**Réponses erreur :**
| Code | Message | Cause |
|---|---|---|
| 400 | `"Code invalide"` | Coupon inexistant ou inactif |
| 422 | `"COUPON_EXCEEDS_MARGIN"` | Remise ≥ 50% du bénéfice total |
| 422 | `"هذا الكود يتجاوز هامش الربح المسموح به"` | Message arabe pour le client |

**Logique garde-fou :**
```
bénéfice_total = Σ (price - purchase_price) × qty  [purchase_price depuis nc_po_lines]
montant_remise = Σ price × qty × (discount_value / 100)
si montant_remise / bénéfice_total >= 0.5 → rejeter
```

---

## GET /api/boutique/delivery (T109 — enrichissement)

**Rôle :** Retourne la liste des communes pour une wilaya donnée (depuis ZR Express ou `nc_communes`).

**Query params :**
| Param | Type | Obligatoire | Description |
|---|---|---|---|
| `wilaya` | string | Oui | Nom ou code wilaya (ex: `Alger` ou `16`) |

**Réponse succès (200) :**
```json
{
  "wilaya": "Alger",
  "communes": [
    { "name": "Bab El Oued", "zr_code": "16001" },
    { "name": "Hussein Dey", "zr_code": "16002" },
    { "name": "Kouba", "zr_code": "16003" }
  ],
  "home_price": 400,
  "office_price": 350
}
```

**Réponse erreur (404) :**
```json
{ "error": "Wilaya non trouvée" }
```

---

## DELETE /api/rapports/[id] (T108 — nouveau)

**Rôle :** Supprime définitivement un rapport. Owner uniquement.

**Headers :** `Authorization: Bearer <token>` (role = owner requis)

**Réponse succès (200) :**
```json
{ "ok": true }
```

**Réponses erreur :**
| Code | Message |
|---|---|
| 403 | `"Accès refusé"` |
| 404 | `"Rapport introuvable"` |

---

## DELETE /api/orders/[id] (T110 — nouveau)

**Rôle :** Supprime une commande et restitue le stock (toujours). Owner uniquement.

**Headers :** `Authorization: Bearer <token>` (role = owner requis)

**Réponse succès (200) :**
```json
{ "ok": true, "restocked_items": 3 }
```

**Réponses erreur :**
| Code | Message |
|---|---|
| 403 | `"Accès refusé"` |
| 404 | `"Commande introuvable"` |

**Effets de bord :**
1. `increment_stock(variant_id, qty)` pour chaque article de la commande
2. DELETE de `nc_orders`
3. INSERT dans `nc_events` (`ORDER_DELETED_BY_OWNER`)

---

## DELETE /api/owner/catalogue/[id] (T113 — nouveau)

**Rôle :** Supprime définitivement un article de `nc_variants`. Owner uniquement.

**Headers :** `Authorization: Bearer <token>` (role = owner requis)

**Réponse succès (200) :**
```json
{ "ok": true }
```

**Réponse avertissement — article dans des commandes actives (409) :**
```json
{ "warning": "Article présent dans 2 commandes actives", "can_force": true }
```
Pour forcer la suppression malgré l'avertissement : ajouter `?force=true` à la requête.

**Réponses erreur :**
| Code | Message |
|---|---|
| 403 | `"Accès refusé"` |
| 404 | `"Article introuvable"` |

---

## PATCH /api/orders/modify-items (T98 — existant, T118 le réutilise)

**Rôle :** Modifie les articles d'une commande native (nc_boutique ou pos). Gestion stock intégrée.

**Règle :** Uniquement si `order_source IN ('nc_boutique', 'pos')` ET `status NOT IN ('shipped','delivered','cancelled')`.

**Body (JSON) :**
```json
{
  "order_id": "uuid",
  "items": [
    { "variant_id": "51649987313960", "qty": 2, "price": 900, "title": "Papier bleu frams" }
  ],
  "token": "dashboard_token"
}
```

**Réponse succès (200) :**
```json
{ "ok": true, "new_total": 1800 }
```

**Réponses erreur :**
| Code | Message |
|---|---|
| 400 | `"Modification interdite — commande expédiée"` |
| 400 | `"Modification non disponible pour les commandes Shopify"` |
| 422 | `"Stock insuffisant pour [produit]"` |
