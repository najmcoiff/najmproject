# HUMAN TEST PLAN — NajmCoiff
> version: 1.0 | created: 2026-04-12 | auteur: IA + Najm
> Ce fichier est un guide de test **manuel** (humain devant l'écran).
> Il complète les tests Playwright automatiques (`npx playwright test`).
> Cocher chaque case [ ] au fur et à mesure. Recommencer à chaque lancement client ou lot de corrections.

---

## RELATION AVEC LES TESTS AUTOMATIQUES

| Fichier Playwright existant | Ce qu'il couvre | Lien avec ce plan |
|---|---|---|
| `nc-boutique/tests/e2e/human-order.spec.js` | Flux commande complet + vérif DB | BLOC C3 (happy path automatisé) |
| `nc-boutique/tests/e2e/catalogue.spec.js` | Grille mobile 4 colonnes, images, recherche | BLOC C1 |
| `nc-boutique/tests/e2e/order-flow.spec.js` | Drawer, validation téléphone, idempotency | BLOC C2–C3 |
| `nc-boutique/tests/e2e/tracking.spec.js` | Page /suivi existe et se charge | BLOC C4 |
| `nc-boutique/tests/e2e/api.spec.js` | Routes API (products, order, health) | Routes API des 3 blocs |
| `vercel-quick/tests/e2e/auth.spec.js` | Login / Logout dashboard | BLOC A1 |
| `vercel-quick/tests/e2e/operations.spec.js` | Opérations, injection manuelle ZR | BLOC A3–A4 |
| `vercel-quick/tests/e2e/pos.spec.js` | POS Comptoir | BLOC A4.2 |

**Ce que Playwright ne peut PAS tester (uniquement ici) :**
- Textes arabes lisibles et logiques
- Design et UX mobile sur un vrai téléphone
- WhatsApp s'ouvre avec le bon message
- Comportement visuel du CartDrawer sur iOS Safari
- Expérience réelle d'un client algérien

---

## DONNÉES DE TEST REQUISES

Vérifier que ces données existent avant de commencer :

| Donnée | Table Supabase | SQL de vérification |
|---|---|---|
| ≥ 20 produits actifs avec image | `nc_variants` | `SELECT COUNT(*) FROM nc_variants WHERE inventory_quantity > 0 AND status='active' AND image_url IS NOT NULL` |
| Config livraison Alger | `nc_delivery_config` | `SELECT * FROM nc_delivery_config WHERE wilaya = 'Alger' LIMIT 1` |
| 1 code partenaire actif | `nc_partenaires` | `SELECT code, percentage FROM nc_partenaires WHERE active = true LIMIT 1` |
| 1 compte agent | `nc_users` | `SELECT username, role FROM nc_users WHERE role = 'agent' LIMIT 1` |
| 1 compte owner/admin | `nc_users` | `SELECT username, role FROM nc_users WHERE role = 'admin' LIMIT 1` |
| Collections avec images | `nc_collections` | `SELECT title, image_url FROM nc_collections WHERE show_on_homepage = true` |

---

## ENVIRONNEMENTS À TESTER

| Environnement | Navigateur | Largeur | Obligatoire |
|---|---|---|---|
| Mobile algérien (priorité 1) | Chrome Android / iPhone Safari | 375px | OUI |
| Desktop | Chrome ou Firefox | 1280px | OUI |
| Tablette | Safari iPad | 768px | Optionnel |

---

---

# PERSONA 1 — CLIENT

**URL :** https://nc-boutique.vercel.app

---

## BLOC C1 — Navigation et catalogue

| # | Action | Attendu | Résultat |
|---|---|---|---|
| C1.1 | Ouvrir la boutique sur mobile (375px) | Fond noir `#0a0a0a`, 2 cartes uniquement (Coiffure + Onglerie), ticker animé en haut | [ ] OK / [ ] KO |
| C1.2 | Vérifier le ticker | Défilement sans coupure, texte arabe lisible, pas de vide visible | [ ] OK / [ ] KO |
| C1.3 | Cliquer carte **Coiffure** | Redirection vers `/collections/coiffure`, titre arabe RTL correct | [ ] OK / [ ] KO |
| C1.4 | Vérifier la grille de collections sur `/collections/coiffure` | 4 colonnes sur mobile, images visibles, pas de collection "Smart Products Filter" | [ ] OK / [ ] KO |
| C1.5 | Cliquer une collection (ex: مشط) | Page `/produits?category=...&world=coiffure`, produits filtrés | [ ] OK / [ ] KO |
| C1.6 | Vérifier les cartes produits | 4 colonnes mobile, image carrée rognée (object-cover), titre 1 ligne, prix visible en rouge, aucun produit stock=0 | [ ] OK / [ ] KO |
| C1.7 | Faire une recherche texte (ex: "papier") | Résultats filtrés, aucun produit inactif ou stock=0 | [ ] OK / [ ] KO |
| C1.8 | Retourner à l'accueil → choisir **Onglerie** | Thème distinct, produits onglerie uniquement, collections onglerie | [ ] OK / [ ] KO |
| C1.9 | Vérifier le Header sur toutes les pages | Logo NAJMCOIFF blanc, lien vers accueil, compteur panier visible | [ ] OK / [ ] KO |
| C1.10 | Vérifier le Footer | Logo blanc, textes arabes corrects, liste livraison lisible | [ ] OK / [ ] KO |
| C1.11 | Vérifier page À propos `/a-propos` | Textes arabes logiques, horaires 7/7 de 9h à 22h, pas de texte placeholder | [ ] OK / [ ] KO |

**Notes C1 :**
```
_____________________________________________
_____________________________________________
```

---

## BLOC C2 — Fiche produit et panier

| # | Action | Attendu | Résultat |
|---|---|---|---|
| C2.1 | Cliquer sur un produit depuis le catalogue | Fiche produit `/produits/[slug]` s'ouvre, grande image, prix, stock visible | [ ] OK / [ ] KO |
| C2.2 | Cliquer "اضف للسلة" (Ajouter au panier) | CartDrawer s'ouvre depuis la droite, produit visible, total calculé | [ ] OK / [ ] KO |
| C2.3 | Vérifier le CartDrawer sur mobile | Drawer ne s'ouvre PAS sans action (bug T72 — vérifier initialState=false) | [ ] OK / [ ] KO |
| C2.4 | Changer la quantité dans le CartDrawer | Total se met à jour immédiatement | [ ] OK / [ ] KO |
| C2.5 | Ajouter un 2ème produit depuis le catalogue | CartDrawer : 2 articles, total juste, compteur header = 2 | [ ] OK / [ ] KO |
| C2.6 | Supprimer un article du panier | CartDrawer se met à jour, compteur header diminue | [ ] OK / [ ] KO |
| C2.7 | Fermer le CartDrawer (X ou clic dehors) | Drawer se ferme, compteur header reste correct | [ ] OK / [ ] KO |
| C2.8 | Actualiser la page | Panier persiste (localStorage), compteur header correct après reload | [ ] OK / [ ] KO |
| C2.9 | Vérifier overflow horizontal sur mobile | Aucun scroll horizontal parasite sur les pages catalogue et fiche produit | [ ] OK / [ ] KO |

**Notes C2 :**
```
_____________________________________________
_____________________________________________
```

---

## BLOC C3 — Passage de commande

| # | Action | Attendu | Résultat |
|---|---|---|---|
| C3.1 | Depuis le CartDrawer, cliquer "إتمام الطلب" | Redirection `/commander`, formulaire pré-rempli avec les articles du panier | [ ] OK / [ ] KO |
| C3.2 | Vérifier la mise en page du formulaire sur mobile | Tous les champs visibles, RTL correct, pas de débordement | [ ] OK / [ ] KO |
| C3.3 | Remplir : Prénom / Nom / Téléphone / Wilaya / Commune / Type livraison | Tous les champs acceptent la saisie, dropdown Wilaya contient les 58 wilayas | [ ] OK / [ ] KO |
| C3.4 | Choisir type livraison "domicile" | Prix de livraison s'affiche selon wilaya + type | [ ] OK / [ ] KO |
| C3.5 | Choisir type livraison "bureau de poste" | Prix de livraison change (inférieur au domicile si configuré) | [ ] OK / [ ] KO |
| C3.6 | Entrer un **code coupon invalide** | Message d'erreur arabe, remise non appliquée, total inchangé | [ ] OK / [ ] KO |
| C3.7 | Entrer un **code coupon valide** (récupérer depuis `nc_partenaires`) | Remise X% appliquée, total mis à jour, mention remise visible | [ ] OK / [ ] KO |
| C3.8 | Soumettre le formulaire avec téléphone invalide (ex: "123") | Erreur de validation visible en arabe, pas de soumission | [ ] OK / [ ] KO |
| C3.9 | Soumettre avec tous les champs vides | Erreurs de validation sur les champs obligatoires | [ ] OK / [ ] KO |
| C3.10 | Soumettre le formulaire correctement | Redirection vers `/merci/[order_id]`, numéro `NC-XXXXXX-XXXX` affiché | [ ] OK / [ ] KO |
| C3.11 | Vérifier la page de confirmation `/merci/[id]` | Récapitulatif commande (articles, total, wilaya), numéro NC visible | [ ] OK / [ ] KO |
| C3.12 | Cliquer le bouton WhatsApp sur `/merci` | Ouvre whatsapp:// avec message pré-rempli, numéro `213798522820` correct | [ ] OK / [ ] KO |
| C3.13 | Vérifier la commande dans Supabase | `nc_orders` contient la commande avec `order_source='nc_boutique'`, `stock_deducted=true` | [ ] OK / [ ] KO |
| C3.14 | Vérifier `nc_stock_movements` | Entrée de type `sale` avec le bon `variant_id` et `qty_change=-1` | [ ] OK / [ ] KO |

**Code coupon utilisé pour le test :** `___________` (remplir avant de commencer)

**Numéro de commande généré :** `NC-___________` (noter pour le BLOC C4 et BLOC A2)

**Notes C3 :**
```
_____________________________________________
_____________________________________________
```

---

## BLOC C4 — Suivi commande

| # | Action | Attendu | Résultat |
|---|---|---|---|
| C4.1 | Aller sur `/suivi`, saisir le numéro NC- noté en C3.14 | Timeline avec `تم تأكيد الطلب` coché, autres étapes non cochées | [ ] OK / [ ] KO |
| C4.2 | Saisir un numéro inexistant (`NC-000000-9999`) | Message d'erreur arabe "الطلب غير موجود" | [ ] OK / [ ] KO |
| C4.3 | Après injection ZR par l'agent (BLOC A3.3) — revenir sur `/suivi` | Numéro de suivi ZR affiché, étape "تم الإرسال" cochée | [ ] OK / [ ] KO |

**Notes C4 :**
```
_____________________________________________
_____________________________________________
```

---

## BLOC C5 — Compte client (optionnel Phase 2)

| # | Action | Attendu | Résultat |
|---|---|---|---|
| C5.1 | Aller sur `/compte`, s'inscrire avec email + mdp | Formulaire inscription, compte créé dans `nc_customers` | [ ] OK / [ ] KO |
| C5.2 | Se connecter avec les mêmes credentials | JWT stocké, accès au compte, historique commandes visible | [ ] OK / [ ] KO |
| C5.3 | Se déconnecter | Retour à la page compte non authentifiée | [ ] OK / [ ] KO |

---

---

# PERSONA 2 — AGENT

**URL :** https://najmcoiffdashboard.vercel.app

**Prérequis :** Avoir une commande NC- créée au BLOC C3.

---

## BLOC A1 — Connexion

| # | Action | Attendu | Résultat |
|---|---|---|---|
| A1.1 | Ouvrir le dashboard sans être connecté | Page de login, aucun contenu dashboard visible | [ ] OK / [ ] KO |
| A1.2 | Entrer un mauvais mot de passe | Message d'erreur rouge, pas de redirection | [ ] OK / [ ] KO |
| A1.3 | Se connecter avec credentials agent corrects | Dashboard charge, navigation visible, JWT stocké | [ ] OK / [ ] KO |
| A1.4 | Recharger la page | Reste connecté, pas redirigé vers login | [ ] OK / [ ] KO |

---

## BLOC A2 — Gestion des commandes

| # | Action | Attendu | Résultat |
|---|---|---|---|
| A2.1 | Aller dans **Opérations** ou **Confirmation** | Commande NC- (créée en C3) visible dans la liste | [ ] OK / [ ] KO |
| A2.2 | Vérifier que les commandes terminées sont masquées | Seules les commandes actives (non expédiées confirmées) visibles (T45) | [ ] OK / [ ] KO |
| A2.3 | Cliquer sur la commande client | Détail : nom, téléphone, wilaya, commune, articles, total | [ ] OK / [ ] KO |
| A2.4 | Confirmer la commande | Statut passe à `confirmed`, event loggué dans `nc_events` | [ ] OK / [ ] KO |
| A2.5 | Modifier le téléphone client en inline edit | Champ éditable, PATCH envoyé, `nc_orders` mis à jour | [ ] OK / [ ] KO |
| A2.6 | Modifier la wilaya/commune client | Mise à jour visible immédiatement | [ ] OK / [ ] KO |

**Notes A2 :**
```
_____________________________________________
_____________________________________________
```

---

## BLOC A3 — Préparation et expédition

| # | Action | Attendu | Résultat |
|---|---|---|---|
| A3.1 | Aller dans **Préparation** sur mobile | Vue master/detail : liste à gauche, clic ouvre detail + bouton Retour (T46) | [ ] OK / [ ] KO |
| A3.2 | Sélectionner la commande, cocher articles préparés | Badge "MODIFIÉ" visible si articles modifiés | [ ] OK / [ ] KO |
| A3.3 | Injecter via ZR Express (bouton injection) | Colis créé chez ZR, numéro tracking enregistré dans `nc_suivi_zr` | [ ] OK / [ ] KO |
| A3.4 | Tenter une 2ème injection ZR sur la même commande | Refusée — `zr_locked=true`, message d'erreur explicite (T40) | [ ] OK / [ ] KO |
| A3.5 | Injection manuelle (si ZR non dispo) | Numéro ZR saisi à la main, statut mis à jour dans `nc_suivi_zr` | [ ] OK / [ ] KO |

**Notes A3 :**
```
_____________________________________________
_____________________________________________
```

---

## BLOC A4 — Outils agents

| # | Action | Attendu | Résultat |
|---|---|---|---|
| A4.1 | Aller dans **POS Comptoir** `/dashboard/pos` | Recherche produit (nom / barcode / SKU), liste résultats visible | [ ] OK / [ ] KO |
| A4.2 | Ajouter un produit POS, confirmer la vente | Commande créée dans `nc_orders` (`order_source='pos'`), stock déduit immédiatement | [ ] OK / [ ] KO |
| A4.3 | Aller dans **Suivi ZR** | Liste colis visible, statuts depuis ZR Express | [ ] OK / [ ] KO |
| A4.4 | Clôture de journée | Commandes du jour archivées (`archived=true`), recette enregistrée (T39) | [ ] OK / [ ] KO |
| A4.5 | Vérifier les notifications push | Commande boutique déclenche une notification aux agents connectés | [ ] OK / [ ] KO |

**Notes A4 :**
```
_____________________________________________
_____________________________________________
```

---

---

# PERSONA 3 — OWNER / ADMIN

**URL :** https://najmcoiffdashboard.vercel.app/dashboard/owner
**Prérequis :** Compte avec `role = 'admin'`

---

## BLOC O1 — Catalogue admin

| # | Action | Attendu | Résultat |
|---|---|---|---|
| O1.1 | Aller dans `/dashboard/owner/catalogue` | Liste complète des variantes `nc_variants`, chargement rapide | [ ] OK / [ ] KO |
| O1.2 | Filtrer par date récente | Tri par `updated_at` desc, articles récents en premier (T34) | [ ] OK / [ ] KO |
| O1.3 | Filtrer par prix | Tri prix croissant / décroissant fonctionnel | [ ] OK / [ ] KO |
| O1.4 | Cliquer "Modifier" sur un article | Modal édition : prix, compare_at_price, is_new, statut | [ ] OK / [ ] KO |
| O1.5 | Modifier le prix d'un article + sauvegarder | `nc_variants` mis à jour, boutique reflète le changement | [ ] OK / [ ] KO |
| O1.6 | Uploader une image via le formulaire | Image uploadée dans bucket `product-images`, `image_url` mis à jour (T37) | [ ] OK / [ ] KO |
| O1.7 | Désactiver un article (`status=inactive`) | Article disparaît de la boutique publique (règle H11) | [ ] OK / [ ] KO |
| O1.8 | Réactiver l'article | Article réapparaît dans la boutique | [ ] OK / [ ] KO |

**Notes O1 :**
```
_____________________________________________
_____________________________________________
```

---

## BLOC O2 — Collections

| # | Action | Attendu | Résultat |
|---|---|---|---|
| O2.1 | Aller dans `/dashboard/owner/collections` | Liste `nc_collections` avec toggles `show_on_homepage` + `show_in_filter` (T59) | [ ] OK / [ ] KO |
| O2.2 | Activer `show_on_homepage` sur une collection | Collection apparaît dans `/collections/[world]` côté boutique | [ ] OK / [ ] KO |
| O2.3 | Désactiver `show_in_filter` sur une collection interne | Elle disparaît du dropdown filtre boutique (T64) | [ ] OK / [ ] KO |
| O2.4 | Modifier l'image d'une collection | `image_url` mis à jour, carte collection affiche la bonne image (T81) | [ ] OK / [ ] KO |

**Notes O2 :**
```
_____________________________________________
_____________________________________________
```

---

## BLOC O3 — Configuration et analytics

| # | Action | Attendu | Résultat |
|---|---|---|---|
| O3.1 | Aller dans `/dashboard/owner` (page principale) | KPIs visibles : nb commandes, CA, articles en stock | [ ] OK / [ ] KO |
| O3.2 | Modifier le prix livraison d'une wilaya dans `nc_delivery_config` | La page commande boutique reflète le nouveau prix | [ ] OK / [ ] KO |
| O3.3 | Aller dans `/dashboard/owner/analytics` | Graphiques `nc_page_events` : vues, paniers, commandes par monde (T25) | [ ] OK / [ ] KO |
| O3.4 | Vérifier que les events des 2 mondes sont séparés | Les données Coiffure et Onglerie ne se mélangent pas (règle H7) | [ ] OK / [ ] KO |
| O3.5 | Aller dans `/dashboard/owner/doc` | PLAN.md s'affiche correctement dans le navigateur (T15) | [ ] OK / [ ] KO |

**Notes O3 :**
```
_____________________________________________
_____________________________________________
```

---

## BLOC O4 — Partenaires et codes coupon

| # | Action | Attendu | Résultat |
|---|---|---|---|
| O4.1 | Voir la liste des codes partenaires | Liste `nc_partenaires` avec code, nom, pourcentage, statut | [ ] OK / [ ] KO |
| O4.2 | Créer un nouveau code partenaire | Code actif, disponible à l'utilisation en boutique (tester en C3.7) | [ ] OK / [ ] KO |
| O4.3 | Désactiver un code existant | `active=false`, boutique refuse le code avec message d'erreur | [ ] OK / [ ] KO |

---

---

# SCÉNARIOS E2E CROSS-PERSONA

Ces scénarios connectent les 3 personas dans une séquence réelle. Chaque scénario doit être complété dans l'ordre indiqué.

---

## Scénario E1 — Commande standard de bout en bout

**Durée estimée :** 15–20 minutes

```
ÉTAPE 1 (CLIENT) : Choisir Coiffure → ajouter 2 articles → passer commande → noter NC-XXXXXX
ÉTAPE 2 (AGENT)  : Voir la commande dans Opérations
ÉTAPE 3 (AGENT)  : Confirmer la commande → statut "confirmed"
ÉTAPE 4 (AGENT)  : Injecter ZR → numéro tracking créé
ÉTAPE 5 (CLIENT) : Ouvrir /suivi/NC-XXXXXX → vérifier "تم الإرسال" coché
```

| Étape | Résultat |
|---|---|
| ÉTAPE 1 — Commande créée (NC- noté) | [ ] OK / [ ] KO |
| ÉTAPE 2 — Commande visible dashboard | [ ] OK / [ ] KO |
| ÉTAPE 3 — Confirmation agent | [ ] OK / [ ] KO |
| ÉTAPE 4 — Injection ZR | [ ] OK / [ ] KO |
| ÉTAPE 5 — Suivi client mis à jour | [ ] OK / [ ] KO |

---

## Scénario E2 — Stock épuisé (race condition)

**Durée estimée :** 10 minutes

```
ÉTAPE 1 (OWNER)  : Trouver un article avec stock = 1 ou 2 dans nc_variants
ÉTAPE 2 (CLIENT A) : Ajouter cet article au panier (ne pas encore commander)
ÉTAPE 3 (CLIENT B) : Passer commande sur le même article → stock tombe à 0 (ou 1)
ÉTAPE 4 (CLIENT A) : Tenter de passer commande → vérifier erreur 422 "Stock insuffisant"
ÉTAPE 5 (OWNER)  : Vérifier nc_stock_movements : 2 entrées pour ce variant_id
```

| Étape | Résultat |
|---|---|
| ÉTAPE 1 — Article stock limité trouvé | [ ] OK / [ ] KO |
| ÉTAPE 3 — Première commande passe | [ ] OK / [ ] KO |
| ÉTAPE 4 — Deuxième commande bloquée (422) | [ ] OK / [ ] KO |
| ÉTAPE 5 — nc_stock_movements correct | [ ] OK / [ ] KO |

---

## Scénario E3 — Code coupon partenaire

**Durée estimée :** 10 minutes

```
ÉTAPE 1 (OWNER)  : Créer code "TEST20" à 20% dans nc_partenaires (actif)
ÉTAPE 2 (CLIENT) : Passer commande avec code "TEST20" → vérifier -20% appliqué
ÉTAPE 3 (CLIENT) : Vérifier le total sur /merci (total_price = sous-total × 0.80 + livraison)
ÉTAPE 4 (AGENT)  : Voir la commande — remise visible dans le détail
ÉTAPE 5 (OWNER)  : Désactiver "TEST20" → client essaie → refusé
```

| Étape | Résultat |
|---|---|
| ÉTAPE 1 — Code créé | [ ] OK / [ ] KO |
| ÉTAPE 2 — Remise appliquée en boutique | [ ] OK / [ ] KO |
| ÉTAPE 3 — Total correct sur /merci | [ ] OK / [ ] KO |
| ÉTAPE 4 — Remise visible dashboard | [ ] OK / [ ] KO |
| ÉTAPE 5 — Code désactivé → refusé | [ ] OK / [ ] KO |

---

## Scénario E4 — Double soumission (idempotency)

**Durée estimée :** 5 minutes

```
ÉTAPE 1 (CLIENT) : Passer une commande → noter le NC- et l'URL /merci
ÉTAPE 2 (CLIENT) : Depuis la même session, retourner sur /commander (même panier localStorage)
ÉTAPE 3 (CLIENT) : Resoumettre le formulaire (même idempotency_key en localStorage)
ÉTAPE 4 (OWNER)  : Vérifier dans nc_orders qu'il n'y a PAS de doublon pour ce client
```

| Étape | Résultat |
|---|---|
| ÉTAPE 1 — Première commande | [ ] OK / [ ] KO |
| ÉTAPE 3 — Deuxième soumission | [ ] OK / [ ] KO |
| ÉTAPE 4 — Pas de doublon en DB | [ ] OK / [ ] KO |

---

---

# BUGS CONNUS À TESTER EN PRIORITÉ

Ces bugs sont ouverts (`TODO` dans TASKS.md). Les vérifier activement pendant les tests :

| ID | Problème | Page | Statut à la date du test |
|---|---|---|---|
| T63 | Collections accueil ne s'affichent pas (`show_on_homepage=true` ignoré) | `/collections/[world]` | [ ] Corrigé / [ ] Encore présent |
| T64 | Filtre catalogue n'utilise pas `nc_collections` (`show_in_filter` ignoré) | `/produits` dropdown | [ ] Corrigé / [ ] Encore présent |
| T65 | Badge stock "آخر قطع" visible en bas des cartes (à supprimer) | Toutes les pages catalogue | [ ] Corrigé / [ ] Encore présent |
| T66 | Logo Header/Footer style "boîte" à refaire (option D Minimal Cut) | Header + Footer | [ ] Corrigé / [ ] Encore présent |
| T78 | Fond WatermarkBg à supprimer (fond noir uni `#0a0a0a` pur) | Toutes les pages | [ ] Corrigé / [ ] Encore présent |
| T79 | Footer التوصيل liste simple sans card-borders + retirer 1 item | Footer | [ ] Corrigé / [ ] Encore présent |
| T80 | Navigation niches → `/collections/[world]` (page monde) | Page d'accueil | [ ] Corrigé / [ ] Encore présent |
| T83 | Direction `dir="ltr"` manquante, blocs arabes restent `text-align:right` | Toutes les pages | [ ] Corrigé / [ ] Encore présent |

**Pour chaque bug trouvé, noter :**
- Page exacte :
- Action effectuée :
- Comportement observé :
- Comportement attendu :

---

---

# RÉSUMÉ RAPIDE (SMOKE TEST — 10 minutes)

Pour un test rapide avant un déploiement, vérifier ces 5 points minimum :

| # | Vérification | Résultat |
|---|---|---|
| S1 | Page d'accueil charge sur mobile → 2 cartes visibles | [ ] OK / [ ] KO |
| S2 | Catalogue coiffure affiche des produits avec images | [ ] OK / [ ] KO |
| S3 | Ajouter au panier → CartDrawer s'ouvre (pas spontanément) | [ ] OK / [ ] KO |
| S4 | Passer une commande complète → NC- généré | [ ] OK / [ ] KO |
| S5 | Dashboard agent → commande visible + confirmable | [ ] OK / [ ] KO |

---

> **Dernière session de test :** _______________
> **Testé par :** _______________
> **Version boutique déployée :** _______________
> **Bugs bloquants détectés :** _______________
