# COMPONENTS.md — Composants nc-boutique
> version: 1.0 | updated: 2026-04-11
> Composants critiques documentés. Ne pas modifier un composant sans lire sa section.

---

## COMPOSANTS EXISTANTS

### Header (`nc-boutique/components/Header.js`)
**Rôle :** Barre de navigation. Logo + menu + icône panier + compteur.
**Props :** Aucune — lit le contexte CartContext.
**Dépend de :** CartContext, lien vers /produits, /suivi
**Statut :** ✅ Existe | ⚠️ Design à refaire (RTL + noir + rouge)

---

### Footer (`nc-boutique/components/Footer.js`)
**Rôle :** Pied de page.
**Statut :** ✅ Existe | ⚠️ Design à refaire

---

### ProductCard (`nc-boutique/components/ProductCard.js`)
**Rôle :** Carte produit dans le catalogue.
**Props :**
| Prop | Type | Description |
|---|---|---|
| `product` | Object | Objet produit depuis `nc_variants` |
| `onAddToCart` | Function | Callback ajout panier |

**Affiche :** image, titre, prix, badge AWAKHIR si `is_new`, badge promo si `compare_at_price`
**Statut :** ✅ Existe | ⚠️ Compare_at_price et is_new non gérés (colonnes manquantes)

---

### CartContext (`nc-boutique/context/CartContext.js`)
**Rôle :** Context React gérant l'état du panier.
**État :**
- `items` : tableau des articles
- `isOpen` : bool, drawer ouvert/fermé
- `total` : total calculé
- `count` : nombre d'articles

**Méthodes exposées :**
- `addItem(product, qty)` — ajoute ou incrémente
- `removeItem(variant_id)` — retire l'article
- `clearCart()` — vide le panier
- `openCart()` / `closeCart()` — contrôle du drawer
**Persistance :** localStorage key `nc_cart`
**Statut :** ✅ Existe | ⚠️ À vérifier

---

## COMPOSANTS À CRÉER

### CartDrawer (CRITIQUE — T04)
**Rôle :** Drawer latéral (slide depuis droite) contenant le panier.
**Emplacement :** `nc-boutique/components/CartDrawer.js`
**Comportement :**
- S'ouvre via `CartContext.openCart()`
- Overlay sombre derrière
- Liste des articles + quantités
- Champ code partenaire (`أدخل كود الشريك`)
- Total + livraison estimée
- Bouton "Commander" → `/commander`
- Swipe vers la droite pour fermer (mobile)

**Maquette :**
```
┌─────────────────────────────┐
│ سلة المشتريات  ✕            │
├─────────────────────────────┤
│ [img] Papier bleu frams     │
│       900 DA  - 1 +         │
│ [img] ...                   │
├─────────────────────────────┤
│ كود الشريك: [____________]  │
├─────────────────────────────┤
│ المجموع : 1300 DA           │
│ [   إتمام الطلب   ]         │
└─────────────────────────────┘
```

---

### WorldSelector (CRITIQUE — T03)
**Rôle :** Page de choix Coiffure / Onglerie (affiché à chaque visite).
**Emplacement :** `nc-boutique/components/WorldSelector.js` (ou `app/page.js`)
**Comportement :**
- Plein écran à l'arrivée
- Deux cartes / zones cliquables
- Coiffure → fond noir/rouge → `/produits?world=coiffure`
- Onglerie → fond feminin → `/produits?world=onglerie`
- Pas de mémorisation du choix (revient à cette page à chaque visite)

---

### DeliveryForm (CRITIQUE — T05)
**Rôle :** Formulaire de commande sur `/commander`.
**Emplacement :** `nc-boutique/components/DeliveryForm.js`
**Champs (dans l'ordre affiché) :**
1. الاسم الأول (Prénom) — obligatoire
2. اللقب (Nom) — obligatoire
3. رقم الهاتف (Téléphone) — obligatoire, format 05/06/07 (10 chiffres)
4. الولاية (Wilaya) — select depuis `nc_delivery_config`
5. البلدية (Commune) — select dépendant de la Wilaya
6. نوع التوصيل (Type livraison) :
   - 🏠 توصيل للمنزل (domicile) — prix différent
   - 🏢 توصيل للمكتب / نقطة التسليم (bureau) — prix différent

**Validation :**
- Téléphone : `/^(05|06|07)\d{8}$/`
- Tous champs obligatoires sauf coupon

---

### WhatsAppButton (T18)
**Rôle :** Bouton flottant bas droite ouvrant WhatsApp.
**Emplacement :** `nc-boutique/components/WhatsAppButton.js`
**Comportement :**
- Fixé en bas à droite (z-index élevé)
- Clic → ouvre `https://wa.me/213XXXXXXXXX?text=...`
- Message par défaut : `مرحبا، أريد الاستفسار عن منتج`
- Uniquement si `nc_boutique_config['whatsapp_number']` configuré

---

### ConfirmationWhatsApp (T19)
**Rôle :** Bouton post-commande pour envoyer la confirmation via WhatsApp.
**Emplacement :** `nc-boutique/app/merci/[id]/page.js`
**Message pré-rempli :**
```
مرحبا، تم تأكيد طلبي رقم [NC-260411-0001]
الإجمالي: 1300 دج
أرجو التأكيد
```
