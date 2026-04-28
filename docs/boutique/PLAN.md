# PLAN — nc-boutique (Documentation de référence)
> version: 1.1 | updated: 2026-04-11 | phase: M2 (Lancement Parallèle)
> Ce fichier est la source de vérité pour nc-boutique.
> L'index court est dans `nc-boutique/PLAN.md`.

---

## STATUT GLOBAL

```
status: IN_PROGRESS
phase: M2
launch_date: TBD (pas de date cible — lancement quand tout est parfait)
blocking_tasks: [T01, T02, T03, T04, T05, T06]
```

---

## PARTIE A — IDENTITÉ DE LA MARQUE

```yaml
status: DOCUMENTED
code_status: PARTIAL
```

| Paramètre | Valeur |
|---|---|
| Nom | NajmCoiff |
| Slogan | (à définir) |
| Fond principal | `#0a0a0a` (noir uni) |
| Couleur accent | `#e63012` (rouge vif) |
| Direction texte interface | RTL (arabe) |
| Direction noms produits | LTR (français) |
| Police | (recommandé : Cairo ou Tajawal pour l'arabe) |

**Règles typographiques :**
- Tous les textes UI en arabe → `dir="rtl"` sur `<html>`
- Les noms produits (en français) restent LTR → `dir="ltr"` sur le span produit
- Fond noir uni — jamais de motif répétitif

---

## PARTIE B — LES DEUX MONDES

```yaml
status: DOCUMENTED
code_status: TODO (T03)
```

### B.1 Concept
Deux niches entièrement séparées sur le même site :
- **Coiffure** : public barbier/coiffeur/grossiste. Thème noir/rouge.
- **Onglerie** : public féminin prothésiste ongulaire. Thème féminin (fond noir + éléments floraux/pastels).

### B.2 Page de choix (T03 — DONE)
- Affichée à chaque visite (pas de mémorisation)
- Plein écran, deux zones cliquables
- Coiffure → `/collections/coiffure` (T80)
- Onglerie → `/collections/onglerie` (T80)
- **Zéro collections sur la page d'accueil** — la page d'accueil ne contient QUE les 2 cartes

### B.3 Séparation catalogue
- Produits coiffure : `world = 'coiffure'` dans `nc_variants`
- Produits onglerie : `world = 'onglerie'` dans `nc_variants` (ou tag dans `collections`)

### B.4 Séparation tracking (T13 — DONE)
- Colonne `world` dans `nc_page_events`
- Pixel Facebook coiffure ne voit jamais les événements onglerie, et vice-versa

### B.5 Navigation
- Coiffure et Onglerie accessibles via menu si on est déjà dans un monde
- Pas de bannière onglerie sur la page coiffure

### B.6 Page monde — `/collections/[world]` (T80 — DONE, corrections T89 en cours)

```
Fichier : nc-boutique/app/collections/[world]/page.js
```

**Structure de la page :**
1. `<Header />` standard
2. Titre du monde (ex : "✂️ Coiffure & Barbier" ou "💅 Onglerie & Beauté")
3. **Grille de collections** — `grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6` (CSS grid fixe, pas flex+calc)
   - ⚠️ Décision validée 2026-04-12 : remplacer `flex flex-wrap + w-[calc(...)]` par `grid` — plus stable sur mobile RTL
   - Source : `GET /api/boutique/collections?world=[world]` (filtre `show_in_filter=true`)
   - Chaque carte = CollectionCard (image + titre)
   - Clic → `/produits?category=[title]&world=[world]`
4. **Séparateur** + titre "كل المنتجات"
5. **Grille produits compacte** — `grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2`
   - Source : `GET /api/boutique/products?world=[world]&limit=40` (LIMIT=40 validé)
   - Section AWAKHIR en premier si `is_new=true` existent
   - Cartes compactes : `rounded-xl`, `p-1.5 pb-7`, titre `text-[10px] line-clamp-1`, prix `text-[10px]`, bouton `w-6 h-6`
   - Images : `object-cover` (rogner, remplir le carré — décision 2026-04-12)
6. `<Footer />` standard

**Modification `app/page.js` :**
- Retirer la section collections complète (suppression des états `coiffureColls`, `onglerieColls`, fetch)
- Modifier `choose()` : `router.push('/collections/${worldId}')` au lieu de `/produits`
- Page d'accueil = uniquement les 2 cartes de choix + ticker

**Persistance world :**
- `sessionStorage.setItem('nc_world', world)` au moment du clic sur la carte
- La page `/collections/[world]` lit aussi le param URL `world` pour cohérence

---

## PARTIE B.7 — UX MOBILE (décisions 2026-04-12 #8)

```yaml
status: DOCUMENTED
code_status: TODO (T87–T91)
cible: iPhone 375px, Android 360px
```

### Grilles produits (décisions définitives)

| Page | Toutes tailles | Implémentation |
|---|---|---|
| `/produits` grille produits | 4 colonnes | `style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}` |
| `/collections/[world]` produits | 4 colonnes | `style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}` |
| `/collections/[world]` collections | 4 colonnes | `style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}` |

⚠️ **Décision technique 2026-04-12 (finale)** :

**Bug root-cause** : `body { display: flex; flex-direction: column }` + `mx-auto` sur `<main>`.
Dans un flex column, `mx-auto` annule `align-items: stretch` → la main prend sa `max-content-width` = 1152px (max-w-6xl) au lieu du viewport 375px.
**Fix** : ajouter `w-full` sur TOUTES les `<main>` avec `mx-auto` pour forcer `width: 100%` = 375px.

**Fix grid** : `style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}` inline = immune au build cache Tailwind.

**Validation** : test Playwright `boundingBox()` sur mobile 375px → cartes ~80px wide = 4 colonnes confirmées.

### Cartes compactes 4-colonnes (mobile)
- Container : `rounded-xl` (pas `rounded-2xl`)
- Padding infos : `p-1.5 pb-7`
- Titre : `text-[10px] font-semibold line-clamp-1 text-right`
- Prix : `text-[10px] font-bold`
- Bouton + : `w-6 h-6 rounded-full bottom-1.5 left-1.5`
- Vendor : **masqué** sur toutes les cartes (pas assez de place)
- Variant_title : **masqué** si peu de place
- Gap : `gap-2` (pas `gap-3`)

### Images produits (décision définitive)
- **`object-cover`** sur toutes les cartes — remplace `object-contain p-1`
- `aspect-square` conservé — le carré est maintenu, l'image est rognée si portrait/paysage
- Raison : Peignoir 175 et autres images portrait mal affichées avec `contain`

### Filtre + Recherche mobile (T90)
- Structure actuelle : `flex flex-wrap` avec `min-w-48` → déborde sur 375px
- Nouvelle structure : `flex flex-col gap-2 sm:flex-row sm:items-center`
  - Row 1 (mobile) : barre de recherche `w-full`
  - Row 2 (mobile) : dropdown catégories `w-full` + bouton reset inline
  - Sur SM+ : retour à la ligne unique horizontale
- Le `select` catégorie prend `flex-1 w-full` sur mobile

### Améliorations générales mobile
- `overflow-x: hidden` sur `body` — global, bloque tout débordement horizontal
- Header : logo réduit (`h-7 w-7`) + "NAJMCOIFF" text-size réduit (`1.5rem`) sur mobile
- Bouton "تغيير العالم" : `text-xs` déjà correct, position conservée

---

## PARTIE C — CATALOGUE ET COLLECTIONS

```yaml
status: DOCUMENTED
code_status: PARTIAL (compare_at_price manquant — T01)
```

### C.1 Règles catalogue
- Zéro produit en stock 0
- Noms produits en français
- Chaque article = une entrée distincte (pas de variantes taille/couleur)
- Photos = images Shopify actuelles (migrées — T11)

### C.2 Collections (liste exhaustive à récupérer de Shopify)
Collections connues :
- AWAKHIR (nouveautés — badge spécial)
- مستحضرات وكوسميتيك
- مشط
- (autres — récupérer via migrate-shopify.js --phase=collections)

### C.3 AWAKHIR (badge spécial)
- `is_new = true` dans `nc_variants`
- Badge visuel sur la ProductCard
- Section dédiée sur la page d'accueil

### C.4 Colonnes à ajouter à nc_variants (T01)
```sql
compare_at_price   NUMERIC DEFAULT NULL
collections        TEXT[] DEFAULT '{}'
description        TEXT DEFAULT NULL
is_new             BOOLEAN DEFAULT FALSE
world              TEXT DEFAULT 'coiffure'
```

---

## PARTIE D — SYSTÈME DE COMMANDE

```yaml
status: DOCUMENTED
code_status: PARTIAL (drawer et formulaire manquants — T04, T05)
```

### D.1 Flux de commande
1. Client navigue le catalogue (page de choix → catalogue → fiche)
2. Ajoute au panier (drawer s'ouvre)
3. Peut entrer code partenaire dans le drawer
4. Clique "إتمام الطلب" → page `/commander`
5. Remplit le formulaire (Prénom, Nom, Tel, Wilaya, Commune, Type livraison)
6. Confirme → page `/merci/[order_id]`
7. Peut envoyer message WhatsApp pré-rempli

### D.2 Drawer panier (T04)
Voir `docs/boutique/COMPONENTS.md#CartDrawer`

### D.3 Formulaire commande (T05)
Champs (dans l'ordre) :
1. الاسم الأول (Prénom) *
2. اللقب (Nom) *
3. رقم الهاتف (Téléphone) * — validation `/^(05|06|07)\d{8}$/`
4. الولاية (Wilaya) * — select depuis `nc_delivery_config`
5. البلدية (Commune) * — select dépendant de Wilaya
6. نوع التوصيل (Type livraison) * :
   - توصيل للمنزل (domicile) : prix domicile
   - توصيل للمكتب (bureau) : prix bureau

### D.4 Table nc_delivery_config (T07)
Voir `docs/boutique/SCHEMA.md#nc_delivery_config`

### D.5 Confirmation WhatsApp (T18, T19)
- Bouton flottant sur toutes les pages
- Message pré-rempli sur `/merci/[order_id]`
- Numéro WhatsApp depuis `nc_boutique_config['whatsapp_number']`

### D.6 Numéro de commande
Format : `NC-YYMMDD-XXXX` (ex: `NC-260411-0001`)
Séquence quotidienne repart de 0001 chaque jour.

---

## PARTIE E — TRACKING MULTI-PIXEL FACEBOOK

```yaml
status: DOCUMENTED
code_status: TODO (T14)
```

### E.1 Architecture
- Pixel Coiffure : `FB_PIXEL_COIFFURE` (côté client)
- Pixel Onglerie : `FB_PIXEL_ONGLERIE` (côté client)
- Chaque pixel ne reçoit que les événements de son monde
- Server-side CAPI (T21) : couche complémentaire anti-adblockers

### E.2 Événements mappés
| Événement interne | Event Facebook |
|---|---|
| `PRODUCT_VIEW` | `ViewContent` |
| `CART_ADD` | `AddToCart` |
| `CHECKOUT_START` | `InitiateCheckout` |
| `ORDER_PLACED` | `Purchase` |

### E.3 Déduplication
- Chaque événement a un `event_id` = `${session_id}_${event_type}_${timestamp}`
- Browser pixel et CAPI envoient le même `event_id` → Meta déduplique automatiquement

### E.4 Analytics propre (décision)
Pas de Google Analytics. Tout passe par `nc_page_events` et `nc_events`.

---

## PARTIE F — DASHBOARD OWNER

```yaml
status: DOCUMENTED
code_status: TODO (T10)
```

### F.1 Accès
- Route : `/dashboard/owner/*` dans `vercel-quick`
- Condition : `nc_users.role = 'owner'`
- Colonne `role` à ajouter : `ALTER TABLE nc_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'agent'`
- Mettre `role = 'owner'` pour le propriétaire

### F.2 Pages owner
| Page | Route | Statut |
|---|---|---|
| Vue d'ensemble | `/dashboard/owner` | TODO |
| Bannière promo | `/dashboard/owner/promo` | TODO |
| Config livraison | `/dashboard/owner/livraison` | TODO |
| Partenaires | `/dashboard/owner/partenaires` | (existe dans /partenaires) |
| Banners boutique | `/dashboard/owner/banners` | TODO |
| Documentation | `/dashboard/owner/doc` | DONE (T15) |
| Analytics | `/dashboard/owner/analytics` | DONE (T25) |
| **Collections** | `/dashboard/owner/collections` | DONE (T27) — T81 améliore l'image |

### F.4 Upload image collection (T81)

```
Fichier modifié : vercel-quick/app/dashboard/owner/collections/page.js
Route réutilisée : POST /api/owner/upload?folder=collections
```

**Spec :**
- Remplacer le champ texte `image_url` par un composant upload
- Bouton "📷 Choisir une photo" → `<input type="file" accept="image/*">`
- À la sélection : `POST /api/owner/upload` avec `FormData { file }`
- Pendant l'upload : spinner + "Envoi en cours..."
- Après succès : `form.image_url` = URL retournée, afficher miniature (60×60)
- En cas d'erreur : message rouge sous le champ
- Conserver le champ `image_url` en DB — aucun changement de schéma
- L'image va dans le bucket `product-images` (existant, public)
- Modifier la route upload pour accepter un param `?folder=` (défaut: `articles`) :
  - `collections` → path = `collections/${Date.now()}-${slug}.${ext}`
  - `articles` → path = `articles/${Date.now()}-${slug}.${ext}` (comportement actuel inchangé)

**Fichiers touchés :**
- `vercel-quick/app/dashboard/owner/collections/page.js` — UI upload
- `vercel-quick/app/api/owner/upload/route.js` — ajout param `?folder=`

### F.3 Tables associées
Voir `docs/boutique/SCHEMA.md#TABLES-À-CRÉER`

---

## PARTIE H — NOUVELLES FONCTIONNALITÉS (session 2026-04-13)

```yaml
status: DOCUMENTED
code_status: TODO (T107–T118)
```

---

### H.1 Suppression rapport owner (T108)

**Objectif :** Le owner peut supprimer un rapport depuis `/dashboard/rapports`.

**Règles :**
- Seul le owner (`role = 'owner'`) peut supprimer — les agents voient seulement
- Bouton "🗑️" sur chaque ligne/carte rapport
- Modale de confirmation : "Supprimer ce rapport définitivement ?"
- Après suppression : log dans `nc_events` (`log_type = 'RAPPORT_DELETED'`)
- Suppression = DELETE définitif de `nc_rapports`

**Route à créer :**
```
DELETE /api/rapports/[id]
Headers : Authorization: Bearer <token>
Auth requise : role = 'owner'
Body : aucun
Réponse 200 : { ok: true }
Réponse 403 : { error: "Accès refusé" }
Réponse 404 : { error: "Rapport introuvable" }
```

**Fichiers à modifier :**
- `vercel-quick/app/dashboard/rapports/page.js` — ajout bouton + modale
- `vercel-quick/app/api/rapports/[id]/route.js` (NOUVEAU) — handler DELETE

---

### H.2 Modifier commande POS/Boutique — bouton indépendant Shopify (T118)

**Objectif :** Un bouton "تعديل الطلب" distinct sur les commandes natives (POS + nc_boutique), complètement indépendant du bouton "Modifier sur Shopify" (legacy).

**Règle de visibilité :**
| `order_source` | Bouton Shopify (legacy) | Bouton natif (nouveau) |
|---|---|---|
| `shopify` | ✅ Visible | ❌ Caché |
| `nc_boutique` | ❌ Caché | ✅ Visible |
| `pos` | ❌ Caché | ✅ Visible |
| `null` / autre | ✅ Visible (défaut) | ❌ Caché |

**Fonctionnalités du modal "تعديل الطلب" :**
1. Liste des articles actuels avec quantité éditable
2. Champ recherche pour ajouter de nouveaux articles (depuis `nc_variants`)
3. Suppression d'articles (bouton ×)
4. Mise à jour stock en temps réel :
   - Article supprimé → `increment_stock(variant_id, qty)`
   - Article ajouté → `decrement_stock(variant_id, qty)` (vérifie stock avant)
   - Quantité augmentée → `decrement_stock` de la différence
   - Quantité réduite → `increment_stock` de la différence
5. Recalcul automatique du total commande
6. Validation : impossible de modifier une commande avec `status IN ('shipped','delivered','cancelled')`
7. Log dans `nc_events` (`log_type = 'ORDER_MODIFIED_NATIVE'`)

**Route existante à réutiliser :** `PATCH /api/orders/modify-items` (T98 — déjà créée)

**Nouveau composant à créer :**
```
vercel-quick/components/OrderEditModal.js
Props : { order, onClose, onSuccess }
```

**Pages où ajouter le bouton (toutes les pages avec cartes commandes) :**
- `vercel-quick/app/dashboard/preparation/page.js`
- `vercel-quick/app/dashboard/confirmation/page.js`
- `vercel-quick/app/dashboard/operations/page.js`

---

### H.3 Communes ZR Express → formulaire boutique (T109)

**Objectif :** Le select "البلدية" dans le formulaire commande affiche les vraies communes de la wilaya choisie, récupérées depuis l'API ZR Express.

**Architecture :**
1. **Récupération initiale** : appel API ZR Express `GET /api/communes` (ou équivalent) → liste des wilayas + communes
2. **Stockage** : sauvegarder dans `nc_delivery_config` (colonne `communes JSONB`) ou dans une nouvelle table `nc_communes`
3. **Route publique** : `GET /api/boutique/delivery?wilaya=[wilaya]` retourne la liste des communes de cette wilaya
4. **Front** : quand le user sélectionne une wilaya → fetch des communes → remplace le champ texte par un select

**Schéma `nc_communes` (alternative à nc_delivery_config) :**
```sql
CREATE TABLE nc_communes (
  id            SERIAL PRIMARY KEY,
  wilaya_code   TEXT NOT NULL,
  wilaya_name   TEXT NOT NULL,
  commune_name  TEXT NOT NULL,
  zr_code       TEXT,
  home_price    INTEGER DEFAULT 0,
  office_price  INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON nc_communes (wilaya_code);
```

**Enrichissement nc_delivery_config (alternative) :**
```sql
ALTER TABLE nc_delivery_config ADD COLUMN IF NOT EXISTS communes JSONB DEFAULT '[]';
-- communes = [{ "name": "Bab El Oued", "zr_code": "16001" }, ...]
```

**Décision à prendre :** Table dédiée `nc_communes` (recommandé pour les index) vs colonne JSONB dans `nc_delivery_config`.

**Fichiers à modifier :**
- `nc-boutique/app/commander/page.js` — select communes dynamique
- `nc-boutique/app/api/boutique/delivery/route.js` — endpoint GET ?wilaya= (existe déjà — à enrichir)
- SQL : créer `nc_communes` ou enrichir `nc_delivery_config`

---

### H.4 Suppression commande owner avec restock toujours (T110)

**Objectif :** Le owner peut supprimer toute commande (peu importe le statut), le stock est TOUJOURS restitué.

**Règles :**
- Seul le owner peut supprimer (`role = 'owner'`)
- Restock : appeler `increment_stock(variant_id, qty)` pour chaque ligne de la commande (depuis `nc_orders.items`)
- Suppression = DELETE définitif de `nc_orders`
- Log dans `nc_events` (`log_type = 'ORDER_DELETED_BY_OWNER'`, `note = 'Restock effectué pour N articles'`)
- Si `stock_deducted = false` sur la commande → restock quand même (log d'avertissement)

**Route à créer :**
```
DELETE /api/orders/[id]
Headers : Authorization: Bearer <token>
Auth requise : role = 'owner'
Body : aucun
Réponse 200 : { ok: true, restocked_items: N }
Réponse 403 : { error: "Accès refusé" }
Réponse 404 : { error: "Commande introuvable" }
```

**Fichiers à modifier :**
- `vercel-quick/app/api/orders/[id]/route.js` (NOUVEAU) — handler DELETE
- Pages dashboard concernées — ajouter bouton supprimer (owner seulement)

---

### H.5 Code partenaire (كود الشريك) — remise sur marge, affichage par article (T112)

**Objectif :** Le client entre un code partenaire (`nc_partenaires`) et voit la remise calculée sur la **marge bénéficiaire** de chaque article, pas sur le prix total.

**Formule de calcul (par article) :**
```
marge_unitaire        = prix_vente - coût_achat (nc_po_lines.purchase_price)
remise_unitaire       = marge_unitaire × percentage / 100
prix_final_article    = prix_vente - remise_unitaire

Exemple : coût=500 DA, vente=1000 DA, code 20%
  → marge = 500 DA
  → remise = 100 DA
  → prix final = 900 DA
```

**Cas sans purchase_price :** Si un article n'a pas de coût dans `nc_po_lines`, il n'a pas de remise (pas de blocage, juste pas de réduction pour cet article).

**Route POST /api/boutique/coupon**
Body : `{ code, items: [{ variant_id, qty, price }] }`
- Valide le code dans `nc_partenaires`
- Cherche `purchase_price` dans `nc_po_lines` pour chaque `variant_id`
- Retourne : `{ valid: true, code, nom, percentage, purchase_prices: { [variant_id]: cost } }`

**Route GET /api/boutique/coupon?code=XXX** — validation simple sans calcul (rétrocompatibilité)

**Affichage réduction par article :**
- **CartDrawer** : prix original barré (gris) + prix remisé (vert) sur chaque carte article
- **commander/page.js** : idem dans le récap commande
- Ligne totaux : `خصم كود الشريك ({percentage}%)` en vert

**Labels (arabe) :**
- Champ input : `كود الشريك`
- Badge coupon confirmé : `✓ كود الشريك {code} — خصم {percentage}%`
- Ligne totaux : `خصم كود الشريك ({percentage}%)`

**Fichiers modifiés :**
- `nc-boutique/app/api/boutique/coupon/route.js` — GET (simple) + POST (retourne purchase_prices)
- `nc-boutique/components/CartDrawer.js` — POST + calcul remise sur marge + affichage par article
- `nc-boutique/app/commander/page.js` — POST + calcul remise sur marge + affichage par article
- `nc-boutique/app/api/boutique/order/route.js` — coupon_discount calculé via purchase_prices

---

### H.6 Suppression article définitive owner (T113)

**Objectif :** Le owner peut supprimer définitivement un article de `nc_variants`.

**Règles :**
- Seul le owner peut supprimer (`role = 'owner'`)
- Modale de confirmation : "⚠️ Cette action est irréversible. Supprimer [nom article] ?"
- Si l'article apparaît dans des commandes `nc_orders` non terminées → AVERTISSEMENT (pas de blocage, le owner confirme quand même)
- DELETE définitif de `nc_variants`
- Log dans `nc_events` (`log_type = 'PRODUCT_DELETED'`)

**Route à créer :**
```
DELETE /api/owner/catalogue/[id]
Headers : Authorization: Bearer <token>
Auth requise : role = 'owner'
Body : aucun
Réponse 200 : { ok: true }
Réponse 409 : { warning: "Article présent dans N commandes actives", can_force: true }
Réponse 403 : { error: "Accès refusé" }
```

**Fichiers à modifier :**
- `vercel-quick/app/dashboard/owner/catalogue/page.js` — bouton + modale confirmation
- `vercel-quick/app/api/owner/catalogue/[id]/route.js` (NOUVEAU) — handler DELETE

---

### H.7 Lecteur code-barres caméra POS (T117)

**Objectif :** Bouton "📷 Scanner" dans le POS qui ouvre la caméra et scanne automatiquement le code-barres pour ajouter un article au panier.

**Stack technique :**
- **API principale** : `BarcodeDetector` (Web API native — Chrome/Edge/Android)
- **Fallback** : librairie `jsQR` (npm) pour les navigateurs non compatibles
- **Compatibilité** : mobile (tablette/téléphone comptoir) + desktop avec webcam

**Flux :**
1. Clic "📷 Scanner" → `getUserMedia({ video: { facingMode: 'environment' } })`
2. Affichage flux vidéo dans un overlay/modal (plein écran sur mobile)
3. Scan en continu (toutes les 200ms) → `BarcodeDetector.detect()` ou `jsQR()`
4. Dès qu'un code est détecté :
   - Fermer la caméra
   - Rechercher dans `nc_variants` via `barcode = [code_détecté]`
   - Si trouvé → ajouter automatiquement au panier POS
   - Si non trouvé → toast "Code-barres non reconnu"
5. Feedback sonore (bip) à la détection (optionnel)

**Performance :**
- Délai cible : < 500ms entre scan et ajout au panier
- Pas de re-render inutile pendant le scan

**Composant à créer :**
```
vercel-quick/components/BarcodeScanner.js
Props : { onDetected(barcode), onClose }
```

**Fichiers à modifier :**
- `vercel-quick/app/dashboard/pos/page.js` — bouton + intégration BarcodeScanner
- `vercel-quick/components/BarcodeScanner.js` (NOUVEAU)

---

### H.8 POS — Tous les articles (y compris rupture), vente forcée (T111)

**Objectif :** Le POS comptoir affiche TOUS les articles actifs, même en rupture de stock. Le owner peut forcer une vente.

**Changements :**
1. **API POS** : supprimer le filtre `inventory_quantity > 0` dans la recherche POS
2. **UI** : badge rouge "نفذ المخزون" (rupture) sur les articles avec `inventory_quantity <= 0`
3. **Ajout au panier** : autorisé même en rupture — le POS est un outil interne
4. **Création commande** : dans `/api/pos/order`, ne pas bloquer si stock ≤ 0 — la vente est forcée
5. **Stock résultant** : peut devenir négatif (log dans `nc_events` si ça arrive)

**Note :** Cette règle s'applique UNIQUEMENT au POS. La boutique publique (`nc-boutique`) conserve la règle H11 (stock 0 = invisible).

**Fichiers à modifier :**
- `vercel-quick/app/dashboard/pos/page.js` — search query sans filtre stock + badge rupture
- `vercel-quick/app/api/pos/order/route.js` — supprimer vérification stock bloquante

---

### H.9 Multi-collections — un produit dans plusieurs collections (T115)

**Objectif :** Dans le catalogue admin owner, pouvoir associer un produit à plusieurs collections simultanément.

**État actuel :**
- `nc_variants.collection_ids` est déjà de type `TEXT[]` (tableau) — la DB est prête
- L'UI actuelle n'affiche qu'un seul select dropdown → à remplacer par multi-select

**UI multi-select (solution recommandée) :**
- Liste des collections depuis `nc_collections` (fetch au chargement du formulaire)
- Affichage : checkboxes ou tags cliquables (style pills)
- Enregistrement : tableau `["slug1", "slug2", ...]` dans `collection_ids`
- Affichage actuel dans la liste catalogue : "N collections" au lieu d'un seul nom

**Route existante à enrichir :** `PATCH /api/owner/catalogue/[id]` — accepte déjà `collection_ids[]`

**Fichiers à modifier :**
- `vercel-quick/app/dashboard/owner/catalogue/page.js` — remplacer le select par multi-select checkboxes

---

### H.10 Playwright humain — test ajout client (T116)

**Objectif :** Test e2e complet du flux inscription/connexion client.

**Scénarios à couvrir :**
1. `POST /api/boutique/auth/register` — inscription avec email + mot de passe + nom + téléphone
2. Vérifier que le client apparaît dans `nc_customers` (SELECT en DB)
3. `POST /api/boutique/auth/login` — connexion avec les mêmes credentials
4. Vérifier que la réponse contient un token JWT valide
5. `GET /api/boutique/auth/me` — vérifier l'identité avec le token
6. **Cleanup** : DELETE du client test dans `nc_customers` après le test

**Fichier à créer :**
```
nc-boutique/tests/e2e/customer.spec.js
```

**data-testid à ajouter (si page compte existe) :**
- `register-email`, `register-password`, `register-phone`, `register-submit`
- `login-email`, `login-password`, `login-submit`
- `account-name` (sur la page /compte après connexion)

---

## PARTIE G — MIGRATION SHOPIFY

```yaml
status: DOCUMENTED
code_status: PARTIAL (Phase M2)
```

Voir `docs/migration/MIGRATION_SCRIPT.md` pour le plan complet.

**Phases :**
| Phase | Statut | Description |
|---|---|---|
| M1 — Extraction | TODO | Migrer compare_at_price, collections, images |
| M2 — Parallèle | IN_PROGRESS | nc-boutique live + Shopify actif |
| M3 — Validation | PENDING | Consolider avant coupure |
| M4 — Coupure | PENDING | Fermeture définitive Shopify |
| M5 — Nettoyage | PENDING | Supprimer code Shopify |

---

## PARTIE 1 — PHASES DU PROJET

```yaml
status: DOCUMENTED
```

| Phase | Durée | Objectif |
|---|---|---|
| Phase 1 MVP | En cours | Commandes COD, catalogue nc_variants, tracking basique |
| Phase 2 Stock natif | Futur | nc_products, nc_stock_movements, barrage sans Shopify |
| Phase 3 Clients | Futur | Comptes clients, historique commandes, connexion Gmail/Tel |
| Phase 4 Shopify off | Futur | Zéro référence Shopify (Phase M4) |
| Phase 5 Analytics | Futur | Dashboard owner analytics complet |

---

## PARTIE 2 — STACK TECHNIQUE

```yaml
status: DONE
```

| Composant | Technologie | Version |
|---|---|---|
| Frontend | Next.js App Router | 15+ |
| Styles | Tailwind CSS | v4 |
| Base de données | Supabase | supabase-js v2 |
| Déploiement | Vercel | Projet séparé `nc-boutique` |
| Livraison | ZR Express | API directe |
| Paiement | COD (à la livraison) | — |

---

## PARTIE 3 — STRUCTURE DOSSIERS

```
nc-boutique/
├── app/
│   ├── page.js                    ← Page choix Coiffure/Onglerie (T03)
│   ├── layout.js                  ← RTL + providers + head
│   ├── globals.css                ← Fond noir, couleurs, Tailwind
│   ├── produits/
│   │   ├── page.js                ← Catalogue
│   │   └── [slug]/page.js         ← Fiche produit
│   ├── commander/page.js          ← Formulaire commande (T05)
│   ├── merci/[id]/page.js         ← Confirmation + WhatsApp
│   ├── suivi/page.js              ← Suivi commande
│   └── api/boutique/
│       ├── products/route.js      ← GET catalogue
│       ├── products/[slug]/route.js ← GET fiche (T06 bug)
│       ├── order/route.js         ← POST commande
│       ├── track/[id]/route.js    ← GET suivi (T12 bug)
│       └── track-event/route.js   ← POST tracking
├── components/
│   ├── Header.js
│   ├── Footer.js
│   ├── ProductCard.js
│   ├── CartDrawer.js              ← À CRÉER (T04)
│   ├── DeliveryForm.js            ← À CRÉER (T05)
│   └── WhatsAppButton.js          ← À CRÉER (T18)
├── context/
│   └── CartContext.js
├── lib/
│   └── supabase.js
├── tests/e2e/                     ← Playwright tests
├── playwright.config.js
├── .env.local                     ← NE PAS COMMITTER
└── PLAN.md                        ← Index court (ce fichier en version courte)
```

---

## PARTIE 4 — SCHEMA SUPABASE

Voir `docs/boutique/SCHEMA.md` pour le détail complet.

---

## PARTIE 5 — API ROUTES

Voir `docs/boutique/API.md` pour le contrat complet.

---

## PARTIE 6 — COMPOSANTS

Voir `docs/boutique/COMPONENTS.md` pour la documentation complète.

---

## PARTIE 7 — FLUX DE DONNÉES

Voir `docs/boutique/DATA_FLOWS.md` pour les flux complets.

---

## PARTIE 8 — CHECKLIST LANCEMENT

### Avant mise en production Phase 1

**Infrastructure**
- [x] Projet Vercel nc-boutique créé
- [x] Variables d'environnement configurées
- [ ] Domaine custom configuré (T20)
- [x] Table `nc_page_events` créée
- [ ] Colonnes boutique ajoutées à `nc_orders`

**Fonctionnalités critiques**
- [x] Catalogue affiche les produits
- [ ] Page de choix Coiffure/Onglerie (T03)
- [ ] Drawer panier (T04)
- [ ] Formulaire commande (T05)
- [ ] Bug fiche produit résolu (T06)
- [ ] Design RTL noir/rouge (T02)

**Tracking**
- [x] Infrastructure nc_page_events
- [ ] Colonne `world` dans nc_page_events (T13)

**Sécurité**
- [x] Idempotency key
- [ ] Rate limiting sur /api/boutique/order
- [x] RLS Supabase

---

## LIENS RAPIDES

| Document | Chemin |
|---|---|
| API routes | `docs/boutique/API.md` |
| Schema DB | `docs/boutique/SCHEMA.md` |
| Composants | `docs/boutique/COMPONENTS.md` |
| Flux données | `docs/boutique/DATA_FLOWS.md` |
| Variables env | `docs/boutique/ENV.md` |
| Bugs et erreurs | `docs/boutique/TROUBLESHOOT.md` |
| Migration Shopify | `docs/migration/MIGRATION_SCRIPT.md` |
| Tâches | `TASKS.md` |
| Décisions | `DECISIONS.md` |
