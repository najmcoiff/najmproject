# GLOSSARY — NajmCoiff
> version: 1.0 | updated: 2026-04-11
> Dictionnaire des termes métier et techniques du projet.
> L'IA doit consulter ce fichier pour tout terme inconnu avant de poser une question.

---

## Termes Métier

| Terme | Définition |
|---|---|
| **AWAKHIR** (آواخر) | Collection de **nouveaux articles** jamais encore entrés en stock. Ce sont des nouveautés absolues — pas des promotions. Marqués `is_new = true` dans `nc_variants`. |
| **Barrage** | Mécanisme de seuil de stock. Si le stock d'un produit tombe en dessous du seuil défini dans `nc_barrage`, une alerte est déclenchée. |
| **Clôture** | Action journalière des agents : fermeture comptable de la journée (route `/api/cloture`). Calcule les recettes et remet les compteurs à zéro. |
| **COD** | Cash On Delivery = paiement à la livraison. Seul mode de paiement accepté. |
| **Monde** | L'un des deux univers de la boutique : `coiffure` (monde masculin barbier) ou `onglerie` (monde féminin). Détermine le thème, le catalogue et le tracking. |
| **NC-YYMMDD-XXXX** | Format du numéro de commande boutique. Ex : `NC-260411-0001`. YY=année, MM=mois, DD=jour, XXXX=séquence du jour. |
| **Onglerie** | Niche prothèse ongulaire / nail art. Public féminin. Identifiée par le tag `onglerie` dans `collections_titles` de `nc_variants`. |
| **PO** | Purchase Order = bon de commande fournisseur. Lignes dans `nc_po_lines`. |
| **Snap / Snapshot** | Action GAS (`📊 EVENTS & STOCK.js`) qui lit le stock Shopify et met à jour `nc_variants`. |
| **ZR** | ZR Express — transporteur de livraison national utilisé pour expédier les commandes en Algérie. |

---

## Termes Techniques

| Terme | Définition |
|---|---|
| **CAPI** | Facebook Conversions API — tracking côté serveur qui résiste aux adblockers. Complète le pixel browser. |
| **COD** | Cash on Delivery — paiement à la livraison. |
| **CRON** | Tâche planifiée (ex: snapshot stock quotidien). |
| **Draft Order** | Commande Shopify temporaire utilisée par GAS pour modifier une commande (annule + recrée). |
| **GAS** | Google Apps Script — utilisé uniquement pour 3 actions complexes Shopify. En cours d'élimination. |
| **Idempotency Key** | Clé unique par tentative de commande. Si le client re-soumet, la même clé détecte le doublon et retourne la commande existante sans en créer une nouvelle. |
| **LTR** | Left To Right — direction de lecture gauche-droite (français, anglais). Utilisé pour les noms de produits. |
| **Pixel** | Facebook Pixel — morceau de code JavaScript qui envoie des événements à Meta pour les campagnes publicitaires. |
| **RTL** | Right To Left — direction de lecture droite-gauche (arabe). Appliqué sur le HTML global de la boutique. |
| **RLS** | Row Level Security — sécurité au niveau des lignes dans Supabase. Contrôle qui peut lire/écrire quoi. |
| **Service Role Key** | Clé Supabase qui bypass le RLS. Utilisée uniquement côté serveur (jamais dans le navigateur). |
| **Session ID** | Identifiant unique généré en `localStorage` pour suivre un visiteur anonyme. Lié aux événements `nc_page_events`. |
| **Slug** | Identifiant URL-friendly d'un produit (ex: `toppik-27g-black` ou l'ID produit Shopify). |
| **SSR** | Server Side Rendering — rendu côté serveur Next.js. Améliore le SEO et le temps de chargement initial. |

---

## Tables Supabase — rôles rapides

| Table | Rôle en 1 ligne |
|---|---|
| `nc_orders` | Toutes les commandes (Shopify + boutique) |
| `nc_variants` | Catalogue produits (cache Shopify → source vérité boutique) |
| `nc_events` | Logs opérationnels (audit, debug, actions agents) |
| `nc_page_events` | Tracking comportement client boutique (marketing) |
| `nc_users` | Comptes agents dashboard (pas les clients boutique) |
| `nc_customers` | Comptes clients boutique (Phase 2) |
| `nc_barrage` | Seuils stock anti-rupture |
| `nc_suivi_zr` | Suivi colis ZR Express |
| `nc_partenaires` | Codes promo (code + pourcentage remise) |
| `nc_po_lines` | Lignes bons de commande fournisseur |
| `nc_delivery_config` | Communes + prix livraison domicile/bureau (à créer) |
| `nc_boutique_config` | Paramètres boutique clé/valeur (à créer) |
| `nc_banners` | Banners et sliders accueil boutique (à créer) |

---

## Wilayas (format attendu)
Les noms de wilayas utilisés dans la boutique doivent correspondre exactement aux noms utilisés par ZR Express dans leur API. Voir `docs/migration/` pour la liste complète à fournir.
