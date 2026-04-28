# NC-BOUTIQUE — Index de Documentation
> ⚠️ Ce fichier est un INDEX. La documentation complète est dans `docs/boutique/PLAN.md`.
> version: 1.1 | updated: 2026-04-11
> **Règle :** Toute modification passe par `docs/boutique/PLAN.md` d'abord.

---

## LIENS RAPIDES (charger ces fichiers, pas les sections ci-dessous)

| Document | Chemin | Contenu |
|---|---|---|
| **Plan complet** | `docs/boutique/PLAN.md` | Tout — source de vérité |
| **API** | `docs/boutique/API.md` | Routes + contrats |
| **Schema DB** | `docs/boutique/SCHEMA.md` | Tables + colonnes |
| **Composants** | `docs/boutique/COMPONENTS.md` | Composants à créer |
| **Flux données** | `docs/boutique/DATA_FLOWS.md` | Diagrammes flux |
| **Variables env** | `docs/boutique/ENV.md` | NEXT_PUBLIC_*, secrets |
| **Bugs** | `docs/boutique/TROUBLESHOOT.md` | Erreurs connues |
| **Migration** | `docs/migration/MIGRATION_SCRIPT.md` | Plan sortie Shopify |
| **Tâches** | `TASKS.md` | TODO, IN_PROGRESS |
| **Décisions** | `DECISIONS.md` | Historique décisions |

---

## STATUT ACTUEL (mis à jour 2026-04-11)

```
phase: M2 — Lancement Parallèle
blocking_tasks: T01 (compare_at_price), T02 (design RTL), T03 (page choix), T04 (drawer), T05 (formulaire), T06 (bug slug)
next_action: Exécuter T02 (refonte design boutique)
```

---

## TÂCHES CRITIQUES

| ID | Description | Statut |
|---|---|---|
| T01 | Colonnes nc_variants (compare_at_price, collections, is_new) | TODO |
| T02 | Refonte design RTL + fond noir + rouge | TODO |
| T03 | Page choix Coiffure/Onglerie | TODO |
| T04 | Drawer panier latéral | TODO |
| T05 | Formulaire commande conforme | TODO |
| T06 | Bug fiche produit slug | TODO |

Pour la liste complète → `TASKS.md`

---

## MINI-PROMPT (copier-coller en début de session)

```
Je travaille sur nc-boutique (NajmCoiff).
RÈGLES :
1. Lire CONTEXT.md d'abord
2. Lire TASKS.md pour voir les tâches prioritaires
3. Toute modification passe par docs/boutique/PLAN.md avant le code
4. Ne pas modifier vercel-quick/ pour la boutique
5. Toutes les données = Supabase (nc_*)
Phase actuelle : M2 (boutique live, Shopify encore actif)
```

---

