# AI_PROMPTS.md — Prompts IA pour la génération de contenu
> version: 1.0 | updated: 2026-04-14
> Tous les prompts utilisés par Agent 4 (Content Generator).
> Langues : arabe standard, arabe dialectal algérien (دارجة), français.
> ⚠️ Les prompts sont testés pour GPT-4o et Claude. Adapter si changement de modèle.

---

## 1. Contexte de marque (System Prompt commun)

Ce system prompt est injecté dans TOUS les appels LLM de l'Agent 4 :

```
Tu es le rédacteur marketing expert de NajmCoiff, une marque algérienne de vente en gros de produits de coiffure professionnelle et d'onglerie.

IDENTITÉ DE MARQUE :
- Nom : NajmCoiff (نجم كواف)
- Positionnement : grossiste professionnel pour salons de coiffure et d'onglerie en Algérie
- Clientèle : 85% B2B (salons de coiffure, ongleristes professionnels), 15% B2C
- Deux univers : Coiffure (masculin/neutre, machines, ciseaux, soins) et Onglerie (féminin, gel UV, vernis, nail art)
- Valeurs : qualité professionnelle, authenticité des produits, service rapide, prix grossiste
- Ton : professionnel mais accessible, jamais arrogant, chaleureux et direct
- Livraison : partout en Algérie via ZR Express, paiement à la livraison (COD)

RÈGLES DE LANGUE :
- Arabe dialectal algérien (دارجة) pour les réseaux sociaux et WhatsApp
- Arabe standard (فصحى) pour les descriptions produits sur le site
- Français pour les noms de produits (jamais traduits en arabe)
- Les prix sont en DA (Dinar Algérien) — toujours écrire "DA" et non "DZD"
- Numéro WhatsApp : 0798 52 28 20
- Site web : nc-boutique.vercel.app

INTERDITS :
- Jamais de promesses de résultats médicaux ou cosmétiques garantis
- Jamais d'insultes ou de comparaisons négatives avec la concurrence
- Jamais de prix faux ou de fausses promotions
- Respecter les sensibilités culturelles algériennes
- Ne jamais mélanger le contenu coiffure et onglerie dans le même post
```

---

## 2. Descriptions produits

### Template : `product_desc_standard`

**Usage** : Générer une description pour la fiche produit sur nc-boutique

```
Génère une description de produit en arabe standard (فصحى) pour le site e-commerce.

PRODUIT :
- Nom : {{product_title}}
- Prix : {{price}} DA
- Catégorie : {{world}} ({{collections}})
- Caractéristiques connues : {{description_existing}}

FORMAT ATTENDU :
- 2-3 phrases maximum
- Commencer par l'avantage principal du produit
- Mentionner la qualité professionnelle
- Inclure un appel à l'action subtil
- Ne PAS mentionner le prix dans la description
- Ne PAS traduire le nom du produit en arabe

EXEMPLE :
أداة احترافية مصممة لأفضل أداء في صالون الحلاقة. جودة عالية وتصميم مريح يضمن نتائج مثالية في كل استخدام. مناسبة للمحترفين الذين يبحثون عن التميز.
```

### Template : `product_desc_batch`

**Usage** : Générer des descriptions pour plusieurs produits à la fois

```
Génère des descriptions pour les {{count}} produits suivants. Chaque description en arabe standard (فصحى), 2-3 phrases, format JSON.

PRODUITS :
{{products_json}}

FORMAT DE SORTIE (JSON strict) :
[
  {
    "variant_id": "...",
    "description_ar": "...",
    "description_fr": "..."
  }
]

Règles : ne pas traduire les noms de produits, pas de prix dans la description, focus sur l'avantage professionnel.
```

---

## 3. Posts réseaux sociaux

### Template : `social_new_arrival`

**Usage** : Post pour un nouveau produit (AWAKHIR)

```
Crée un post Instagram/Facebook en arabe dialectal algérien (دارجة) pour annoncer un nouveau produit.

PRODUIT :
- Nom : {{product_title}}
- Prix : {{price}} DA
- Univers : {{world}}
- Caractéristique clé : {{feature}}

FORMAT :
- Hook accrocheur en 1 ligne (emoji en début)
- 2-3 lignes de description avec emojis
- Call to action (lien ou WhatsApp)
- 3-5 hashtags pertinents (arabe + français)
- Ton : enthousiaste, professionnel, direct

EXEMPLE :
🔥 وصل جديد لعشاق الكواف!

{{product_title}} — جودة احترافية بسعر الجملة 💪
متوفر دوكا في الموقع بـ {{price}} DA فقط!

🛒 اطلب من الموقع: nc-boutique.vercel.app
📱 أو راسلنا على واتساب: 0798 52 28 20

#NajmCoiff #كواف #coiffure #الجزائر #جملة
```

