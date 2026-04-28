# WATI_INTEGRATION.md — Intégration WhatsApp WATI API
> version: 2.0 | updated: 2026-04-18
> Guide complet d'intégration WATI pour l'Agent 3 (Client Reactivation).
> Prérequis : compte WATI actif + templates approuvés par Meta.

---

## ⚠️ ÉTAT DES TEMPLATES (2026-04-18)

| Série | Statut | Problème | À utiliser ? |
|---|---|---|---|
| **v1** (najm_order_followup, najm_delivery_confirm, etc.) | ✅ APPROVED | ❌ Corps arabe **encodage corrompu** (affiche `????` en prod) | **NON** — ne pas utiliser |
| **v2** (najm_order_v2, najm_delivery_v2, etc.) | ⏳ PENDING | En attente approbation Meta (24-48h) | **Oui — dès approbation** |

> **Règle absolue** : utiliser uniquement les templates `_v2` une fois APPROVED. Les v1 sont conservés pour ne pas bloquer Meta mais ne pas déclencher de messages.

### Templates v2 — IDs Meta
| elementName | waTemplateId | statut |
|---|---|---|
| `najm_order_v2` | `968304442329443` | PENDING |
| `najm_delivery_v2` | `961947683463668` | PENDING |
| `najm_react30_v2` | `1657564345575982` | PENDING |
| `najm_react60_v2` | `955608527374472` | PENDING |
| `najm_cart_v2` | `1467869854789450` | PENDING |
| `najm_vip_v2` | `1517215279934806` | PENDING |

---

## 1. Configuration

### Variables d'environnement (vercel-quick)

```
WATI_API_URL=https://live-mt-server.wati.io/{votre-id}
WATI_API_TOKEN=Bearer {votre-token}
WATI_OWNER_PHONE=213798522820
```

### Client WATI (`lib/wati.js`)

```javascript
const WATI_API_URL = process.env.WATI_API_URL;
const WATI_API_TOKEN = process.env.WATI_API_TOKEN;

async function watiRequest(endpoint, method = "GET", body = null) {
  const res = await fetch(`${WATI_API_URL}${endpoint}`, {
    method,
    headers: {
      "Authorization": WATI_API_TOKEN,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WATI ${method} ${endpoint}: ${res.status} — ${text}`);
  }
  return res.json();
}
```

---

## 2. API WATI — Endpoints utilisés

### Envoyer un message template

```
POST /api/v1/sendTemplateMessage?whatsappNumber={phone}
```

Body :
```json
{
  "template_name": "order_followup",
  "broadcast_name": "agent3_post_order",
  "parameters": [
    { "name": "order_name", "value": "NC-260414-0003" },
    { "name": "customer_name", "value": "أحمد" }
  ]
}
```

### Ajouter/modifier un contact

```
POST /api/v1/addContact/{phone}
```

Body :
```json
{
  "name": "أحمد",
  "customParams": [
    { "name": "segment", "value": "vip" },
    { "name": "world", "value": "coiffure" },
    { "name": "last_order_date", "value": "2026-04-10" },
    { "name": "total_orders", "value": "8" }
  ]
}
```

### Assigner des tags (étiquettes)

```
POST /api/v1/assignTag
```

Body :
```json
{
  "phoneNumber": "213XXXXXXXXX",
  "tags": ["vip", "coiffure", "actif"]
}
```

### Lister les contacts

```
GET /api/v1/getContacts?pageSize=100&pageNumber=1
```

### Vérifier le statut d'un message

```
GET /api/v1/getMessageStatus/{messageId}
```

---

## 3. Templates WhatsApp à créer

Les templates doivent être soumis à Meta via WATI pour approbation.
Délai d'approbation : 24-48h en général.

### Template 1 : `order_followup` (Post-commande J+3)

| Paramètre | Description |
|---|---|
| Catégorie | UTILITY |
| Langue | ar |

```
سلام {{1}}! 👋