> Le contenu complet de ce document (2125 lignes d'historique et de détails)
> est accessible dans `docs/boutique/PLAN.md`.
> Ce fichier court sert d'entrée rapide pour l'IA.

<!-- ARCHIVE — Le contenu original suit ci-dessous (conservé pour référence) -->
<!-- Pour lire la documentation complète, utiliser docs/boutique/PLAN.md -->

# NC-BOUTIQUE — Plan Architectural Complet (ARCHIVE)

> **Rôle de ce document** : Base de connaissance vivante du projet nc-boutique. Source de vérité absolue.
> Lire en entier avant toute intervention. Mettre à jour après chaque décision.
> Stack cible : Next.js · Supabase · Vercel — Aucun outil tiers superflu
> Statut : **Phase Documentation** — Mis à jour : 2026-04-11 (Rounds 1, 2, 3 intégrés)
>
> **Sections clés (nouvelles) :**
> - [A] Identité NAJMCOIFF · [B] Deux Mondes · [C] Collections · [D] UX Commande
> - [E] Multi-Pixel Facebook · [F] Dashboard Owner · [G] Migration Shopify définitive

---

## SOMMAIRE

0. [Workflow IA — Règles et Protocole](#partie-0)
A. [Identité de la marque NAJMCOIFF](#partie-A)
B. [Les Deux Mondes — Coiffure / Onglerie](#partie-B)
C. [Catalogue et Collections Shopify](#partie-C)
D. [Système de commande — UX exact](#partie-D)
E. [Tracking Multi-Pixel Facebook](#partie-E)
F. [Dashboard Owner — espace admin](#partie-F)
G. [Stratégie de migration — sortie définitive Shopify](#partie-G)
1. [Etat des lieux du système actuel](#partie-1)
2. [Vision globale du système cible](#partie-2)
3. [Architecture technique cible](#partie-3)
4. [Structure de données — tables Supabase](#partie-4)
5. [Système de tracking marketing et produit](#partie-5)
6. [Système de logs opérationnels](#partie-6)
7. [Pages de la boutique](#partie-7)
8. [Routes API boutique](#partie-8)
9. [Stratégie de séparation — zéro risque existant](#partie-9)
10. [Stratégie de migration progressive depuis Shopify](#partie-10)
11. [Prévention du double travail](#partie-11)
12. [Variables d'environnement](#partie-12)
13. [Roadmap phases](#partie-13)
14. [Risques identifiés](#partie-14)
15. [Hypothèses documentées](#partie-15)
16. [Historique des décisions](#partie-16)
17. [Checklists de validation](#partie-17)
18. [État actuel du projet](#partie-18)
19. [Accès et credentials](#partie-19)

---

<a name="partie-A"></a>
## PARTIE A — IDENTITÉ DE LA MARQUE NAJMCOIFF

> Cette section est la référence absolue pour tout ce qui touche à l'image de la marque.
> Tout élément visuel de nc-boutique doit être cohérent avec ce qui est documenté ici.

### A.1 — Identité de base

| Élément | Valeur |
|---|---|
| Nom officiel | **NAJMCOIFF** |
| Slogan | **أفضل تجربة لحلاق** (= "La meilleure expérience du coiffeur") |
| Logo | Deux mains squelette croisées tenant des ciseaux, étoile au-dessus, initiales N/C, texte "NAJM COIFF" en bas |
| Format logo | PNG noir/blanc — fichier disponible dans les assets du projet |
| Secteur | Coiffure professionnelle + Onglerie — grossiste/détaillant, Algérie |
| Public cible | Coiffeurs professionnels + grand public |

### A.2 — Charte des couleurs

| Couleur | Usage | Valeur |
|---|---|---|
| Noir profond | Fond principal, textes | `#0a0a0a` (fond) / `#111111` (texte) |
| Rouge vif | Accent principal, boutons d'action, prix promo | `#e63012` (estimé depuis captures) |
| Blanc cassé | Textes sur fond noir, cartes produits | `#f5f5f5` |
| Fond motif | Pattern répétitif d'outils barbershop (comme captures Shopify) | **Non** — fond noir uni sur nc-boutique |

**Règle absolue :** Le fond de nc-boutique est **noir uni** (pas de motif). Cela rend la boutique plus propre, plus rapide à charger, et plus premium que le Shopify actuel.

### A.3 — Règles de langue et direction du texte

| Élément | Langue | Direction |
|---|---|---|
| Navigation, menus, boutons | Arabe | RTL (droite → gauche) |
| Noms des produits | Français | LTR intégré dans bloc RTL |
| Prix | Chiffres + "دج" ou "DA" | Neutre |
| Labels formulaires | Arabe | RTL |
| Messages d'erreur | Arabe | RTL |
| Numéros de commande | Latin (NC-260411-0001) | LTR dans contexte RTL |

**Implémentation technique :** L'attribut `dir="rtl"` est appliqué au `<html>`. Les blocs de noms de produits ont `dir="ltr"` individuellement.

### A.4 — Typographie

| Usage | Police | Justification |
|---|---|---|
| Texte arabe | Noto Kufi Arabic (Google Fonts, gratuite) | Lisibilité excellente, style moderne professionnel |
| Texte français (noms produits) | Système natif (sans-serif) | Pas de chargement supplémentaire |
| Prix, chiffres | Tabular nums (feature CSS) | Alignement propre dans les tableaux de prix |

### A.5 — Références visuelles (captures Shopify actuelles)

Ces captures sont la référence de ce que le client connaît déjà. nc-boutique doit être clairement supérieur en qualité d'expérience, tout en gardant le même esprit visuel.

| Capture | Description | Fichier asset |
|---|---|---|
| Accueil Shopify | Fond noir motif, slider, catégories illustrées | `image-0e197178-...png` |
| Grille collections | 13 tuiles de catégories style cartoon rouge/noir | `image-cbedf216-...png` |
| Panier drawer | Drawer latéral, champ code promo, bouton commander | `image-a5fba1e6-...png` |
| Formulaire commande | Prénom, Nom, Téléphone, Wilaya, Commune, Type livraison | `image-e3357723-...png` |
| Logo officiel | NAJM COIFF — mains squelette — PNG noir/blanc | `300958589_469369...png` |

---

<a name="partie-B"></a>
## PARTIE B — LES DEUX MONDES — COIFFURE / ONGLERIE

> Décision structurelle fondamentale : nc-boutique est en réalité deux boutiques dans une.
> Cette architecture a des implications sur le design, les données, le tracking et le marketing.

### B.1 — Concept des deux mondes

NAJMCOIFF opère sur deux niches distinctes qui ne partagent pas la même clientèle, ni le même univers visuel :

| Dimension | Monde Coiffure | Monde Onglerie |
|---|---|---|
| Public | Coiffeurs, barbiers, hommes | Prothésistes ongulaires, femmes |
| Ambiance visuelle | Noir + Rouge, outils barbershop, masculin | Thème féminin distinct, fleurs, douceur |
| Collections | Toutes sauf "onglerie" | Collections liées à l'onglerie uniquement |
| Pixel Facebook | Pixel Coiffure (ID à configurer) | Pixel Onglerie (ID à configurer) |
| Événements tracking | Jamais croisés avec Onglerie | Jamais croisés avec Coiffure |

### B.2 — Page de choix (entrée du site)

À **chaque visite**, le client arrive sur une page de choix avant d'accéder au catalogue.

```
Page d'entrée (/)
┌──────────────────────────────────────────────────────┐
│               NAJMCOIFF                               │
│           أفضل تجربة لحلاق                           │
│                                                       │
│    ┌──────────────┐    ┌──────────────┐              │
│    │   عالم        │    │   عالم        │              │
│    │  الحلاقة      │    │  الأظافر      │              │
│    │  (Coiffure)  │    │  (Onglerie)  │              │
│    │              │    │              │              │
│    │  [icône      │    │  [icône      │              │
│    │   ciseaux]   │    │   ongle]     │              │
│    └──────────────┘    └──────────────┘              │
└──────────────────────────────────────────────────────┘
```

**Comportement technique :**
- Le monde choisi est stocké dans `sessionStorage` (clé : `nc_world`)
- Toutes les pages suivantes héritent du monde actif
- Le header change selon le monde (couleur accent, logo décoré pour Onglerie)
- Le monde est envoyé dans chaque événement tracking

### B.3 — Thème Monde Coiffure

| Élément | Valeur |
|---|---|
| Fond | `#0a0a0a` noir uni |
| Couleur accent | `#e63012` rouge vif |
| Boutons | Rouge avec texte blanc |
| Logo | NAJMCOIFF original (mains squelette noires) |
| Style général | Masculin, puissant, professionnel |

### B.4 — Thème Monde Onglerie (à définir visuellement par l'IA)

| Élément | Valeur |
|---|---|
| Fond | `#0d0d0d` noir uni (identique, cohérence marque) |
| Couleur accent | Rose poudré `#e8a0bf` ou or doux `#d4a853` — **l'IA choisit au moment du code** |
| Boutons | Rose poudré ou or avec texte noir/blanc |
| Logo | NAJMCOIFF avec éléments floraux décoratifs autour |
| Style général | Féminin, élégant, doux, premium |

**Note architecturale :** Le fond reste noir dans les deux mondes pour maintenir l'identité NAJMCOIFF. Seul l'accent coloré change. Cela évite une refonte totale et maintient la reconnaissance de marque.

### B.5 — Règles de séparation des données

```
Produits Coiffure  → collections_titles NE CONTIENT PAS "onglerie"
Produits Onglerie  → collections_titles CONTIENT "onglerie" (insensible à la casse)
```

**Règle absolue :** Un produit Onglerie n'apparaît JAMAIS dans le monde Coiffure et vice-versa.

### B.6 — Colonne `world` dans nc_page_events

La colonne `world` (text : `'coiffure'` | `'onglerie'`) est ajoutée à `nc_page_events` pour que chaque événement soit identifiable comme appartenant à un monde précis. Cela permet :
- Des rapports séparés par niche
- Des pixels Facebook séparés
- Des taux de conversion distincts par niche

---

<a name="partie-C"></a>
## PARTIE C — CATALOGUE ET COLLECTIONS SHOPIFY

> Ce qui est documenté ici est la référence pour l'organisation du catalogue nc-boutique.

### C.1 — Règles catalogue

| Règle | Valeur |
|---|---|
| Produits à stock 0 | **Jamais affichés** (filtre : `inventory_quantity > 0`) |
| Produits Onglerie | Affichés seulement dans le monde Onglerie |
| Produits Coiffure | Affichés seulement dans le monde Coiffure |
| Chaque article est distinct | Pas de variantes — chaque article est indépendant (simplifie la navigation client algérien) |
| Langue noms produits | Français uniquement |
| Photos | Toutes les photos sont dans Shopify — à migrer vers `nc_variants.image_url` |

### C.2 — Collections identifiées (depuis captures Shopify)

Ces collections doivent apparaître comme catégories navigables dans nc-boutique.

**Monde Coiffure :**

| # | Nom arabe | Traduction | Identifiant technique |
|---|---|---|---|
| 1 | آواخر AWAKHIR | Nouveautés (jamais entrées) | `awakhir` |
| 2 | تخفيضات | Promotions / Destockage | `takhfidhat` |
| 3 | تنظيم وتزيين المحل | Organisation et décoration du salon | `tanzim-tazyeen` |
| 4 | فرشاة ومكسة شعر | Brosses et peignes | `forshat-maksa` |
| 5 | قميص ومئزر حلاقة | Tabliers et capes de coiffure | `qamis-miazar` |
| 6 | ماكينات وأجهزة الحلاقة | Tondeuses et appareils de coiffure | `makinat-ajhiza` |
| 7 | مجففات ومكواة الشعر | Sèche-cheveux et fers à lisser | `mojaffifat-makwa` |
| 8 | مستحضرات وكوسميتيك | Produits cosmétiques et soins | `mostahdarrat-cosmetik` |
| 9 | مشط | Peignes | `mosht` |
| 10 | مقص، شفرات وموس الحلاقة | Ciseaux, rasoirs et lames | `miqas-shafrat` |
| 11 | NOS PACK DE PRODUITS | Packs produits | `pack-produits` |
| 12 | منتجات أخرى | Autres produits | `montajat-okhra` |

**Monde Onglerie :**

| # | Nom | Identifiant technique |
|---|---|---|
| 13 | Onglerie | `onglerie` |

> Note : d'autres sous-collections Onglerie peuvent exister dans Shopify. À vérifier lors de la migration.

### C.3 — Collection AWAKHIR (traitement spécial)

AWAKHIR (آواخر) = collection des **nouveaux articles jamais encore entrés en stock**. Ce ne sont pas des promotions — ce sont des nouveautés absolues.

**Affichage spécial :**
- Badge "جديد" (NOUVEAU) sur chaque carte produit AWAKHIR
- Section dédiée sur l'accueil : "وصل جديد" (Nouvelles arrivées)
- Les deux (badge + section accueil)

**Identification technique :** La collection "AWAKHIR" dans Shopify → champ `collections_titles` dans `nc_variants`.

### C.4 — Colonnes à ajouter dans `nc_variants`

Ces colonnes sont **manquantes** et doivent être ajoutées lors de la migration Shopify :

| Colonne | Type | Description | Source Shopify |
|---|---|---|---|
| `compare_at_price` | numeric | Prix barré (avant réduction) | `variant.compare_at_price` |
| `collections` | text[] | Tableau des collections du produit | `product.collections[].title` |
| `description` | text | Description longue du produit | `product.body_html` (vide pour l'instant) |
| `is_new` | boolean | Marqueur nouveauté (AWAKHIR) | Déduit de la collection "AWAKHIR" |

### C.5 — Tri et affichage par défaut

| Contexte | Tri par défaut | Logique |
|---|---|---|
| Accueil | Mis en avant → stock décroissant | Meilleur stock en premier |
| Catalogue général | Stock décroissant | Disponibles en premier |
| Collection AWAKHIR | Date d'entrée décroissante | Les plus récents en premier |
| Recherche | Pertinence texte | Correspondance titre produit |

---

<a name="partie-D"></a>
## PARTIE D — SYSTÈME DE COMMANDE — UX EXACT

> Basé sur les captures fournies. C'est la référence pour tout développement futur du checkout.
> Zéro improvisation — chaque champ et chaque bouton est documenté ici.

### D.1 — Flux global de commande

```
Client parcourt le catalogue
        │
        ▼
Clique "أضف إلى السلة" (Ajouter au panier)
        │
        ▼
Drawer panier s'ouvre (depuis la droite)
        │
        ▼
Client clique "إنهاء عملية الشراء" (Finaliser)
        │
        ▼
Page /commander (formulaire)
        │
        ▼
Client remplit formulaire + choisit wilaya + commune + type livraison
        │ Prix livraison calculé automatiquement
        ▼
Clique "تأكيد الشراء" (Confirmer l'achat)
        │
        ▼
POST /api/boutique/order
  1. Validation données
  2. Vérification stock
  3. Application code partenaire (si saisi)
  4. Génération numéro NC-
  5. INSERT nc_orders
  6. Tracking événements
        │
        ▼
Page /merci/[id] (confirmation)
  → Numéro de commande affiché
  → Bouton WhatsApp pré-rempli
        │
        ▼
Push notification → tous les agents dashboard
nc_orders visible en temps réel dans dashboard
```

### D.2 — Panier (Drawer latéral)

Le panier s'ouvre depuis la droite sous forme de panneau glissant, **sans quitter la page**.

**Éléments du drawer :**

| Élément | Détail |
|---|---|
| En-tête | "سلة المشتريات" (Panier) + bouton fermer ✕ |
| Liste articles | Image + Nom produit + Prix + Boutons − Quantité + |
| Bouton supprimer | ✕ rouge pour retirer un article |
| Sous-total | Total en DZD affiché en bas |
| Champ code partenaire | Label : "أدخل كود الشريك" + bouton "تطبيق" (Appliquer) |
| Bouton finaliser | "إنهاء عملية الشراء" — pleine largeur, couleur accent |

**Comportement code partenaire :**
- Si code valide → réduction appliquée, total mis à jour, message de confirmation
- Si code invalide → message d'erreur en arabe
- La remise est en pourcentage (source : `nc_partenaires.percentage`)

### D.3 — Formulaire de commande

Basé exactement sur la capture fournie (style تأكيد الطلب).

| # | Champ | Label arabe | Type | Validation |
|---|---|---|---|---|
| 1 | Prénom | الاسم | text | Obligatoire |
| 2 | Nom | اللقب | text | Obligatoire |
| 3 | Téléphone | رقم الهاتف | tel | Format algérien (05/06/07 + 8 chiffres) |
| 4 | Wilaya | الولاية | dropdown | 58 wilayas, noms selon ZR Express |
| 5 | Commune | البلدية | dropdown | Filtrée selon wilaya choisie — source : liste à fournir |
| 6 | Type livraison | — | toggle | للمنزل (domicile) / للمكتب (bureau) |

**Récapitulatif (non modifiable, affiché en bas du formulaire) :**

| Ligne | Arabe | Valeur |
|---|---|---|
| Prix produits | سعر المنتجات | Total panier DZD |
| Prix livraison | سعر التوصيل | Calculé selon wilaya + type (domicile/bureau) |
| Total général | المجموع الكلي | En gras, couleur accent |

**Bouton de confirmation :** "تأكيد الشراء" — pleine largeur, couleur accent

### D.4 — Table `nc_delivery_config` (nouvelle table)

Gère les prix de livraison par wilaya et commune. Administrée depuis le dashboard owner.

```sql
id              uuid    PRIMARY KEY DEFAULT gen_random_uuid()
wilaya_code     integer NOT NULL          -- 01 à 58
wilaya_name     text    NOT NULL          -- nom selon ZR Express
commune_name    text    NOT NULL          -- nom de la commune
price_home      integer NOT NULL          -- prix livraison domicile (DZD)
price_office    integer NOT NULL          -- prix livraison bureau (DZD)
is_active       boolean DEFAULT true      -- activer/désactiver une zone
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

**Source des données :** Liste des communes à fournir par le propriétaire. Interface d'administration dans le dashboard owner pour modifier les prix sans toucher au code.

### D.5 — Page de confirmation (après commande)

URL : `/merci/[order_id]`

| Élément | Détail |
|---|---|
| Numéro commande | NC-YYMMDD-XXXX en grand, couleur accent |
| Message de remerciement | "شكراً لطلبك! سنتواصل معك قريباً" |
| Résumé commande | Articles commandés + total |
| Wilaya + type livraison | Rappel des infos de livraison |
| Délai | "سيتم التوصيل خلال 24 إلى 48 ساعة" |
| Bouton WhatsApp | "أكد طلبك عبر واتساب" — ouvre WhatsApp avec message pré-rempli |
| Bouton retour | "متابعة التسوق" → retour accueil |

**Message WhatsApp pré-rempli (template) :**
```
مرحباً، أريد تأكيد طلبي رقم [NC-YYMMDD-XXXX]
الاسم: [Prénom Nom]
الولاية: [Wilaya] - [Commune]
المجموع: [Total] دج
```
Le numéro WhatsApp de destination est configurable depuis le dashboard owner (paramètre `whatsapp_number`).

### D.6 — Intégration dashboard agents

Dès qu'une commande est placée sur nc-boutique :
1. Elle apparaît dans `nc_orders` avec `order_source = 'nc_boutique'`
2. Le dashboard agents (vercel-quick) la voit en temps réel via Supabase Realtime
3. Push notification envoyée à **tous** les agents connectés
4. Les agents la traitent exactement comme une commande Shopify (même flux : confirmation → ZR → livraison)
5. Aucune modification du dashboard agents requise — il lit déjà `nc_orders`

---

<a name="partie-E"></a>
## PARTIE E — TRACKING MULTI-PIXEL FACEBOOK

> Système de tracking avancé. Priorité haute. Documenté avec précision car il a des règles strictes.

### E.1 — Architecture générale

```
Visite client sur nc-boutique
        │
        ├─── Monde Coiffure ────► Pixel Facebook COIFFURE
        │                               (côté navigateur + server-side CAPI)
        │
        └─── Monde Onglerie ───► Pixel Facebook ONGLERIE
                                        (côté navigateur + server-side CAPI)

RÈGLE ABSOLUE : Ces deux flux ne se croisent JAMAIS.
Un événement Onglerie ne part JAMAIS vers le Pixel Coiffure, et vice-versa.
```

**Pourquoi deux pixels séparés ?**
- Les audiences Facebook sont distinctes (homme/coiffeur vs femme/onglerie)
- Les campagnes publicitaires sont séparées par niche
- Les algorithmes Meta apprennent mieux avec des données homogènes
- Les rapports de conversion sont propres et non pollués

### E.2 — Composantes du système

| Composante | Rôle | Priorité |
|---|---|---|
| Pixel browser (côté client) | Events navigateur classiques (PageView, ViewContent, AddToCart...) | Phase 1 |
| Conversions API (server-side) | Events côté serveur — résiste aux adblockers | Phase 2 |
| Déduplication | Évite le double comptage browser + server | Phase 2 |
| nc_page_events.world | Identifie le monde pour chaque événement stocké | Phase 1 |

### E.3 — Variables d'environnement requises

| Variable | Description |
|---|---|
| `META_PIXEL_COIFFURE` | ID du Pixel Facebook pour le monde Coiffure |
| `META_PIXEL_ONGLERIE` | ID du Pixel Facebook pour le monde Onglerie |
| `META_ACCESS_TOKEN_COIFFURE` | Token CAPI pour le monde Coiffure (server-side) |
| `META_ACCESS_TOKEN_ONGLERIE` | Token CAPI pour le monde Onglerie (server-side) |

**Statut actuel :** Ces IDs et tokens n'ont pas encore été créés dans Meta Business Manager. À configurer avant l'activation du tracking.

### E.4 — Événements à tracker (mapping nc_page_events → Facebook)

| nc_page_events event_type | Facebook Standard Event | Monde concerné |
|---|---|---|
| `PAGE_VIEW` | `PageView` | Selon monde actif |
| `PRODUCT_VIEW` | `ViewContent` | Selon monde du produit |
| `CART_ADD` | `AddToCart` | Selon monde du produit |
| `CHECKOUT_START` | `InitiateCheckout` | Selon monde du panier |
| `ORDER_PLACED` | `Purchase` | Selon monde de la commande |
| `SEARCH` | `Search` | Selon monde actif |

### E.5 — Gestion de la déduplication

Chaque événement envoyé côté server-side doit inclure un `event_id` unique pour que Meta puisse dédupliquer avec le même événement envoyé côté browser.

```javascript
// Format de l'event_id
event_id = `${session_id}_${event_type}_${Date.now()}`
// Stocké dans nc_page_events.metadata.event_id
```

### E.6 — Analytics propre (pas Google Analytics)

Par décision du propriétaire, **aucun outil tiers d'analytics (Google Analytics, GTM, Hotjar...)** n'est utilisé. Toute l'analyse de performance se fait via :
- `nc_page_events` : comportement client
- `nc_orders` : conversions et revenus
- `nc_events` : logs opérationnels
- Dashboard owner (à construire en Phase 3) : visualisation de ces données

---

<a name="partie-F"></a>
## PARTIE F — DASHBOARD OWNER — ESPACE ADMIN

> Le dashboard owner n'est PAS un site séparé. Il est intégré dans le dashboard agents existant (vercel-quick).
> Accessible uniquement au propriétaire (rôle `owner` dans nc_users).

### F.1 — Principe d'intégration

```
vercel-quick (dashboard existant)
├── /dashboard/* → agents (confirmation, préparation, ZR, stock...)
└── /dashboard/owner/* → propriétaire uniquement (nouveau)
    ├── /dashboard/owner/boutique  → paramètres boutique
    ├── /dashboard/owner/livraison → communes + prix
    ├── /dashboard/owner/partenaires → codes promo
    ├── /dashboard/owner/banners  → sliders accueil
    └── /dashboard/owner/doc      → PLAN.md (lecture)
```

**Sécurité :** Chaque page `/dashboard/owner/*` vérifie que `nc_users.role = 'owner'` ou que `nc_users.username = 'najm'`. Redirection vers 403 sinon.

### F.2 — Colonne `role` dans `nc_users`

```sql
ALTER TABLE nc_users ADD COLUMN IF NOT EXISTS role text DEFAULT 'agent';
-- Valeurs : 'agent' | 'owner'
-- Le user 'najm' doit être mis à jour : UPDATE nc_users SET role='owner' WHERE username='najm';
```

### F.3 — Fonctionnalités du dashboard owner

#### F.3.1 — Paramètres boutique (`nc_boutique_config`)

Nouvelle table de configuration clé/valeur :

```sql
CREATE TABLE nc_boutique_config (
  key    text PRIMARY KEY,
  value  text NOT NULL,
  label  text,           -- description lisible humain
  updated_at timestamptz DEFAULT now()
);
```

Paramètres gérables depuis l'interface owner :

| Clé | Description | Exemple |
|---|---|---|
| `promo_banner_text` | Texte de la barre promo en haut | "لا تفوت تخفيضات الشهر الحالي" |
| `promo_banner_active` | Afficher/cacher la barre promo | "true" |
| `whatsapp_number` | Numéro WhatsApp boutique | "213XXXXXXXXX" |
| `facebook_coiffure` | Lien page Facebook Coiffure | "https://fb.com/najmcoiff" |
| `instagram_handle` | Handle Instagram | "@najmcoiff" |
| `meta_pixel_coiffure` | ID Pixel Facebook Coiffure | "XXXXXXXXXXXXXXX" |
| `meta_pixel_onglerie` | ID Pixel Facebook Onglerie | "XXXXXXXXXXXXXXX" |

#### F.3.2 — Gestion livraison (`nc_delivery_config`)

Interface CRUD pour gérer les communes et prix :
- Tableau : Wilaya | Commune | Prix domicile | Prix bureau | Actif
- Boutons modifier/activer/désactiver par ligne
- Import CSV prévu (pour la liste initiale à fournir)

#### F.3.3 — Gestion codes partenaires (`nc_partenaires`)

Interface existante à étendre :
- Liste des codes avec pourcentage de remise et statut actif/inactif
- Bouton activer/désactiver

#### F.3.4 — Gestion banners (`nc_banners`)

Nouvelle table pour les sliders de l'accueil :

```sql
CREATE TABLE nc_banners (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world      text NOT NULL,    -- 'coiffure' | 'onglerie' | 'both'
  image_url  text NOT NULL,
  link_url   text,             -- lien au clic (optionnel)
  alt_text   text,
  sort_order integer DEFAULT 0,
  is_active  boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```

#### F.3.5 — Page documentation (`/dashboard/owner/doc`)

Affiche le contenu de `nc-boutique/PLAN.md` converti en HTML lisible.
- Lecture seule
- Sommaire cliquable
- Toujours la version la plus récente

### F.4 — Tables nouvelles du dashboard owner

| Table | Rôle | Créée |
|---|---|---|
| `nc_boutique_config` | Paramètres boutique clé/valeur | À créer |
| `nc_delivery_config` | Communes + prix livraison | À créer |
| `nc_banners` | Sliders accueil boutique | À créer |

---

<a name="partie-G"></a>
## PARTIE G — STRATÉGIE DE MIGRATION — SORTIE DÉFINITIVE DE SHOPIFY

> Décision finale du propriétaire : **on quitte Shopify pour de bon**.
> Ce n'est pas une migration progressive — c'est une sortie contrôlée et définitive.

### G.1 — La décision

| Avant (actuel) | Après (cible) |
|---|---|
| Shopify = catalogue + commandes + stock | Supabase = catalogue + commandes + stock |
| Frais Shopify mensuels | Zéro frais plateforme |
| Données chez Shopify | Données 100% dans notre Supabase |
| Dépendance API Shopify | Zéro dépendance externe |
| 6 fichiers GAS | 0 fichier GAS |

### G.2 — Phases de migration

**Phase M1 — Extraction Shopify (avant lancement nc-boutique)**

Objectif : Avoir toutes les données produits dans `nc_variants` avec les nouveaux champs.

Actions :
1. Créer un script de migration PowerShell/Node.js
2. Appel API Shopify : `GET /products.json` (pagination par 250)
3. Pour chaque produit : extraire `compare_at_price`, `body_html`, `collections`, `images[0].src`
4. Mettre à jour `nc_variants` via Supabase Service Role
5. Marquer les produits AWAKHIR (`is_new = true`)
6. Vérifier : 100% des produits ont une photo et une collection

**Phase M2 — Lancement nc-boutique en parallèle**

Objectif : nc-boutique fonctionne, Shopify reste actif en lecture seule.

- nc-boutique lit depuis `nc_variants` (Supabase)
- Les nouvelles commandes vont dans `nc_orders` (`order_source = 'nc_boutique'`)
- Shopify n'est plus la source de nouvelles commandes
- Les agents traitent les commandes depuis le dashboard comme d'habitude

**Phase M3 — Tests et validation**

Objectif : S'assurer que tout fonctionne avant de couper.

Checklist avant de couper Shopify :
- [ ] 100 commandes passées par nc-boutique sans erreur
- [ ] Tous les produits visibles avec photos et prix corrects
- [ ] Suivi colis ZR fonctionne depuis les commandes nc-boutique
- [ ] Dashboard agents traite les commandes normalement
- [ ] Tracking Facebook opérationnel (2 pixels)
- [ ] Page de suivi client fonctionne
- [ ] Codes partenaires fonctionnent
- [ ] Push notifications agents fonctionnent

**Phase M4 — Coupure Shopify**

Actions dans l'ordre :
1. Désactiver le webhook Shopify (`webhooks/shopify/route.js`)
2. Supprimer les variables d'environnement Shopify de Vercel
3. Retirer les références Shopify du code GAS
4. Archiver les 6 fichiers GAS (ne pas supprimer — garder pour audit)
5. Désactiver le shop Shopify (ne pas supprimer — garder 30 jours au cas où)
6. Mettre à jour AGENTS.md : retirer toutes les mentions Shopify

**Phase M5 — Nettoyage final**

- Supprimer toutes les fonctions GAS du code actif
- Supprimer les colonnes Shopify obsolètes de `nc_orders`
- Fermer le compte Shopify

### G.3 — Ce qu'on ne migre PAS

| Donnée | Décision | Raison |
|---|---|---|
| Historique commandes Shopify | Non migré | Déjà dans `nc_orders` — disponible |
| Comptes clients Shopify | Non migré | Les clients recommandent depuis zéro |
| URLs Shopify | Non redirigées | Le domaine Shopify disparaît de toute façon |
| Reviews/avis Shopify | Non migré | Pas de système d'avis dans Shopify actuel |

### G.4 — Risques et mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Données produits incomplètes après migration | Haut | Vérifier 100% des produits avant de couper |
| Bug dans commande nc-boutique | Haut | Tester 100 commandes en phase M3 |
| Agents perdus sans Shopify | Moyen | Former les agents sur le nouveau flux |
| Perte de données historiques | Bas | nc_orders contient déjà tout l'historique |

---

<a name="partie-1"></a>
## PARTIE 1 — ETAT DES LIEUX DU SYSTÈME ACTUEL

> Cette partie documente ce qui existe. Ne rien changer à ce qui est décrit ici.

### 1.1 Ce que Shopify fait aujourd'hui (rôles actifs)

| Rôle | Détail | Fichier concerné |
|---|---|---|
| Réception commandes online | Shopify reçoit les commandes du site web (EasySell, mobile) | `webhooks/shopify/route.js` |
| Réception commandes POS | Caisse physique via Shopify POS (tablette/iPad) | `webhooks/shopify/route.js` |
| Catalogue produits | Produits, variantes, photos, prix, SKU, barcodes | `nc_variants` (cache) |
| Gestion du stock | Niveaux d'inventaire par location | `barrage/run/route.js`, GAS INJECTER |
| Modification de commande | Recréation via Draft Order (annule + recrée) | GAS MODIFIER |
| Injection PO → stock | Réception d'achat → ajustement inventaire Shopify | GAS INJECTER BON DE COMMANDE |
| URL admin commande | Lien direct vers admin.shopify.com pour les agents | `nc_orders.shopify_order_url` |
| Numérotation commandes | #1001, #1002 style Shopify → référence client | `nc_orders.shopify_order_name` |
| Images produits | Photos variantes via Shopify GraphQL | `orders/for-modify/route.js` |
| Annulation commande | `shopifyCancelOrder()` via Admin REST API | `lib/shopify.js` |
| Webhook inventaire | Events `inventory_levels/update` → nc_events | `webhooks/shopify/route.js` |

### 1.2 Stack dashboard existant

| Couche | Technologie | Version |
|---|---|---|
| Frontend | Next.js App Router | 16.2.2 |
| UI | React + Tailwind CSS | 19.2.4 / v4 |
| Base de données | Supabase | `@supabase/supabase-js` v2 |
| Déploiement | Vercel (standalone) | — |
| Tests | Playwright | v1.59 |

### 1.3 Tables Supabase actuellement actives (15)

```
nc_orders           → commandes (Shopify + future nc_boutique)
nc_variants         → cache variantes Shopify (catalogue + stock)
nc_events           → logs opérationnels globaux
nc_gas_logs         → logs d'exécution GAS
nc_barrage          → seuils stock anti-rupture
nc_users            → agents dashboard (auth interne)
nc_suivi_zr         → suivi colis ZR Express
nc_rapports         → rapports journaliers agents
nc_po_lines         → lignes bons de commande fournisseur
nc_gestion_fond     → transactions caisse
nc_kpi_stock        → KPI stock (achats, jamais vendus)
nc_quota            → quotas agents
nc_quota_orders     → commandes rattachées aux quotas
nc_partenaires      → codes partenaires remise
nc_recettes         → recettes journalières
```

### 1.4 Routes Vercel actives (dashboard — à ne pas toucher)

Voir `AGENTS.md` pour la liste complète. Toutes les routes sous `/api/` du projet `vercel-quick/` sont stables et ne doivent pas être modifiées.

### 1.5 Dépendances Shopify à démanteler progressivement

| Dépendance | Où | Priorité |
|---|---|---|
| `SHOPIFY_ACCESS_TOKEN` | `lib/shopify.js`, GAS | Après Phase 2 |
| `SHOPIFY_WEBHOOK_SECRET` | `webhooks/shopify/route.js` | Après Phase 2 |
| `8fc262.myshopify.com` domaine codé | GAS + `lib/shopify.js` | Après Phase 2 |
| `inventory_item_id` dans nc_variants | Routes stock | Supprimer en Phase 2 |
| `shopify_order_name` comme référence | `nc_orders`, dashboard | Remplacer par NC-XXXX |
| GAS MODIFIER (Draft Order) | `/api/gas` | Remplacer en Phase 3 |
| GAS INJECTER (PO inventaire) | `/api/gas` | Remplacer en Phase 2 |

---

<a name="partie-2"></a>
## PARTIE 2 — VISION GLOBALE DU SYSTÈME CIBLE

### 2.1 Le système final en 3 couches

```
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE 1 — BOUTIQUE PUBLIQUE (nc-boutique)                     │
│  Vitrine client · Catalogue · Panier · Commande · Suivi colis   │
│  Domaine : boutique.najmcoiff.com (ou autre domaine choisi)     │
│  Public : tous les clients                                      │
├─────────────────────────────────────────────────────────────────┤
│  COUCHE 2 — DASHBOARD AGENTS (vercel-quick — existant)          │
│  Confirmation · Préparation · ZR · Stock · Finance · Logs       │
│  Domaine : najmcoiffdashboard.vercel.app                        │
│  Public : agents et équipe interne uniquement                   │
├─────────────────────────────────────────────────────────────────┤
│  COUCHE 3 — DASHBOARD OWNER (futur — Phase 4+)                  │
│  Analytics · BI · IA · Automatisation · Supervision             │
│  Domaine : owner.najmcoiff.com                                   │
│  Public : propriétaire uniquement                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   SUPABASE (nc_*) │
                    │  Source unique de │
                    │  vérité des données│
                    └───────────────────┘
```

**Principe fondamental :** Les 3 couches sont indépendantes techniquement (3 projets Vercel séparés) mais partagent le même Supabase. Une commande créée dans nc-boutique est immédiatement visible dans le dashboard agents — sans synchronisation, sans migration, sans délai.

### 2.2 Objectifs business du système cible

| Objectif | Mesure de succès |
|---|---|
| Vitrine professionnelle propriétaire | Site boutique live avec design maîtrisé |
| Zéro frais Shopify | Abonnement Shopify résilié en Phase 3 |
| Tracking marketing complet | Taux de conversion calculable depuis nc_page_events |
| Analyse comportementale | Tunnel achat analysable (vue → panier → commande) |
| Automatisation maximale | Abandon panier, rappels SMS/email (Phase 4) |
| Pilotage par IA (futur) | Recommandations produits, prévision stock, prévision revenus |

### 2.3 Ce que nc-boutique doit permettre dès Phase 1

1. Un client visite la boutique depuis son téléphone
2. Il voit le catalogue (produits + photos + prix)
3. Il ajoute des articles au panier
4. Il remplit un formulaire (nom, téléphone, wilaya, adresse)
5. Sa commande apparaît dans le dashboard agents avec le numéro NC-260411-0001
6. Un agent la traite exactement comme une commande Shopify
7. Chaque action client est tracée dans `nc_page_events`

---

<a name="partie-3"></a>
## PARTIE 3 — ARCHITECTURE TECHNIQUE CIBLE

### 3.1 Décision fondamentale : projet Vercel séparé

**Choix retenu : nc-boutique est un projet Vercel DISTINCT du dashboard.**

| Raison | Explication simple |
|---|---|
| Deux audiences différentes | La boutique est publique, le dashboard est privé |
| Performance différente | La boutique a besoin de SEO, SSR, cache — le dashboard non |
| Déploiements indépendants | Mettre à jour la boutique ne risque pas de casser le dashboard |
| Domaine séparé | boutique.X pour les clients, dashboard.X pour les agents |
| Zéro dette croisée | Chaque projet peut évoluer à son propre rythme |

**Ce qui est partagé :** Supabase uniquement. Les données sont centralisées, le code est indépendant.

### 3.2 Stack nc-boutique (identique au dashboard — zéro nouvel outil)

| Couche | Technologie | Justification |
|---|---|---|
| Frontend | Next.js App Router | Même stack que dashboard — cohérence totale |
| UI | React 19 + Tailwind CSS v4 | Même versions — zéro apprentissage |
| Base de données | Supabase `@supabase/supabase-js` v2 | Même instance, mêmes patterns |
| Déploiement | Vercel | Même hébergeur — gestion simplifiée |
| CMS produits | Aucun — catalogue depuis `nc_variants` (Phase 1) puis `nc_products` (Phase 2) | Evite une dépendance externe |

**Règle de stabilité :** On n'introduit aucune librairie qui n'existe pas déjà dans `vercel-quick/package.json`. Chaque nouvelle dépendance doit être justifiée.

### 3.3 Diagramme de flux d'une commande nc-boutique

```
Client (mobile/web)
        │
        ▼
nc-boutique (Next.js)
  /produits → affiche nc_variants (Supabase READ, anon key)
  /panier   → localStorage
  /commander → formulaire
        │
        ▼
POST /api/boutique/order (Vercel serverless)
  1. Vérifie stock disponible (nc_variants.inventory_quantity)
  2. Génère numéro NC-YYMMDD-XXXX
  3. INSERT nc_orders (order_source='nc_boutique')
  4. INSERT nc_page_events (ORDER_PLACED)
  5. INSERT nc_events (BOUTIQUE_ORDER_PLACED)
        │
        ▼
Supabase nc_orders
        │
        ▼ (temps réel via Supabase realtime)
Dashboard agents (vercel-quick)
  /dashboard/confirmation → commande visible immédiatement
```

---

<a name="partie-4"></a>
## PARTIE 4 — STRUCTURE DE DONNÉES — TABLES SUPABASE

> Toutes ces tables sont créées en ADDITION aux 15 tables existantes.
> Aucune table existante n'est modifiée, renommée ou supprimée.
> Le SQL complet est dans `docs/BOUTIQUE_SCHEMA.sql`.

### 4.1 Table `nc_page_events` (Phase 1 — tracking)

```sql
id              uuid    PRIMARY KEY DEFAULT gen_random_uuid()
session_id      text    NOT NULL          -- ID session client (localStorage)
event_type      text    NOT NULL          -- voir nomenclature section 5
page            text                      -- URL de la page
product_id      text                      -- ID produit si applicable
variant_id      text                      -- ID variante si applicable
order_id        text                      -- ID commande si applicable
metadata        jsonb   DEFAULT '{}'      -- données contextuelles libres
utm_source      text                      -- source marketing (google, facebook...)
utm_medium      text                      -- medium (cpc, organic, social...)
utm_campaign    text                      -- nom de la campagne
utm_content     text                      -- variante pub
utm_term        text                      -- mot clé
referrer        text                      -- URL d'origine
user_agent      text                      -- navigateur/device
ip_hash         text                      -- hash SHA-256 de l'IP (RGPD)
created_at      timestamptz DEFAULT now()
```

### 4.2 Table `nc_products` (Phase 1 — catalogue natif futur)

```sql
id              uuid    PRIMARY KEY DEFAULT gen_random_uuid()
slug            text    UNIQUE NOT NULL   -- URL : /produits/shampoing-argan
title           text    NOT NULL          -- nom du produit
description     text                      -- description longue (HTML ou markdown)
short_desc      text                      -- description courte (meta, cartes)
images          jsonb   DEFAULT '[]'      -- [{url, alt, position, is_main}]
category        text                      -- catégorie principale
subcategory     text                      -- sous-catégorie
tags            text[]  DEFAULT '{}'      -- tags libres pour filtres
brand           text                      -- marque / fournisseur
is_active       boolean DEFAULT true      -- visible en boutique
is_featured     boolean DEFAULT false     -- mis en avant (accueil, top)
sort_order      integer DEFAULT 0         -- ordre d'affichage
meta_title      text                      -- balise <title> SEO
meta_description text                     -- balise <meta description> SEO
shopify_product_id text                   -- ID Shopify origine (migration)
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

### 4.3 Table `nc_stock_movements` (Phase 2 — piste d'audit stock)

```sql
id              uuid    PRIMARY KEY DEFAULT gen_random_uuid()
variant_id      text    NOT NULL          -- référence nc_variants.variant_id
movement_type   text    NOT NULL          -- SALE | PO_RECEIPT | ADJUSTMENT | RETURN | BARRAGE
qty_before      integer NOT NULL          -- stock avant mouvement
qty_change      integer NOT NULL          -- delta (négatif si sortie)
qty_after       integer NOT NULL          -- stock après mouvement
order_id        text                      -- commande liée si SALE
po_id           text                      -- bon de commande lié si PO_RECEIPT
agent           text                      -- agent ou 'system' si automatique
note            text                      -- commentaire libre
source          text    DEFAULT 'nc_boutique' -- nc_boutique | dashboard | GAS
created_at      timestamptz DEFAULT now()
```

### 4.4 Table `nc_customers` (Phase 2 — comptes clients)

```sql
id              uuid    PRIMARY KEY DEFAULT gen_random_uuid()
phone           text    UNIQUE NOT NULL   -- téléphone (identifiant principal)
full_name       text    NOT NULL
wilaya          text
address         text
email           text                      -- optionnel
total_orders    integer DEFAULT 0         -- compteur mis à jour par trigger
total_spent     numeric DEFAULT 0         -- total DZD dépensé
is_blocked      boolean DEFAULT false     -- bloquer un client problématique
notes           text                      -- notes internes agents
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

### 4.5 Table `nc_carts` (Phase 1 optionnel — paniers persistés)

```sql
id              uuid    PRIMARY KEY DEFAULT gen_random_uuid()
session_id      text    NOT NULL          -- même session_id que nc_page_events
items           jsonb   DEFAULT '[]'      -- [{variant_id, qty, price, title, image}]
phone           text                      -- renseigné si client identifié
expires_at      timestamptz               -- expiration automatique (24h)
converted       boolean DEFAULT false     -- true si commande passée
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

### 4.6 Evolution de `nc_orders` pour nc_boutique

Ces colonnes sont ajoutées à la table existante (ALTER TABLE — non destructif) :

```sql
order_name        text    -- NC-YYMMDD-XXXX (remplace shopify_order_name progressivement)
delivery_mode     text    -- remplace shopify_delivery_mode
order_source      text    -- ajoute 'nc_boutique' comme valeur possible
session_id        text    -- session client boutique (lien avec nc_page_events)
idempotency_key   text    -- clé anti-doublon (UNIQUE)
utm_source        text    -- source marketing de la commande
utm_medium        text    -- medium marketing
utm_campaign      text    -- campagne marketing
```

**Valeurs possibles de `order_source` après évolution :**
- `'shopify'` — webhook Shopify (existant)
- `'web'` — EasySell web (existant)
- `'web_easysell'` — EasySell (existant)
- `'pos'` — Shopify POS (existant)
- `'nc_boutique'` — notre nouvelle boutique (nouveau)

**Statut :** ✅ Ces colonnes ont déjà été ajoutées à Supabase le 2026-04-11.

### 4.7 Evolution de `nc_variants` pour nc_boutique

Ces colonnes sont **manquantes** et seront ajoutées lors de la migration Shopify (Phase M1) :

```sql
ALTER TABLE nc_variants
  ADD COLUMN IF NOT EXISTS compare_at_price  numeric,     -- prix barré Shopify
  ADD COLUMN IF NOT EXISTS collections       text[],      -- ['Brosses', 'Coiffure', ...]
  ADD COLUMN IF NOT EXISTS description       text,        -- description produit (vide init.)
  ADD COLUMN IF NOT EXISTS is_new            boolean DEFAULT false; -- marqueur AWAKHIR
```

**Statut :** ❌ À créer — via script de migration Shopify (Phase M1).

### 4.8 Nouvelles tables dashboard owner

Ces tables seront créées lors du développement du dashboard owner (Phase 2) :

**Table `nc_boutique_config`** — paramètres boutique clé/valeur :
```sql
CREATE TABLE nc_boutique_config (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  label       text,
  updated_at  timestamptz DEFAULT now()
);
```

**Table `nc_delivery_config`** — communes et prix de livraison :
```sql
CREATE TABLE nc_delivery_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wilaya_code   integer NOT NULL,
  wilaya_name   text NOT NULL,
  commune_name  text NOT NULL,
  price_home    integer NOT NULL,   -- prix domicile (DZD)
  price_office  integer NOT NULL,   -- prix bureau (DZD)
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
```

**Table `nc_banners`** — sliders et banners de l'accueil :
```sql
CREATE TABLE nc_banners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world       text NOT NULL,    -- 'coiffure' | 'onglerie' | 'both'
  image_url   text NOT NULL,
  link_url    text,
  alt_text    text,
  sort_order  integer DEFAULT 0,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
```

**Statut :** ❌ À créer — lors du développement Phase 2.

---

<a name="partie-5"></a>
## PARTIE 5 — SYSTÈME DE TRACKING MARKETING ET PRODUIT

### 5.1 Principe de collecte

```
Client (navigateur)
  ├── Événements de navigation → lib/track.js → POST /api/boutique/track-event
  │   (fire & forget : n'affecte pas les performances de la page)
  └── Événement ORDER_PLACED  → collecté côté SERVEUR (fiable, non bloquable)
```

**Règle de fiabilité :** L'événement `ORDER_PLACED` est toujours émis depuis le serveur (dans la route `/api/boutique/order`) pour être 100% fiable. Les adblockers ne peuvent pas l'intercepter.

### 5.2 Nomenclature complète des événements (source de vérité)

| event_type | Quand | Données dans `metadata` |
|---|---|---|
| `PAGE_VIEW` | Chaque page visitée | `{page_title}` |
| `PRODUCT_VIEW` | Fiche produit ouverte | `{product_id, title, category, price}` |
| `PRODUCT_VARIANT_SELECT` | Variante choisie | `{variant_id, variant_title, price, stock}` |
| `CART_ADD` | Article ajouté | `{variant_id, title, price, qty, cart_total}` |
| `CART_REMOVE` | Article retiré | `{variant_id, title, qty_removed}` |
| `CART_VIEW` | Panier ouvert | `{item_count, cart_total}` |
| `CHECKOUT_START` | Page /commander chargée | `{item_count, cart_total}` |
| `CHECKOUT_STEP` | Champ formulaire renseigné | `{field_name}` |
| `ORDER_PLACED` | Commande soumise (serveur) | `{order_id, order_name, total, item_count, wilaya}` |
| `ORDER_FAILED` | Erreur soumission | `{error_code, error_message}` |
| `TRACK_VIEW` | Page suivi visitée | `{order_id, status}` |
| `SEARCH` | Recherche produit | `{query, results_count}` |
| `FILTER_APPLIED` | Filtre catalogue | `{filter_type, filter_value}` |
| `SHARE` | Partage produit | `{product_id, channel}` |

### 5.3 Session tracking

```javascript
// Génération du session_id (une seule fois par visiteur, persisté localStorage)
function getSessionId() {
  let id = localStorage.getItem('nc_session_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('nc_session_id', id);
  }
  return id;
}
```

**Règles RGPD :**
- Pas de cookie de tracking — uniquement localStorage
- L'IP est hashée (SHA-256) avant stockage — jamais l'IP brute
- Pas de données personnelles dans `nc_page_events` (nom, téléphone hors scope)

### 5.4 Collecte des UTM (paramètres marketing)

```javascript
// Lecture automatique des UTMs depuis l'URL
// Ex: boutique.com/produits?utm_source=facebook&utm_campaign=ete2026
function getUtmParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    utm_source:   p.get('utm_source'),
    utm_medium:   p.get('utm_medium'),
    utm_campaign: p.get('utm_campaign'),
    utm_content:  p.get('utm_content'),
    utm_term:     p.get('utm_term'),
  };
}
```

### 5.5 Analyses possibles sur `nc_page_events` (Phase 4)

| Analyse | Requête SQL type |
|---|---|
| Taux de conversion | `ORDER_PLACED` / `PAGE_VIEW` × 100 |
| Tunnel achat | Comptage par étape : VIEW → CART_ADD → CHECKOUT_START → ORDER_PLACED |
| Produits les plus vus | GROUP BY product_id WHERE event_type='PRODUCT_VIEW' |
| Source de trafic la plus rentable | GROUP BY utm_source JOIN order_placed |
| Wilayas les plus actives | GROUP BY metadata->>'wilaya' WHERE event_type='ORDER_PLACED' |
| Heure de pointe | GROUP BY EXTRACT(hour FROM created_at) |
| Paniers abandonnés | session_id WHERE CART_ADD sans ORDER_PLACED |

### 5.6 Compatibilité future

- **Facebook Pixel :** Mapper `PRODUCT_VIEW` → `ViewContent`, `ORDER_PLACED` → `Purchase`
- **Google Analytics 4 :** Mapper via `gtag()` les mêmes event_types
- **n8n / Make :** Webhook sur INSERT nc_page_events WHERE event_type='ORDER_PLACED'
- **Dashboard Owner :** Requêtes SQL directes sur nc_page_events via Supabase

---

<a name="partie-6"></a>
## PARTIE 6 — SYSTÈME DE LOGS OPÉRATIONNELS

### 6.1 Architecture à 3 niveaux

```
NIVEAU 1 — nc_page_events
  → Clickstream haute fréquence (comportement client)
  → Analyse marketing, conversion, UX
  → Source : nc-boutique uniquement

NIVEAU 2 — nc_events
  → Logs opérationnels (actions métier critiques)
  → Audit, debug, traçabilité agents + boutique
  → Source : GAS | Vercel dashboard | Vercel boutique | Webhooks

NIVEAU 3 — nc_gas_logs
  → Logs d'exécution GAS spécifiquement
  → Diagnostic GAS uniquement
  → Inchangé
```

### 6.2 Nouveaux log_types boutique dans `nc_events`

| log_type | Quand | Champs importants |
|---|---|---|
| `BOUTIQUE_ORDER_PLACED` | Commande créée avec succès | `order_id`, `order_name`, `total`, `wilaya` |
| `BOUTIQUE_ORDER_FAILED` | Erreur lors de la création | `error`, `payload_snapshot` |
| `BOUTIQUE_STOCK_ALERT` | Stock insuffisant détecté | `variant_id`, `requested_qty`, `available_qty` |
| `BOUTIQUE_CART_ABANDONED` | Panier non converti après 24h | `session_id`, `items_count`, `cart_total` |
| `BOUTIQUE_TRACK_VIEWED` | Page suivi colis consultée | `order_id`, `status_at_view` |

### 6.3 Règle de log — ce qui doit TOUJOURS être loggé

- Toute commande créée (succès ET échec)
- Toute alerte stock déclenchée
- Tout accès à la page de suivi (sécurité + analytics)

### 6.4 Utilisation des logs pour le debugging

En cas de problème commande boutique :

```
1. Chercher dans nc_events WHERE source='nc_boutique' AND log_type='BOUTIQUE_ORDER_FAILED'
2. Lire le champ 'error' pour le message exact
3. Lire 'payload_snapshot' pour voir exactement ce qui a été envoyé
4. Vérifier nc_page_events WHERE order_id = [id] pour voir le parcours complet
```

---

<a name="partie-7"></a>
## PARTIE 7 — PAGES DE LA BOUTIQUE

### 7.1 Structure des pages

| Page | Route | Type Next.js | Source données |
|---|---|---|---|
| Accueil | `/` | SSR (revalidate: 300s) | nc_variants (featured) |
| Catalogue | `/produits` | SSR (revalidate: 60s) | nc_variants (actifs) |
| Fiche produit | `/produits/[slug]` | SSR (revalidate: 60s) | nc_variants |
| Panier | `/panier` | Client | localStorage |
| Commander | `/commander` | Client | localStorage + formulaire |
| Confirmation | `/merci/[id]` | SSR | nc_orders |
| Suivi | `/suivi/[id]` | SSR (no-cache) | nc_orders + nc_suivi_zr |
| 404 | `/not-found` | Statique | — |

**SSR = Server-Side Rendering** : la page est générée côté serveur, ce qui améliore le SEO (Google peut lire le contenu).

**revalidate: 300s** = la page est regénérée toutes les 5 minutes si le cache est périmé.

### 7.2 Contenu de chaque page

**Accueil (`/`)**
- Section hero (image pleine largeur + accroche + CTA "Voir les produits")
- Grille produits vedettes (is_featured = true dans nc_variants ou nc_products)
- Section catégories (navigation rapide)
- Section rassurante (livraison, qualité, contact)
- Footer (liens utiles, réseaux sociaux)

**Catalogue (`/produits`)**
- Filtres : catégorie, prix min/max, disponibilité
- Tri : popularité, prix croissant/décroissant, nouveautés
- Grille produits (image, nom, prix, disponibilité, bouton panier)
- Pagination ou infinite scroll
- Compteur : "X produits trouvés"

**Fiche produit (`/produits/[slug]`)**
- Galerie photos (principale + miniatures)
- Titre, prix, prix barré si applicable
- Sélecteur de variante (couleur, taille, etc.)
- Indicateur stock ("En stock", "Dernières pièces", "Rupture")
- Bouton "Ajouter au panier"
- Description détaillée
- Produits similaires (même catégorie)

**Panier (`/panier`)**
- Liste articles (image, nom, variante, prix, quantité, supprimer)
- Sous-total
- Bouton "Commander maintenant"
- Bouton "Continuer les achats"

**Commander (`/commander`)**
- Récap commande (articles, total)
- Formulaire : prénom + nom, téléphone, wilaya (liste déroulante 58 wilayas), adresse complète, note optionnelle
- Bouton "Valider la commande"
- Indicateur de traitement (spinner pendant l'envoi)

**Confirmation (`/merci/[id]`)**
- Message de succès
- Numéro de commande NC-YYMMDD-XXXX (à conserver par le client)
- Récap articles commandés
- Instructions de suivi ("Votre colis sera expédié sous 24-48h")
- Lien vers page suivi
- Bouton "Retour à la boutique"

**Suivi (`/suivi/[id]`)**
- Formulaire de recherche (numéro de commande ou téléphone)
- Timeline de statut : Commande reçue → Confirmée → Expédiée → Livrée
- Numéro de tracking ZR si disponible
- Informations colis (articles, adresse de livraison)

### 7.3 Design — règles non négociables

- **Mobile-first absolu** : concevoir pour 375px de large en premier, adapter pour desktop ensuite
- **Rapidité** : images optimisées via `next/image`, lazy loading automatique
- **Accessibilité** : contrastes suffisants, labels sur formulaires, messages d'erreur clairs
- **Couleurs** : à définir avec charte graphique NajmCoiff — utiliser les CSS variables Tailwind pour centraliser
- **Police** : Inter ou Poppins (Google Fonts) — moderne, lisible sur mobile
- **Langue** : Français uniquement (Arabic potentiel en Phase 3)

---

<a name="partie-8"></a>
## PARTIE 8 — ROUTES API BOUTIQUE

> Ces routes sont dans le projet `nc-boutique/`, pas dans `vercel-quick/`.
> Elles utilisent les mêmes patterns que le dashboard mais sont indépendantes.

### 8.1 Liste complète des routes boutique

```
GET  /api/boutique/products            → Catalogue public
GET  /api/boutique/products/[slug]     → Fiche produit unique
POST /api/boutique/order               → Créer une commande
GET  /api/boutique/track/[id]          → Suivi commande public
POST /api/boutique/track-event         → Enregistrer événement tracking
```

### 8.2 Détail de chaque route

**`GET /api/boutique/products`**
```
Query params : ?category=&search=&sort=&limit=&offset=
Source : nc_variants WHERE status='active'
Auth : aucune (public)
Cache Next.js : revalidate 60 secondes
Retour : [{variant_id, product_title, price, compare_at_price, inventory_quantity, images, slug, category}]
```

**`GET /api/boutique/products/[slug]`**
```
Param : slug (ex: shampoing-argan-500ml)
Source : nc_variants WHERE sku=slug OU nc_products WHERE slug=slug (Phase 2)
Auth : aucune (public)
Cache : revalidate 60 secondes
Retour : {product complet + variants + stock}
```

**`POST /api/boutique/order`**
```
Body : {
  items: [{variant_id, qty, price}],
  customer: {full_name, phone, wilaya, address, note},
  session_id: string,
  utm: {source, medium, campaign}
}
Actions serveur :
  1. Valider les items (stock disponible)
  2. Générer order_name = NC-YYMMDD-XXXX
  3. INSERT nc_orders
  4. INSERT nc_page_events (ORDER_PLACED) — côté serveur
  5. INSERT nc_events (BOUTIQUE_ORDER_PLACED)
  6. Retourner {order_id, order_name}
Auth : aucune (public)
Protection anti-double-submit : idempotency_key dans le body
```

**`GET /api/boutique/track/[id]`**
```
Param : id (order_name NC-YYMMDD-XXXX ou order_id UUID)
Source : nc_orders JOIN nc_suivi_zr
Auth : aucune (public) — mais on retourne uniquement les champs publics (pas les infos agents)
Retour : {order_name, status, items_summary, tracking_number, zr_status, created_at}
```

**`POST /api/boutique/track-event`**
```
Body : {
  session_id, event_type, page, product_id?, variant_id?, order_id?,
  metadata?, utm?, referrer?, user_agent?
}
Actions : INSERT nc_page_events (hash IP côté serveur)
Auth : aucune
Mode : fire & forget — retourne 200 immédiatement, write en arrière-plan
```

### 8.3 Sécurité des routes publiques

| Menace | Protection |
|---|---|
| Spam commandes | Rate limiting Vercel (10 req/min par IP) + validation téléphone algérien |
| Injection SQL | Supabase parameterized queries — impossible par design |
| Oversell | Transaction Supabase : check stock + insert commande atomique |
| Double submit | `idempotency_key` = hash(session_id + items + phone) — rejette les doublons |
| Scraping catalogue | Rate limiting + cache — pas de données sensibles dans le catalogue |

---

<a name="partie-9"></a>
## PARTIE 9 — STRATÉGIE DE SÉPARATION — ZÉRO RISQUE EXISTANT

### 9.1 Ce qu'on ne touche pas

| Système | Statut |
|---|---|
| `vercel-quick/` — tous les fichiers | INTOUCHÉ |
| Les 6 fichiers GAS | INTOUCHÉS |
| Les 15 tables Supabase existantes | INTOUCHÉES (0 ALTER, 0 DROP, 0 RENAME) |
| Le webhook Shopify | INCHANGÉ — continue à recevoir les commandes |
| Les variables d'environnement du dashboard | INCHANGÉES |
| Shopify (boutique EasySell) | INCHANGÉ — tourne en parallèle |

### 9.2 Ce qu'on AJOUTE uniquement

- Dossier `nc-boutique/` dans le dépôt git (nouveau projet)
- 5 nouvelles tables Supabase (INSERT, jamais ALTER sur les existantes)
- Nouveau projet Vercel séparé (créé depuis le dashboard Vercel)
- Nouvelles variables d'environnement dans le NOUVEAU projet Vercel seulement

### 9.3 Règle de coexistence Phase 1/2

Les deux systèmes tournent en parallèle sans se gêner :

```
Client commande depuis EasySell (Shopify) :
  → Webhook Shopify → /api/webhooks/shopify → nc_orders (order_source='web')
  → Dashboard agents le voit normalement

Client commande depuis nc-boutique :
  → /api/boutique/order → nc_orders (order_source='nc_boutique')
  → Dashboard agents le voit immédiatement (même table !)
  → Agent traite la commande de la même façon
```

Le dashboard agents n'a pas besoin d'être modifié pour recevoir les commandes nc_boutique. La table `nc_orders` est partagée.

### 9.4 Plan de rollback (si nc-boutique a un problème)

1. Désactiver le projet Vercel nc-boutique (un bouton dans le dashboard Vercel)
2. Le reste du système (dashboard, Shopify, GAS) continue à fonctionner normalement
3. Aucune commande existante n'est affectée
4. Aucune table existante n'est corrompue

---

<a name="partie-10"></a>
## PARTIE 10 — STRATÉGIE DE MIGRATION PROGRESSIVE DEPUIS SHOPIFY

### 10.1 Vue d'ensemble des 4 phases

```
PHASE 1 — Vitrine (maintenant)
  nc-boutique live + commandes dans nc_orders
  Shopify continue à tourner en parallèle
  Durée estimée : 2-3 semaines

PHASE 2 — Stock natif (après Phase 1 stable)
  nc_variants devient source de vérité du stock
  Barrage et PO injection sans Shopify
  Durée estimée : 1-2 semaines

PHASE 3 — Modification commande native (après Phase 2 stable)
  Supprimer Draft Order GAS
  Durée estimée : 1 semaine

PHASE 4 — Fermeture Shopify (après Phase 3 + décision business)
  Résiliation abonnement Shopify
  Pas de date imposée — décision business uniquement
```

### 10.2 Phase 1 — Vitrine nc-boutique

**Objectif :** Première commande nc_boutique dans le dashboard sans passer par Shopify.

**Ce qu'on fait :**
- [ ] Créer le projet nc-boutique (Next.js)
- [ ] Pages : accueil, catalogue, produit, panier, commander, confirmation, suivi
- [ ] Route `POST /api/boutique/order`
- [ ] Tracking `nc_page_events` opérationnel
- [ ] Déployer sur Vercel avec domaine de test

**Ce qu'on ne touche pas :**
- Shopify continue à recevoir les commandes EasySell
- Dashboard agents inchangé

**Critère de validation (KPI) :**
```
✅ Une commande nc_boutique apparaît dans /dashboard/confirmation
✅ nc_page_events contient bien les événements de la session
✅ Le numéro NC-YYMMDD-XXXX est généré correctement
✅ Zero commande Shopify manquée pendant la transition
```

### 10.3 Phase 2 — Stock natif

**Objectif :** ne plus appeler Shopify pour lire ou écrire le stock.

**Ce qu'on fait :**
- [ ] `nc_variants.inventory_quantity` devient la source de vérité (ne plus syncer depuis Shopify)
- [ ] Vérification stock dans `/api/boutique/order` (déjà prévu)
- [ ] Route `/api/stock/adjust` (décrémente nc_variants à la commande)
- [ ] Barrage → lit nc_barrage, modifie nc_variants directement (plus d'appel Shopify)
- [ ] PO injection → nc_po_lines → nc_variants directement (plus de GAS INJECTER)
- [ ] Créer `nc_stock_movements` pour chaque changement de stock

**Critère de validation :**
```
✅ Stock visible dans dashboard correspond au stock physique
✅ Une commande nc_boutique décrémente nc_variants correctement
✅ Zéro appel à l'API Shopify pour les opérations stock
```

### 10.4 Phase 3 — Modification commande native

**Objectif :** supprimer le GAS MODIFIER (Draft Order).

**Ce qu'on fait :**
- [ ] Route `POST /api/orders/modify` (edit direct nc_orders.items_json)
- [ ] Recalcul des totaux côté Vercel
- [ ] Supprimer la dépendance au GAS `MODIFY_ORDER`
- [ ] Mettre à jour `/dashboard/confirmation` pour appeler la nouvelle route

**Critère de validation :**
```
✅ Agent peut modifier une commande depuis le dashboard sans appel Shopify
✅ Pas de régression sur le flux de confirmation
```

### 10.5 Phase 4 — Fermeture Shopify

**Objectif :** résilier l'abonnement Shopify, zéro frais.

**Ce qu'on fait :**
- [ ] Exporter et archiver l'historique des commandes Shopify (CSV)
- [ ] Exporter et archiver les données produits et photos Shopify
- [ ] Vérifier que tous les redirections d'URL sont en place (301)
- [ ] Désactiver le webhook Shopify dans le code
- [ ] Supprimer les variables d'environnement Shopify
- [ ] Archiver les fichiers GAS qui ne servent plus
- [ ] Résilier l'abonnement Shopify

**Pré-requis non négociables avant Phase 4 :**
```
✅ Phase 2 stable depuis au moins 4 semaines
✅ Zéro commande perdue depuis la transition
✅ Stock cohérent depuis Phase 2
✅ Export historique Shopify archivé et vérifié
✅ Décision explicite du propriétaire
```

### 10.6 Migration des produits et photos

**Phase 1 :** Les produits restent dans Shopify / nc_variants (cache existant). La boutique affiche nc_variants. Aucune migration.

**Phase 2 :** Créer `nc_products` et migrer les données depuis nc_variants :
```sql
INSERT INTO nc_products (title, slug, images, category, shopify_product_id, ...)
SELECT product_title, lower(replace(product_title,' ','-')), ...
FROM nc_variants
GROUP BY product_id;
```

**Photos :** Les photos Shopify sont accessibles par URL CDN. En Phase 2, on peut soit :
1. Garder les URLs Shopify (temporaire, risqué si Shopify ferme)
2. Migrer les images vers Supabase Storage (recommandé)

**Recommandation :** Migrer les images vers Supabase Storage en Phase 2. Utiliser le bucket `product-images`. Coût : négligeable (< 1 Go pour un catalogue coiffure/cosmétique).

---

<a name="partie-11"></a>
## PARTIE 11 — PRÉVENTION DU DOUBLE TRAVAIL

### 11.1 Décisions prises une seule fois — à ne jamais refaire

| Décision | Comment s'assurer qu'on ne refait pas |
|---|---|
| Schéma `nc_page_events` | Défini en Phase 1, jamais modifié — ajouter des colonnes si besoin |
| Schéma `nc_products` | Défini avec tous les champs SEO dès Phase 1, même si pas utilisés tout de suite |
| Nomenclature event_types | Fichier `lib/constants.js` dans nc-boutique — source de vérité |
| Format `order_name` NC-YYMMDD-XXXX | Générateur dans `lib/utils.js` — une seule implémentation |
| Session tracking | `lib/track.js` — une seule librairie, utilisée partout |

### 11.2 Librairies partagées (écrire une seule fois)

**`lib/supabase.js`** — client Supabase
```javascript
// Même pattern que vercel-quick/lib/supabase.js — pas de réinvention
```

**`lib/constants.js`** — nomenclature centralisée
```javascript
export const EVENT_TYPES = {
  PAGE_VIEW: 'PAGE_VIEW',
  PRODUCT_VIEW: 'PRODUCT_VIEW',
  // ... tous les event_types
};
export const ORDER_SOURCES = { NC_BOUTIQUE: 'nc_boutique' };
export const LOG_TYPES = { ORDER_PLACED: 'BOUTIQUE_ORDER_PLACED', ... };
```

**`lib/utils.js`** — helpers partagés
```javascript
export function generateOrderName() { /* NC-YYMMDD-XXXX */ }
export function formatPrice(n) { /* "1 500 DA" */ }
export function formatDate(d) { /* "11/04/2026" */ }
export function hashIP(ip) { /* SHA-256 */ }
```

**`lib/track.js`** — tracking client
```javascript
export async function trackEvent(type, data) { /* POST /api/boutique/track-event */ }
export function getSessionId() { /* localStorage */ }
export function getUtmParams() { /* URLSearchParams */ }
```

### 11.3 Ce qu'on ne duplique jamais entre boutique et dashboard

| Donnée | Source unique |
|---|---|
| Stock produits | `nc_variants.inventory_quantity` (une seule table) |
| Commandes | `nc_orders` (une seule table) |
| Logs opérationnels | `nc_events` (une seule table) |
| Tracking marketing | `nc_page_events` (une seule table) |
| Auth agents | `nc_users` (uniquement pour le dashboard — jamais pour la boutique) |

---

<a name="partie-12"></a>
## PARTIE 12 — VARIABLES D'ENVIRONNEMENT

### 12.1 Variables du projet nc-boutique (NOUVEAU projet Vercel)

```bash
# Supabase — mêmes valeurs que le dashboard
NEXT_PUBLIC_SUPABASE_URL=https://alyxejkdtkdmluvgfnqk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...         # clé publique (RLS active)
SUPABASE_SERVICE_ROLE_KEY=eyJ...             # clé privée (pour writes serveur)

# Sécurité interne
BOUTIQUE_SECRET=...                          # token pour appels inter-services

# ZR Express (suivi colis public)
ZR_API_KEY=...                               # pour /api/boutique/track/[id]
```

### 12.2 Variables NON nécessaires en boutique

```bash
# Ces variables restent dans le dashboard uniquement
SHOPIFY_ACCESS_TOKEN     # non utilisé dans nc-boutique
SHOPIFY_WEBHOOK_SECRET   # non utilisé dans nc-boutique
GAS_*                    # non utilisé dans nc-boutique
VAPID_PUBLIC_KEY         # ajouté si push notifications en Phase 3
DASHBOARD_SECRET         # remplacé par BOUTIQUE_SECRET
```

---

<a name="partie-13"></a>
## PARTIE 13 — ROADMAP PHASES

### Vue d'ensemble temporelle

| Phase | Description | Durée estimée | Prérequis |
|---|---|---|---|
| Phase 1 | Vitrine nc-boutique live | 2-3 semaines | nc_variants peuplé |
| Phase 2 | Stock natif Supabase | 1-2 semaines | Phase 1 stable (2+ semaines) |
| Phase 3 | Modification commande native | 1 semaine | Phase 2 stable |
| Phase 4 | Fermeture Shopify | Variable | Phase 3 stable + décision business |

### Phase 1 — Détail des livrables

| Livrable | Statut |
|---|---|
| nc-boutique/package.json + config | A faire |
| app/layout.js (layout global) | A faire |
| app/page.js (accueil) | A faire |
| app/produits/page.js (catalogue) | A faire |
| app/produits/[slug]/page.js (fiche) | A faire |
| app/panier/page.js (panier) | A faire |
| app/commander/page.js (formulaire) | A faire |
| app/merci/[id]/page.js (confirmation) | A faire |
| app/suivi/[id]/page.js (tracking) | A faire |
| app/api/boutique/products/route.js | A faire |
| app/api/boutique/order/route.js | A faire |
| app/api/boutique/track/[id]/route.js | A faire |
| app/api/boutique/track-event/route.js | A faire |
| lib/supabase.js | A faire |
| lib/track.js | A faire |
| lib/utils.js | A faire |
| lib/constants.js | A faire |
| Table nc_page_events (SQL) | A faire |
| Table nc_products (SQL) | A faire |
| Déploiement Vercel | A faire |
| Test commande end-to-end | A faire |

---

<a name="partie-14"></a>
## PARTIE 14 — RISQUES IDENTIFIÉS

| Risque | Niveau | Impact | Mitigation |
|---|---|---|---|
| Stock oversell | CRITIQUE | Client commande un article épuisé | Vérification stock + transaction atomique Supabase avant INSERT commande |
| Double submission formulaire | MOYEN | Doublon de commandes | `idempotency_key` + bouton désactivé après submit |
| `nc_variants` vide ou non synchronisé | BLOQUANT Phase 1 | Boutique sans produits | Vérifier snapshot GAS avant mise en prod |
| Images Shopify inaccessibles | MOYEN | Boutique sans images produits | Fallback image locale + migration images Phase 2 |
| Supabase RLS mal configurée | CRITIQUE | Fuite données ou write bloqué | Tester avec clé anon ET service key avant prod |
| Performance Supabase (anon key) | MOYEN | Boutique lente sous trafic | Cache Next.js sur routes produits (revalidate 60s) + RLS optimisée |
| Spam commandes | MOYEN | Fausses commandes agents | Rate limiting Vercel + validation numéro téléphone algérien (regex) |
| nc_orders sans `order_name` | MOYEN | Dashboard incompatible | Ajouter la colonne via ALTER TABLE avant le déploiement boutique |
| Session tracking bloqué (adblocker) | FAIBLE | Analytics incomplets | ORDER_PLACED collecté côté serveur (non bloquable) — autres events best-effort |

---

<a name="partie-15"></a>
## PARTIE 15 — HYPOTHÈSES DOCUMENTÉES

> Ces hypothèses sont les décisions prises sans confirmation explicite. Si l'une d'elles est fausse, le plan s'adapte mais ne s'effondre pas.

| # | Hypothèse | Justification | Impact si fausse |
|---|---|---|---|
| H1 | Domaine boutique distinct du dashboard | Deux audiences différentes, deux projets Vercel séparés | Si un seul domaine : adapter le déploiement en sous-routes, pas une refonte |
| H2 | Paiement COD uniquement (livraison contre remboursement) | Conforme à l'usage actuel NajmCoiff | Si paiement en ligne : intégrer Stripe/Chargily en Phase 3 |
| H3 | Langue française uniquement | Majorité des clients francophones | Si arabe : ajouter `next-intl` en Phase 3, structure de données inchangée |
| H4 | Mobile-first | Marché algérien fortement mobile | Si majorité desktop : adapter les breakpoints CSS |
| H5 | nc_variants comme catalogue Phase 1 | Evite migration immédiate, livraison rapide | Si nc_variants non peuplé ou incomplet : créer nc_products avant Phase 1 |
| H6 | 58 wilayas algériennes dans le formulaire | Livraison nationale uniquement | Si international : adapter le formulaire adresse |
| H7 | Pas de compte client en Phase 1 | Simplifie le MVP, COD ne requiert pas de compte | Si comptes clients requis dès Phase 1 : ajouter nc_customers et auth |
| H8 | Images Shopify accessibles par URL CDN pendant Phase 1 | Economise une migration immédiate | Si URLs inaccessibles : migrer images vers Supabase Storage immédiatement |

---

<a name="partie-16"></a>
## PARTIE 16 — HISTORIQUE DES DÉCISIONS

> Chaque décision importante est documentée ici avec sa date et sa justification.
> Format : [DATE] — Décision — Raison — Alternatives rejetées

| Date | Décision | Raison | Alternative rejetée |
|---|---|---|---|
| 2026-04-11 | Analyse Shopify complète. 26 fichiers dépendants identifiés. 3 flux critiques cartographiés. Plan 4 phases validé. | Comprendre avant de migrer | Migration précipitée |
| 2026-04-11 | Stack nc-boutique = Next.js + Tailwind + Supabase (identique au dashboard) | Cohérence, zéro nouvel outil, même infrastructure | Autre stack (Vue, SvelteKit, etc.) |
| 2026-04-11 | nc-boutique = projet Vercel séparé du dashboard | Audiences différentes, déploiements indépendants, rollback simple | Tout dans vercel-quick sous /boutique/* |
| 2026-04-11 | nc_page_events table dédiée au tracking (séparée de nc_events) | Volume différent, objectif différent (marketing vs opérationnel) | Réutiliser nc_events pour tout |
| 2026-04-11 | Paiement COD uniquement en Phase 1/2 | Conforme à l'usage actuel, simplifie le MVP | Paiement en ligne dès Phase 1 |
| 2026-04-11 | nc_variants comme source catalogue Phase 1 (pas nc_products) | Livraison rapide, 0 migration, données déjà peuplées | Créer nc_products immédiatement |
| 2026-04-11 | ORDER_PLACED collecté côté serveur (non côté client) | Fiabilité 100% (non bloquable par adblockers) | Tracking purement client |
| 2026-04-11 | Session tracking via localStorage (pas de cookie) | RGPD simplifié, pas de bandeau cookie nécessaire | Cookies de session |

---

<a name="partie-17"></a>
## PARTIE 17 — CHECKLISTS DE VALIDATION

### Checklist avant mise en production Phase 1

**Infrastructure**
- [ ] Projet Vercel nc-boutique créé et lié au repo git
- [ ] Variables d'environnement configurées dans Vercel
- [ ] Domaine configuré et HTTPS actif
- [ ] Table `nc_page_events` créée dans Supabase
- [ ] Colonne `order_name` ajoutée à `nc_orders` (ALTER TABLE)

**Fonctionnalités**
- [ ] Catalogue affiche bien les produits nc_variants actifs
- [ ] Images produits s'affichent correctement
- [ ] Panier fonctionne (ajout, retrait, persistance localStorage)
- [ ] Formulaire commande valide correctement tous les champs
- [ ] Une commande test crée bien un enregistrement dans nc_orders
- [ ] Le numéro NC-YYMMDD-XXXX est généré et unique
- [ ] La commande est visible dans le dashboard agents

**Tracking**
- [ ] PAGE_VIEW loggé sur chaque page
- [ ] PRODUCT_VIEW loggé sur fiche produit
- [ ] CART_ADD loggé à l'ajout panier
- [ ] ORDER_PLACED loggé côté serveur à chaque commande
- [ ] UTM params capturés correctement dans nc_page_events

**Sécurité**
- [ ] Vérification stock avant INSERT commande (pas d'oversell)
- [ ] Idempotency key fonctionne (re-submit ne crée pas de doublon)
- [ ] Rate limiting actif sur /api/boutique/order
- [ ] Données sensibles non exposées dans les routes publiques
- [ ] RLS Supabase testée avec clé anon (lecture seule sur nc_variants)

**Mobile**
- [ ] Catalogue lisible et utilisable sur 375px
- [ ] Formulaire commande utilisable sur mobile (keyboard, scroll)
- [ ] Panier visible et fonctionnel sur mobile
- [ ] Temps de chargement < 3 secondes sur 4G

### Checklist avant Phase 2 (stock natif)

- [ ] Phase 1 stable depuis 2 semaines minimum
- [ ] Zéro commande perdue en Phase 1
- [ ] nc_stock_movements table créée
- [ ] Snapshot GAS arrêté (ou redirigé vers nc_variants directement)
- [ ] Test de décrémentation stock validé
- [ ] Test barrage sans Shopify validé

### Checklist avant fermeture Shopify (Phase 4)

- [ ] Phase 3 stable depuis 4 semaines minimum
- [ ] Export CSV commandes Shopify archivé
- [ ] Export CSV produits Shopify archivé
- [ ] Toutes les images migrées vers Supabase Storage
- [ ] Redirections 301 configurées (anciens URLs Shopify → nouveaux URLs boutique)
- [ ] Variables d'environnement Shopify supprimées du code
- [ ] Zéro référence à Shopify dans le code actif
- [ ] Décision explicite et documentée du propriétaire

---

<a name="partie-18"></a>
## PARTIE 18 — État actuel du projet

> Mis à jour à chaque déploiement et à chaque session de travail.
> Source de vérité de l'état réel du système au jour J.
> **Dernière mise à jour : 2026-04-11 — Rounds 1, 2, 3 documentés**

---

### 18.1 — État du déploiement

| Élément | Statut | URL / Détail |
|---|---|---|
| Boutique nc-boutique | ✅ EN LIGNE | https://nc-boutique.vercel.app |
| Dashboard agents | ✅ EN LIGNE | https://najmcoiffdashboard.vercel.app |
| Domaine custom boutique | ❌ Non configuré | Prévu mais non acheté |

---

### 18.2 — État des pages nc-boutique

| Page | URL | Statut | Notes |
|---|---|---|---|
| Accueil | `/` | ✅ Fonctionne | Produits depuis `nc_variants` — design basique à refaire |
| Catalogue | `/produits` | ✅ Fonctionne | Filtres OK, design à refaire |
| Fiche produit | `/produits/[slug]` | ⚠️ Partiel | Slug = product_id ne fonctionne pas — bug connu |
| Panier | `/panier` | ✅ Fonctionne | localStorage — drawer latéral pas encore implémenté |
| Commander | `/commander` | ✅ Structure | Formulaire basique — UX à refaire selon Partie D |
| Confirmation | `/merci/[id]` | ⚠️ Non testé | Aucune commande passée |
| Suivi | `/suivi` | ✅ Fonctionne | Interface OK |
| Suivi détail | `/suivi/[id]` | ❌ Erreur 500 | Bug DB à corriger |
| Page de choix mondes | `/` | ❌ Non créée | Priorité haute — décision Rounds 2/3 |

> **Conclusion :** Le site actuel est une version brouillon sans identité visuelle. Il sera entièrement refondu selon les spécifications des Parties A à G.

---

### 18.3 — État des routes API

| Route | Méthode | Statut | Notes |
|---|---|---|---|
| `/api/boutique/products` | GET | ✅ Fonctionne | Retourne vrais produits |
| `/api/boutique/products/[slug]` | GET | ⚠️ Bug | Recherche par product_id retourne 0 résultat |
| `/api/boutique/order` | POST | ⚠️ Non testé | Créée — aucune commande passée |
| `/api/boutique/track/[id]` | GET | ❌ Erreur 500 | Bug base de données |
| `/api/boutique/track-event` | POST | ⚠️ Non testé | Créée — aucun événement envoyé |

---

### 18.4 — État des tables Supabase

| Table | Statut | Données | Notes |
|---|---|---|---|
| `nc_page_events` | ✅ Créée | Vide | Colonne `world` à ajouter |
| `nc_products` | ✅ Créée | Vide | Catalogue natif futur — non utilisé |
| `nc_stock_movements` | ✅ Créée | Vide | Non utilisé |
| `nc_customers` | ✅ Créée | Vide | Non utilisé |
| `nc_carts` | ✅ Créée | Vide | Non utilisé |
| `nc_orders` | ✅ Modifiée | Données existantes Shopify | +5 colonnes boutique ajoutées |
| `nc_variants` | ✅ Existante | ~1200 produits | Colonnes `compare_at_price`, `collections`, `description`, `is_new` manquantes |
| `nc_boutique_config` | ❌ À créer | — | Phase 2 — dashboard owner |
| `nc_delivery_config` | ❌ À créer | — | Phase 2 — communes + prix livraison |
| `nc_banners` | ❌ À créer | — | Phase 2 — sliders accueil |

---

### 18.5 — Bugs connus (à traiter en session code)

| # | Bug | Impact | Fichier | Priorité |
|---|---|---|---|---|
| 1 | API `/track/[id]` retourne 500 | Bas | `app/api/boutique/track/[id]/route.js` | 🟡 Moyen |
| 2 | Fiche produit slug=product_id retourne 0 résultats | Haut | `app/api/boutique/products/[slug]/route.js` | 🔴 Haut |
| 3 | Drawer panier non implémenté | Haut | `app/panier/page.js` | 🔴 Haut |
| 4 | Formulaire commande non conforme à Partie D | Haut | `app/commander/page.js` | 🔴 Haut |
| 5 | Page de choix mondes absente | Haut | À créer | 🔴 Haut |
| 6 | Design non conforme (noir uni + rouge) | Haut | Tous les composants | 🔴 Haut |
| 7 | RTL non implémenté | Haut | `app/layout.js` | 🔴 Haut |

---

### 18.6 — Décisions documentées par session

#### Session 2026-04-11 — Mise en place initiale

| Décision | Raison |
|---|---|
| L'IA a créé le code avant d'avoir fini la doc | Erreur de process — règle : doc d'abord |
| Clé anon Supabase format `sb_publishable_` rejetée | Non supportée par supabase-js v2 — utiliser JWT `eyJ...` |
| Colonne `compare_at_price` supprimée | N'existe pas dans `nc_variants` — à ajouter via migration |
| Build fixé : `dynamic = 'force-dynamic'` pour les routes API | Évite l'erreur de rendu statique sur routes dynamiques |
| Page `/suivi` wrappée dans `<Suspense>` | Requis par Next.js pour `useSearchParams()` |

#### Session 2026-04-11 — Documentation Rounds 1, 2, 3

| Décision | Raison |
|---|---|
| Deux mondes séparés (Coiffure + Onglerie) | Deux niches distinctes, audiences différentes |
| Fond noir uni (pas de motif) | Plus propre, plus rapide, plus premium |
| Page de choix à chaque visite | UX décidée par le propriétaire |
| RTL arabe pour navigation, LTR pour noms produits | Compromis langue/lisibilité |
| Migration Shopify = sortie définitive (pas progressive) | Décision propriétaire — zéro dépendance à terme |
| Dashboard owner intégré dans vercel-quick | Pas de nouveau site — cohérence et coût |
| 2 pixels Facebook séparés + server-side | Système de tracking le plus puissant possible |
| Analytics propre via nc_events (pas Google) | Décision propriétaire — indépendance totale |
| Paiement à la livraison uniquement | Seul mode de paiement accepté en Algérie |
| Prix livraison domicile ≠ bureau | ZR Express a deux tarifs |
| AWAKHIR = nouveautés absolues (pas promotions) | Clarification propriétaire |
| Codes partenaires dans le panier | Champ "أدخل كود الشريك" dans le drawer |

---

### 18.7 — Prochaines actions prioritaires

| Priorité | Action | Partie doc | Statut |
|---|---|---|---|
| 🔴 1 | Récupérer collections Shopify → `nc_variants.collections` | Partie G, Phase M1 | ❌ À faire |
| 🔴 2 | Ajouter `compare_at_price` + `is_new` à `nc_variants` | Partie 4.7 | ❌ À faire |
| 🔴 3 | Refonte design : RTL + noir + rouge + deux mondes | Parties A, B | ❌ À faire |
| 🔴 4 | Créer page de choix Coiffure/Onglerie | Partie B.2 | ❌ À faire |
| 🔴 5 | Drawer panier conforme à capture Shopify | Partie D.2 | ❌ À faire |
| 🔴 6 | Formulaire commande conforme à capture | Partie D.3 | ❌ À faire |
| 🟠 7 | Créer `nc_delivery_config` + interface admin | Parties D.4, F.3.2 | ❌ À faire |
| 🟠 8 | Corriger bug fiche produit (slug) | Partie 18.5 bug #2 | ❌ À faire |
| 🟡 9 | Configurer pixels Facebook (2 IDs Meta) | Partie E | ❌ À faire |
| 🟡 10 | Page documentation dans dashboard owner | Partie F.3.5 | ❌ À faire |

---

<a name="partie-19"></a>
## PARTIE 19 — Accès et credentials

> Ces accès permettent à l'IA d'agir sans intervention humaine.
> Source complète : `docs/CONTROLE_TOTALE.md`

### Supabase

| Paramètre | Valeur |
|---|---|
| Project Ref | `alyxejkdtkdmluvgfnqk` |
| URL | `https://alyxejkdtkdmluvgfnqk.supabase.co` |
| Management API (SQL direct) | PAT dans `CONTROLE_TOTALE.md` |
| Exécuter SQL | `POST https://api.supabase.com/v1/projects/alyxejkdtkdmluvgfnqk/database/query` |

**Tables boutique** : `nc_page_events`, `nc_products`, `nc_stock_movements`, `nc_customers`, `nc_carts`
**Tables existantes** : voir `AGENTS.md` (ne pas modifier)

### Vercel

| Paramètre | Valeur |
|---|---|
| Dashboard agents (existant) | https://najmcoiffdashboard.vercel.app |
| Boutique (nouveau) | https://nc-boutique.vercel.app |
| Projet Vercel boutique | `najm-webs-projects/nc-boutique` (ID: `prj_mIB0VowvopWx5GitaOLwdZy5jzw5`) |
| Token | Dans `CONTROLE_TOTALE.md` |
| Scope | `najm-webs-projects` |

**Déployer la boutique :**
```powershell
cd "C:\Users\Informatics\Desktop\MonProjetAppsScript\nc-boutique"
npx vercel --token [TOKEN] --prod --yes --scope "najm-webs-projects"
```

### Shopify (existant — ne pas modifier)

| Paramètre | Valeur |
|---|---|
| Shop | `8fc262.myshopify.com` |
| API Version | `2025-01` |
| Token | Dans `CONTROLE_TOTALE.md` |

### ZR Express (livraison)

| Paramètre | Valeur |
|---|---|
| API URL | `https://api.zrexpress.app/api/v1` |
| Clés | Dans `CONTROLE_TOTALE.md` |

### Google Apps Script (GAS — minimal)

| Paramètre | Valeur |
|---|---|
| WebApp URL | Dans `CONTROLE_TOTALE.md` |
| 3 actions autorisées | `MODIFY_ORDER`, `RUN_INJECT_PO`, `ADD_PO_LINES` |

---

<a name="partie-0"></a>
## PARTIE 0 — Workflow IA — Règles et Protocole

> Ce bloc est le protocole obligatoire pour toute session de travail avec l'IA.
> Il définit comment l'IA doit travailler sur ce projet, dans quel ordre, et avec quelles contraintes.
> **Il prime sur toute autre instruction.** Il est lu avant toute action.

---

### 0.1 — MINI-PROMPT (à coller au début de chaque conversation)

```
Tu travailles sur le projet NajmCoiff (nc-boutique + dashboard vercel-quick).

RÈGLES ABSOLUES AVANT TOUTE ACTION :

1. LIS D'ABORD nc-boutique/PLAN.md — c'est la doc centrale et la loi du projet
2. Lire aussi docs/CONTROLE_TOTALE.md pour les accès complets
3. Toute amélioration DOIT être documentée dans PLAN.md AVANT d'être codée
4. Toute modification de code DOIT être reflétée dans PLAN.md après exécution
5. Ne jamais coder quelque chose qui n'est pas dans la doc ou demandé explicitement
6. Toute décision → noter dans PLAN.md section "Historique des décisions"
7. Avant tout déploiement → vérifier visuellement nc-boutique.vercel.app (pages + boutons + erreurs)
8. Après chaque déploiement → mettre à jour la section "État actuel" dans PLAN.md
9. Ne jamais toucher vercel-quick (dashboard agents) sans autorisation explicite
10. Ne jamais créer de nouveau fichier sans que ce soit documenté dans le PLAN

La doc PLAN.md est la source de vérité. Si quelque chose n'y est pas, ça n'existe pas.
```

---

### 0.2 — RÈGLES DU WORKFLOW IA OPTIMISÉ

Ces règles ont été établies pour maximiser la qualité, la cohérence et la vitesse de travail entre l'humain et l'IA sur ce projet.

#### Règle 1 — Doc d'abord, code ensuite

```
Ordre obligatoire :
  1. Discussion → décision
  2. Décision documentée dans PLAN.md
  3. Code écrit selon ce qui est dans la doc
  4. Test visuel du résultat
  5. PLAN.md mis à jour avec le résultat réel
```

Jamais dans l'autre sens. Jamais de code sans doc.

#### Règle 2 — Vérification visuelle obligatoire

Avant chaque déploiement et après chaque déploiement, l'IA doit :
- Parcourir les pages comme un humain (accueil → catalogue → fiche → panier → commander)
- Vérifier que les boutons ont des actions (href ou onClick)
- Vérifier que les API répondent correctement
- Détecter les erreurs 500, les pages blanches, les données manquantes
- Documenter ce qui fonctionne et ce qui ne fonctionne pas dans `Partie 18 — État actuel`

#### Règle 3 — Zéro code fantôme

Tout code existant doit être documenté dans ce PLAN.
Si un fichier existe mais n'est pas dans la doc → le documenter avant de le modifier.
Si une table Supabase existe mais n'est pas dans la doc → la documenter immédiatement.

#### Règle 4 — Décisions tracées

Toute décision technique (choix d'architecture, choix de bibliothèque, choix de structure de données) doit être tracée dans `Partie 16 — Historique des décisions` avec :
- La date
- La décision prise
- Pourquoi cette décision
- L'alternative écartée et pourquoi

#### Règle 5 — Bugs documentés

Tout bug découvert doit être immédiatement ajouté dans `Partie 18 — Bugs connus` avec :
- La description du bug
- Son impact business
- Le fichier concerné
- Son statut (ouvert / en cours / résolu)

#### Règle 6 — Séparation claire des sessions

Chaque session de travail avec l'IA doit commencer par :
```
Session [date] — Objectif : [ce qu'on veut faire]
```
Et se terminer par une mise à jour de PLAN.md avec ce qui a été fait.

#### Règle 7 — Jamais d'improvisation structurelle

L'IA ne doit jamais :
- Créer une nouvelle table Supabase sans qu'elle soit dans la doc
- Créer une nouvelle route API sans qu'elle soit dans la doc
- Modifier une table existante du dashboard (`nc_orders`, `nc_variants`, etc.) sans autorisation explicite
- Déployer sur le dashboard (`vercel-quick`) sans ordre explicite

#### Règle 8 — Doc lisible pour un humain non-technique

La documentation dans PLAN.md doit toujours être rédigée de sorte qu'un humain non-développeur peut comprendre :
- Ce que fait chaque composant
- Pourquoi il existe
- Quel est son état actuel

---

### 0.3 — STRATÉGIE D'AFFICHAGE DE LA DOC SUR LE DASHBOARD

> Objectif : pouvoir lire PLAN.md directement depuis le dashboard agent (najmcoiffdashboard.vercel.app) sans ouvrir VS Code.

**Solution prévue (à implémenter en Phase 2) :**

Une page `/dashboard/documentation` dans `vercel-quick` qui :
1. Lit le fichier `nc-boutique/PLAN.md` depuis GitHub (via l'API GitHub raw ou une route API dédiée)
2. Le convertit en HTML lisible avec un parser Markdown (bibliothèque `marked` ou `remark`)
3. L'affiche dans le dashboard avec une mise en page propre, un sommaire cliquable et une barre de recherche

**Contraintes :**
- Lecture seule (jamais d'écriture depuis le dashboard)
- Accès réservé aux utilisateurs connectés (`nc_users`)
- Mise à jour automatique : le dashboard lit toujours la version la plus récente du fichier

**Alternatives considérées :**
- Stocker le PLAN dans Supabase → rejeté (trop complexe pour de la doc longue)
- Iframe vers GitHub → rejeté (non sécurisé, dépendance externe)
- Solution retenue → lecture directe du fichier depuis le repo via API Vercel ou route Next.js serveur

**Fichier à créer le moment venu :** `vercel-quick/app/dashboard/documentation/page.js`

---

### 0.4 — ORDRE DE PRIORITÉ DES PROCHAINES ACTIONS

Voici l'ordre dans lequel les prochains travaux doivent être abordés, par priorité décroissante :

| Priorité | Action | Type | Section doc |
|---|---|---|---|
| 🔴 1 | Corriger les 3 bugs connus (track 500, fiche produit, pagination) | Code | Partie 18 |
| 🟠 2 | Tester visuellement chaque page comme un humain | Test | Partie 18 |
| 🟡 3 | Ajouter les images produits (Shopify → nc_variants.image_url) | Données | Partie 4 |
| 🟢 4 | Page dashboard/documentation (afficher PLAN.md) | Code | Partie 19 |
| 🔵 5 | Système de commande bout-en-bout (test réel) | Test | Partie 7 |
| ⚪ 6 | Analytics dashboard propriétaire (Phase 3) | Futur | Partie 13 |

---

## LIENS UTILES

| Service | URL |
|---|---|
| Dashboard agents | https://najmcoiffdashboard.vercel.app |
| Supabase | https://alyxejkdtkdmluvgfnqk.supabase.co |
| Shopify Admin (à désactiver Phase 4) | https://admin.shopify.com/store/8fc262 |
| Architecture système actuel | `docs/ARCHITECTURE.md` |
| Règles IA | `AGENTS.md` |
| Schema SQL boutique | `docs/BOUTIQUE_SCHEMA.sql` |

---

*Mis à jour : 2026-04-11 — Phase Documentation (Rounds 1, 2, 3)*
*Responsable documentation : IA Architecte + Propriétaire (NAJMCOIFF)*
*Prochain chantier : Round 4 questions → doc complète → code*
*Sections en attente de données : D.4 (prix livraison wilaya), E.3 (IDs pixels Facebook)*