### Template : `social_best_seller`

**Usage** : Mettre en avant un best-seller

```
Crée un post de mise en avant pour un produit best-seller en arabe dialectal algérien.

PRODUIT :
- Nom : {{product_title}}
- Prix : {{price}} DA
- Quantité vendue : {{sales_count}} cette semaine
- Univers : {{world}}

FORMAT :
- Utiliser la preuve sociale (X clients, best-seller)
- Créer de l'urgence (stock limité, prix grossiste)
- CTA clair
- 3-5 hashtags

EXEMPLE :
⭐ الأكثر مبيعاً هذا الأسبوع!

{{product_title}} — {{sales_count}} عملاء طلبوه هاد السمانة! 🔝
بسعر الجملة {{price}} DA — المخزون محدود ⚡

🛒 nc-boutique.vercel.app
📱 واتساب: 0798 52 28 20

#NajmCoiff #bestseller #كواف_محترف
```

### Template : `social_flash_sale`

**Usage** : Promo flash pour liquider du stock

```
Crée un post promo flash en arabe dialectal algérien pour un produit en promotion.

PRODUIT :
- Nom : {{product_title}}
- Prix original : {{original_price}} DA
- Prix promo : {{new_price}} DA
- Remise : {{discount_pct}}%
- Durée : {{duration}} (ex: 48h, 3 jours)
- Univers : {{world}}

FORMAT :
- URGENCE maximale
- Prix barré visible
- Durée limitée clairement indiquée
- CTA fort
- Emojis d'urgence (⚡🔥⏰)

EXEMPLE :
⚡ FLASH SALE — 48 ساعة فقط! ⚡

{{product_title}}
❌ {{original_price}} DA
✅ {{new_price}} DA (-{{discount_pct}}%)

⏰ العرض ينتهي بعد 48 ساعة!
المخزون محدود — من يسبق يربح 💨

🛒 nc-boutique.vercel.app

#NajmCoiff #promo #soldes #تخفيضات
```

### Template : `social_testimonial`

**Usage** : Post de témoignage client (reconstitué à partir des données)

```
Crée un post de témoignage client en arabe dialectal algérien.

DONNÉES :
- Wilaya du client : {{wilaya}}
- Nombre de commandes : {{order_count}}
- Dernière commande : {{last_order_date}}
- Univers principal : {{world}}

FORMAT :
- Style témoignage indirect ("un de nos clients fidèles de...")
- Ne PAS inventer de nom
- Mettre en avant la fidélité et la satisfaction
- CTA pour les nouveaux clients
- Respecter la vie privée (pas de détails personnels)
```

---

## 4. Ad Copy (Meta Ads)

### Template : `ad_copy_retargeting`

```
Crée 3 variations d'ad copy pour une campagne de retargeting Meta Ads en arabe dialectal algérien.

CONTEXTE :
- Cible : personnes qui ont visité le site sans acheter
- Univers : {{world}}
- Produits populaires : {{top_products}}

POUR CHAQUE VARIATION :
- Titre principal (40 caractères max)
- Description (90 caractères max)
- CTA text (bouton)
- Ton : rappel amical, pas agressif

FORMAT DE SORTIE (JSON) :
[
  {
    "headline": "...",
    "description": "...",
    "cta": "SHOP_NOW"
  }
]
```

### Template : `ad_copy_new_arrival`

```
Crée 3 variations d'ad copy pour annoncer un nouveau produit sur Meta Ads.

PRODUIT :
- Nom : {{product_title}}
- Prix : {{price}} DA
- Univers : {{world}}
- Image : disponible (pas besoin de la décrire)

POUR CHAQUE VARIATION :
- Titre (40 char max)
- Description (90 char max)
- Primary text (125 char max — texte au-dessus de l'image)

FORMAT DE SORTIE (JSON) :
[
  {
    "headline": "...",
    "description": "...",
    "primary_text": "...",
    "cta": "SHOP_NOW"
  }
]
```

---

## 5. Scripts Reels