طلبيتك {{2}} في الطريق إليك 🚚
تتبع الشحنة هنا:
https://nc-boutique.vercel.app/suivi/{{3}}

أي مشكل؟ رد على هذه الرسالة وسنساعدك.

NajmCoiff — شكراً لثقتك! 💪
```

Variables : `{{1}}` = prénom, `{{2}}` = order_name, `{{3}}` = order_id

### Template 2 : `delivery_confirm` (Post-livraison J+1)

| Paramètre | Description |
|---|---|
| Catégorie | UTILITY |
| Langue | ar |

```
سلام {{1}}! 📦

وصلتك طلبيتك {{2}}؟ كلش مليح؟ ✅

نحبو نسمعو رأيك! رد بـ:
⭐ إذا كنت راضي
❌ إذا كاين مشكل

NajmCoiff — رضا عملائنا أولويتنا
```

Variables : `{{1}}` = prénom, `{{2}}` = order_name

### Template 3 : `reactivation_30` (Relance 30j)

| Paramètre | Description |
|---|---|
| Catégorie | MARKETING |
| Langue | ar |

```
سلام {{1}}! 👋

مشتقنالك! 😊
وصلنا منتجات جديدة في {{2}} تبهر!

شوف آخر الوصول من هنا:
https://nc-boutique.vercel.app/produits

🎁 استعمل الكود RETOUR10 باش تربح -10% على طلبيتك الجاية!

NajmCoiff ✨
```

Variables : `{{1}}` = prénom, `{{2}}` = world (الكوافير/الأونقلري)

### Template 4 : `reactivation_60` (Relance 60j)

| Paramètre | Description |
|---|---|
| Catégorie | MARKETING |
| Langue | ar |

```
سلام {{1}}! 🌟

هدرزنا مع فريقنا وقررنا نعطيوك عرض خاص:
-15% على كلش مع الكود REVIENS15 💪

الكود صالح 7 أيام فقط!
https://nc-boutique.vercel.app/produits

NajmCoiff — نجم كواف
```

Variables : `{{1}}` = prénom

### Template 5 : `cart_reminder` (Abandon panier)

| Paramètre | Description |
|---|---|
| Catégorie | MARKETING |
| Langue | ar |

```
سلام {{1}}! 🛒

نسيت حاجة في السلة! المنتجات لي اخترتهم مازالت متوفرة.

كمل الطلب من هنا:
https://nc-boutique.vercel.app/panier

⚡ خليها ماتفوتكش — المخزون محدود!

NajmCoiff
```

Variables : `{{1}}` = prénom

### Template 6 : `restock_alert` (Retour en stock)

| Paramètre | Description |
|---|---|
| Catégorie | MARKETING |
| Langue | ar |

```
خبر مليح {{1}}! 🎉

المنتج لي كنت تقلب عليه رجع للمخزون:
{{2}}

اطلبه قبل ما يخلص:
https://nc-boutique.vercel.app/produits/{{3}}

NajmCoiff ✨
```

Variables : `{{1}}` = prénom, `{{2}}` = product_title, `{{3}}` = slug

### Template 7 : `cross_sell` (Cross-sell B2B)

| Paramètre | Description |
|---|---|
| Catégorie | MARKETING |
| Langue | ar |

```
سلام {{1}}! 💅

عندنا تشكيلة أونقلري محترفة جديدة:
جل UV، ورنيش، وأدوات احترافية!

شوفهم من هنا:
https://nc-boutique.vercel.app/collections/onglerie

🎁 كعميل كوافير مميز، الكود CROSS10 يعطيك -10%!

NajmCoiff
```

Variables : `{{1}}` = prénom

### Template 8 : `vip_exclusive` (Offre VIP)

| Paramètre | Description |
|---|---|
| Catégorie | MARKETING |
| Langue | ar |

```
مرحباً {{1}}! 👑

أنت من عملائنا المميزين وحبينا نعطيوك عرض حصري:
-20% على كلش مع الكود VIP20 🔥