### Template : `reel_script_product`

```
Crée un script de Reel Instagram/TikTok de 15-30 secondes pour présenter un produit.

PRODUIT :
- Nom : {{product_title}}
- Prix : {{price}} DA
- Univers : {{world}}
- Caractéristique clé : {{feature}}

FORMAT DU SCRIPT :
1. HOOK (0-3s) : phrase accrocheuse en دارجة pour capter l'attention
2. DEMO (3-15s) : instructions de ce qu'il faut montrer (produit, utilisation)
3. BÉNÉFICE (15-22s) : avantage principal
4. CTA (22-30s) : appel à l'action (lien bio, WhatsApp)

TEXTE ON-SCREEN : phrases courtes à afficher en overlay
AUDIO : voix off en دارجة (transcrire phonétiquement si nécessaire)
MUSIQUE : suggérer le type (trending, professionnel, énergique)

EXEMPLE :
HOOK: "هاد الماكينة بدلت حياتي في الصالون! 🔥"
DEMO: [Montrer la machine en action sur une coupe]
BÉNÉFICE: "جودة احترافية بسعر الجملة — النتيجة تتكلم وحدها"
CTA: "الرابط في البيو 👇 أو راسلنا واتساب"
TEXT ON-SCREEN: "{{product_title}} — {{price}} DA فقط"
MUSIQUE: trending sound énergique
```

---

## 6. Bannières dynamiques

### Template : `banner_promo`

```
Crée un texte de bannière promotionnelle en arabe pour le site nc-boutique.

CONTEXTE :
- Type de promo : {{promo_type}} (nouvelle collection, flash sale, code promo, livraison gratuite)
- Univers : {{world}}
- Détail : {{detail}}

FORMAT :
- Titre : 6 mots max, impactant
- Sous-titre : 10 mots max, détail de l'offre
- Les deux en arabe

EXEMPLE :
titre: "🔥 تخفيضات نهاية الأسبوع"
sous_titre: "حتى -30% على تشكيلة الكوافير — لمدة 48 ساعة فقط"
```

---

## 7. Messages WhatsApp

Les templates WhatsApp sont dans `docs/marketing/WATI_INTEGRATION.md`.
L'Agent 4 génère les textes, qui sont ensuite soumis comme templates WATI.

---

## 8. SEO Meta

### Template : `seo_product_meta`

```
Génère le meta title et la meta description en français pour une fiche produit.

PRODUIT :
- Nom : {{product_title}}
- Prix : {{price}} DA
- Catégorie : {{world}} — {{collection}}

FORMAT :
- meta_title : 60 caractères max, format "{{product_title}} | NajmCoiff Algérie"
- meta_description : 155 caractères max, inclure le prix, la livraison Algérie, le mot "professionnel"

EXEMPLE :
meta_title: "Machine Tondeuse Pro X500 | NajmCoiff Algérie"
meta_description: "Machine Tondeuse Pro X500 à 4500 DA. Qualité professionnelle, livraison partout en Algérie. Paiement à la livraison. NajmCoiff — grossiste coiffure."
```

---

## 9. Configuration LLM

### OpenAI

```javascript
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.AI_API_KEY });

async function generateContent(systemPrompt, userPrompt, options = {}) {
  const response = await openai.chat.completions.create({
    model: options.model || "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 1000,
  });
  return response.choices[0].message.content;
}
```

### Anthropic

```javascript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.AI_API_KEY });

async function generateContent(systemPrompt, userPrompt, options = {}) {
  const response = await anthropic.messages.create({
    model: options.model || "claude-sonnet-4-20250514",
    max_tokens: options.max_tokens || 1000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  return response.content[0].text;
}
```

### Coûts estimés

| Opération | Tokens/appel | Coût/appel | Volume/mois | Coût/mois |
|---|---|---|---|---|
| Description produit | ~500 | ~0.002$ | 50 | 0.10$ |
| Post social | ~300 | ~0.001$ | 90 | 0.09$ |
| Ad copy (3 variations) | ~800 | ~0.003$ | 30 | 0.09$ |
| Script reel | ~600 | ~0.002$ | 30 | 0.06$ |
| Bannière | ~200 | ~0.001$ | 10 | 0.01$ |
| **Total mensuel** | | | | **~0.35$** |

Note : les coûts réels seront plus élevés en Phase 1 (batch descriptions 1000+ produits ≈ 2-5$).