العرض صالح 48 ساعة فقط!
https://nc-boutique.vercel.app/produits

NajmCoiff — شكراً لولائك! 💎
```

Variables : `{{1}}` = prénom

### Template 9 : `daily_report` (Rapport owner)

| Paramètre | Description |
|---|---|
| Catégorie | UTILITY |
| Langue | fr |

```
📊 NajmCoiff — Rapport du {{1}}

💰 CA : {{2}} DA ({{3}})
📦 Commandes : {{4}}
🛒 Panier moyen : {{5}} DA
📈 Conversion : {{6}}%
🔄 Réactivés : {{7}}
📱 WA envoyés : {{8}}
🏥 Score santé : {{9}}/100

{{10}}
```

Variables : date, CA, variation, commandes, panier, conversion, réactivés, WA, score, insight

---

## 4. Logique d'envoi (`lib/wati.js`)

### Fonctions principales

```javascript
async function sendTemplate(phone, templateName, params) {
  const formattedPhone = phone.replace(/^0/, "213").replace(/^\+/, "");
  const parameters = Object.entries(params).map(([name, value]) => ({
    name, value: String(value),
  }));

  return watiRequest(
    `/api/v1/sendTemplateMessage?whatsappNumber=${formattedPhone}`,
    "POST",
    {
      template_name: templateName,
      broadcast_name: `agent3_${templateName}_${Date.now()}`,
      parameters,
    }
  );
}

async function syncContactTags(phone, tags) {
  const formattedPhone = phone.replace(/^0/, "213").replace(/^\+/, "");
  return watiRequest("/api/v1/assignTag", "POST", {
    phoneNumber: formattedPhone,
    tags,
  });
}
```

### Anti-spam guard

```javascript
async function canSendMessage(sb, phone) {
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { count } = await sb
    .from("nc_ai_whatsapp_queue")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("sent_at", oneWeekAgo)
    .in("status", ["sent", "delivered", "read"]);

  return (count || 0) < 3; // max 3/semaine (NEW-M3)
}

async function lastMessageDelay(sb, phone) {
  const { data } = await sb
    .from("nc_ai_whatsapp_queue")
    .select("sent_at")
    .eq("phone", phone)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.sent_at) return Infinity;
  return Date.now() - new Date(data.sent_at).getTime();
}

const MIN_DELAY_MS = 48 * 3600 * 1000; // 48h entre messages
```

---

## 5. Flux d'abandon panier

```
1. Cron toutes les 2h → POST /api/ai/whatsapp-abandon-cart
2. Query : SELECT DISTINCT session_id, MAX(created_at) as checkout_time
   FROM nc_page_events
   WHERE event_type = 'CHECKOUT_START'
   AND created_at > NOW() - INTERVAL '4 hours'
   AND created_at < NOW() - INTERVAL '2 hours'
   AND session_id NOT IN (
     SELECT session_id FROM nc_page_events
     WHERE event_type = 'ORDER_PLACED'
     AND created_at > NOW() - INTERVAL '4 hours'
   )
3. Pour chaque session_id abandonné :
   a. Trouver le phone via nc_page_events metadata ou nc_orders
   b. Vérifier anti-spam (canSendMessage)
   c. Insérer dans nc_ai_whatsapp_queue (flow_type = 'abandon_cart')
   d. Envoyer via WATI sendTemplate('cart_reminder')
   e. Logger dans nc_ai_whatsapp_logs
   f. Logger décision dans nc_ai_decisions_log
```

---

## 6. Format des numéros

| Format reçu | Format WATI | Explication |
|---|---|---|
| `0612345678` | `213612345678` | Remplacer le 0 initial par 213 |
| `+213612345678` | `213612345678` | Retirer le + |
| `213612345678` | `213612345678` | Déjà correct |
| `06 12 34 56 78` | `213612345678` | Retirer espaces + 0→213 |
