# NajmCoiff — Architecture Système (Phase M4 — Supabase + Vercel)

> **Règle IA** : Lire ce fichier en premier. Il contient tout ce qu'il faut pour intervenir sur le système.
> ⚡ Phase M4 terminée — **0 Shopify · 0 GAS · 0 Google Sheets** — tout tourne sur Supabase + Vercel

---

## Stack (Phase M4 — actuel)

| Couche | Techno | Rôle |
|---|---|---|
| Base de données | Supabase (PostgreSQL) | Toutes les données (`nc_*`) |
| Frontend + API | Vercel Next.js 16 App Router | Dashboard agents + boutique client |
| Livraison | ZR Express API | Injection colis, tracking, webhooks |
| CSS | Tailwind v4 | Styling responsive |
| Tests | Playwright | Tests humains E2E obligatoires |

> ⛔ GAS archivé définitivement dans `gas/_archive/` — ne plus utiliser `clasp`
> ⛔ Shopify supprimé — lib/shopify.js effacé, webhooks → 410 Gone

---

## Tables Supabase actives (nc_*)

| Table | Rôle clé |
|---|---|
| `nc_orders` | Commandes (boutique + POS + archive Shopify) — source: `nc_boutique` / `pos` |
| `nc_variants` | Catalogue produits natif (images Supabase Storage) |
| `nc_events` | Log universel de toutes les actions |
| `nc_barrage` | Seuils stock produits |
| `nc_users` | Comptes agents dashboard (≠ nc_customers) |
| `nc_suivi_zr` | Suivi colis ZR Express |
| `nc_rapports` | Rapports agents |
| `nc_po_lines` | Lignes bon de commande fournisseur |
| `nc_gestion_fond` | Transactions caisse |
| `nc_kpi_stock` | KPI stock (achats jamais vendus) |
| `nc_quota` | Quotas agents |
| `nc_quota_orders` | Commandes rattachées aux quotas |
| `nc_partenaires` | Codes partenaires (réductions) |
| `nc_recettes` | Recettes journalières |
| `nc_delivery_config` | Prix livraison par wilaya (58 wilayas ZR Express) |
| `notes` | Notes Organisation (publiques + privées) |
| `note_reactions` | Réactions emoji sur les notes (❤️🔥❌⛔) |
| `reactions` | Réactions emoji sur les messages Discussions |
| `messages` | Messages Discussions (texte/vocal/image/vidéo) |
| `salons` | Salons de discussion |
| `evenements` | Agenda — événements récurrents ou ponctuels |
| `nc_social_queue` | **[PLANIFIÉ — T_SOCIAL_QUEUE]** File d'attente contenu réseaux sociaux |
| `nc_customers` | Comptes clients boutique publique |
| `nc_page_events` | Tracking clickstream boutique |
| `nc_products` | Catalogue produits boutique (Phase 2) |

---

## Routes Vercel actives (Phase M4 — 0 GAS, 0 Shopify)

```
POST /api/auth/login              → nc_users (login)
GET  /api/orders/online           → nc_orders (source != pos)
GET  /api/orders/pos              → nc_orders (source = pos)
PATCH /api/orders/modify-items    → nc_orders + stock (remplace GAS MODIFY_ORDER)
PATCH /api/orders/update-customer → nc_orders (téléphone, wilaya, commune)
DELETE /api/orders/[id]           → nc_orders + restock
POST /api/pos/order               → nc_orders + decrement_stock (POS natif)
POST /api/inject/single           → ZR Express (1 colis) + nc_suivi_zr
POST /api/inject/batch            → ZR Express (batch) + nc_suivi_zr
POST /api/inject/manuel           → nc_orders + nc_suivi_zr (suivi manuel)
POST /api/barrage/run             → nc_barrage → nc_variants UPDATE direct
POST /api/cloture                 → nc_orders (clôture journée) + restock annulés
GET  /api/quota                   → nc_quota
POST /api/quota/generate          → nc_quota + nc_quota_orders
GET  /api/rapports/count          → nc_rapports
GET/POST /api/partenaires         → nc_partenaires
POST /api/po/inject               → nc_po_lines → nc_variants (remplace GAS RUN_INJECT_PO)
POST /api/po/lines                → nc_po_lines (remplace GAS ADD_PO_LINES)
GET  /api/po/labels               → nc_po_lines (étiquettes)
POST /api/fond/reset              → nc_gestion_fond (RAZ caisse)
POST /api/variants/mark-achete    → nc_kpi_stock
GET  /api/barcodes                → nc_po_lines (données barcode)
POST /api/webhooks/shopify        → 410 Gone (T205)
POST /api/webhooks/zr             → nc_suivi_zr + nc_events (Svix signature)
POST /api/gas                     → 410 Gone (T207)
POST /api/sb-write                → Supabase write sécurisé (service key)
POST /api/log                     → nc_events
POST /api/push/subscribe          → push notifications
POST /api/push/send               → push notifications
GET/POST /api/admin/users         → nc_users
GET/POST /api/owner/catalogue     → nc_variants
GET/POST /api/owner/collections   → nc_collections
GET/POST /api/owner/config        → nc_boutique_config
GET/POST /api/owner/livraison     → nc_delivery_config
```

---

## Flux principaux

**Nouvelle commande Shopify :**
`Shopify webhook → POST /api/webhooks/shopify → nc_orders INSERT + nc_events log`

**Confirmation agent :**
`Dashboard → Supabase direct sbUpdateConfirmation → nc_orders PATCH`

**Injection ZR :**
`Dashboard → POST /api/inject/single → ZR Express API → nc_suivi_zr UPSERT + nc_events log`

**Modifier commande :**
`Dashboard → POST /api/gas (MODIFY_ORDER) → GAS → Shopify Draft Order API → nc_orders PATCH`

**Barrage stock :**
`Dashboard → POST /api/barrage/run → nc_barrage READ → Shopify inventory SET → nc_events log`

**Injection PO :**
`Dashboard → POST /api/gas (RUN_INJECT_PO) → GAS → nc_po_lines READ → Shopify inventory ADD`

---

## Accès rapide (voir CONTROLE_TOTALE.md pour les clés complètes)

| Service | URL |
|---|---|
| Dashboard prod | https://najmcoiffdashboard.vercel.app |
| Supabase | https://alyxejkdtkdmluvgfnqk.supabase.co |
| GAS WebApp | https://script.google.com/macros/s/AKfycbzWvXYmEucYGijHWl_rBAqFY4h4caFQFMh99AmEqAgi9QMAH5N0xsI0Y-cCge6LCgQ/exec |
| Shopify Admin | https://admin.shopify.com/store/8fc262 |

---

---

## Bugs connus & améliorations planifiées (S8 — 2026-04-12)

> Décisions finales validées par l'utilisateur le 2026-04-12.

---

### B1 — Clôture journée (CORRIGÉ — logique révisée 2026-04-13)

**Décisions validées :**
- `last = 'OUI'` → TOUTES les commandes online NON-POS dont `order_date ≤ date de la commande de coupure`, **sans condition sur le statut**
- `cloture = 'OUI'` → parmi les mêmes : celles avec `tracking` non vide OU `decision_status = 'annuler'`
- **`archived` n'est PAS utilisé lors de la clôture journalière** — il est réservé exclusivement à la clôture de la situation de livraison ZR
- Le filtre "commandes actives" dans le dashboard repose sur `last` + statuts (filtre JS), PAS sur `archived`

**Sémantique `archived` :**
- `archived = false` (défaut) → toujours visible dans le dashboard
- `archived = true` → réservé pour : colis livré définitivement ou retourné par ZR Express (future implémentation)
- `archived` est **totalement décorrélé** du traitement agent (confirmation, annulation, clôture journée)

**Filtre commandes actives (`sbGetOrders`) :**
```
SQL  : order_source ≠ 'pos'
JS   : masquer si last='OUI' ET (annulé OU expédié+confirmé)
```

**Fichier :** `vercel-quick/app/api/cloture/route.js`

---

### B2 — Injection ZR : protection double-tracking

**Problème :** `/inject/batch` ne gère pas les `tracking = ''` (chaîne vide). `zr_locked` existe mais n'est jamais utilisé.

**Décisions validées :**
- `zr_locked = 'OUI'` mis **après** succès ZR (en même temps que `tracking`), comme protection secondaire
- Dans `/inject/single` : bloquer si `order.tracking` non vide OU `order.zr_locked = 'OUI'`
- Dans `/inject/batch` : filtrer `(tracking IS NULL OR tracking = '')` ET `zr_locked IS NULL`

**Fichiers :** `vercel-quick/app/api/inject/single/route.js`, `vercel-quick/app/api/inject/batch/route.js`

---

### B3 — Commandes modifiées non injectables dans ZR

**Problème :** Quand `MODIFY_ORDER` crée une nouvelle commande Shopify via Draft Order, la nouvelle commande arrive via webhook sans `decision_status` et sans données client (wilaya, téléphone) → jamais injectable.

**Décisions validées :**
- L'agent doit **manuellement confirmer** la nouvelle commande (pas d'auto-confirm)
- Le GAS (`updateOrdersV2Statuses_afterModify_`) doit copier les infos client de l'ancienne vers la nouvelle commande dans `nc_orders` : `customer_name`, `customer_phone`, `wilaya`, `commune`, `adresse`, `order_source`
- Le batch ZR doit inclure `decision_status = 'modifier'` (en plus de `'confirmer'`) pour que les commandes modifiées soient injectables une fois confirmées

**Fichier GAS :** `gas/🌎MODIFIER LES ARTICLES D'UNE COMMANDE SHOPIFY.js`
**Fichier Vercel :** `vercel-quick/app/api/inject/batch/route.js`

---

### B1b — Filtre commandes actives : visibilité des orders `last='OUI'` (correction S8)

**Contexte :** `sbGetOrders` filtre avec `or=(last.is.null, last.neq.OUI)` → **tous** les orders avec `last='OUI'` sont cachés, même ceux qui ne sont pas encore traités.

**Règle validée (2026-04-12) :**

Un order avec `last='OUI'` est **masqué** uniquement si l'une des deux conditions est vraie :
1. `last='OUI'` ET `decision_status='annuler'` → annulé = terminé
2. `last='OUI'` ET `tracking` non vide ET `decision_status IN ('confirmer','modifier')` → expédié = terminé

Un order avec `last='OUI'` reste **visible** si :
- Aucune décision encore (en attente)
- Confirmé mais sans tracking (pas encore expédié)

**Implémentation :**
- Changer le filtre Supabase de `or=(last.is.null,last.neq.OUI)` → `archived=false` (gère les nouvelles données post-fix)
- Ajouter un filtre JavaScript post-fetch pour les données legacy (`last='OUI'` + `archived=false`) : exclure les ordres "terminés"

**Fichier :** `vercel-quick/lib/supabase-direct.js` — fonction `sbGetOrders`

---

### B4 — Page suivi-zr : nouvelles commandes manquantes

**Problème :** La page `/dashboard/suivi-zr` ne reflète pas les nouvelles injections. Cause probable : la page charge les données depuis `nc_orders` et non `nc_suivi_zr`, ou le refresh n'est pas déclenché après injection.

**Fix cible :** Vérifier que la page lit bien `nc_suivi_zr` (pas seulement `nc_orders`) et que les nouvelles lignes upsertées par `/inject/single` et `/inject/batch` sont bien retournées.

**Fichiers :** `vercel-quick/app/dashboard/suivi-zr/page.js`

---

### B5 — Notifications équipe : 2 manquantes

**Existantes :** shooting lancé, shooting terminé, retour traité, synchroniser
**À ajouter :**
- 🎯 **"Quota préparée"** → notifie l'équipe qu'un quota est prêt
- 📬 **"Retour lancée"** → étape *avant* "retour traité" : signale qu'on commence à traiter les retours physiques

**Fichier :** `vercel-quick/app/dashboard/operations/page.js`

---

### B6 — Modification info client (téléphone + adresse)

**Fonctionnalité manquante :** aucune UI ni route API pour modifier téléphone/adresse d'un client.

**Décisions validées :**
- Inline edit **sur la fiche commande dans la page Confirmation** (`/dashboard/confirmation/page.js`)
- Champs : téléphone (texte), wilaya (dropdown depuis `WILAYA_MAP` statique déjà en mémoire), commune (texte libre)
- Nouvelle route : `PATCH /api/orders/update-customer` → `nc_orders PATCH` + log `nc_events`
- Pas d'appel ZR API pour les listes — utiliser la `WILAYA_MAP` déjà présente dans `operations/page.js`

**Fichiers à créer/modifier :**
- `vercel-quick/app/api/orders/update-customer/route.js` (nouveau)
- `vercel-quick/app/dashboard/confirmation/page.js` (inline edit)

---

---

### UX1 — Page préparation mobile : navigation master/detail + badge MODIFIÉ

**Problème 1 — Mobile :** Le layout est `flex` côte-à-côte (liste `w-full md:w-96` + détail `flex-1`). Sur téléphone la liste prend tout l'écran ; quand on clique une carte, `setDetail` est appelé mais le panneau détail reste masqué derrière. Aucune bascule mobile/desktop n'existe (contrairement à la page confirmation qui a ce pattern).

**Fix :**
- Liste masquée quand un détail est sélectionné sur mobile : `detail ? "hidden md:flex" : "flex"` sur le conteneur liste
- Panneau détail affiché seulement sur mobile quand sélectionné : `detail ? "flex md:flex-1" : "hidden md:flex md:flex-1"` 
- Bouton retour `md:hidden` en haut du panneau détail (sticky)

**Problème 2 — Badge MODIFIÉ manquant :** `decision_status='modifier'` n'a ni badge dans la liste ni alerte dans le panneau détail. Besoin d'un badge `♻️ MODIFIÉ` (orange/bleu) visible comme ANNULÉ.

**Fichier :** `vercel-quick/app/dashboard/preparation/page.js`

---

---

## §PWA — Application Mobile Dashboard (T131)

> Décision : PWA (Progressive Web App) — pas React Native. Même codebase, déploiement en 1 heure.

### Pourquoi PWA et pas app native ?
- Dashboard déjà responsive + Service Worker existant + VAPID keys configurées
- Aucune soumission App Store, mise à jour instantanée
- Notifications push identiques à une app native (Android 8+ / iOS 16.4+)
- L'agent installe via "Ajouter à l'écran d'accueil" → icône comme une vraie app

### Fichiers modifiés
| Fichier | Changement |
|---|---|
| `vercel-quick/public/manifest.json` | Nouveau — déclare nom, icônes, start_url=/dashboard, display=standalone |
| `vercel-quick/app/layout.js` | Ajouter `<link rel="manifest">` + meta `theme-color` + `apple-mobile-web-app` |
| `vercel-quick/public/sw.js` | Ajouter cache offline shell (navigation fallback) |
| `vercel-quick/app/dashboard/layout.js` | Bouton install (écoute `beforeinstallprompt`) dans sidebar footer |

### Critères PWA installable
1. HTTPS ✅ (Vercel)
2. Service Worker ✅ (sw.js existant)
3. Manifest.json ✅ (à créer)
4. Icon 192px + 512px ✅ (logo.png existant)
5. `start_url` accessible ✅

### Flux notifications (déjà fonctionnel)
```
Événement (nouvelle commande, message, retour...) 
→ /api/push/send (web-push + VAPID)
→ Service Worker reçoit "push" event
→ Notification native sur le téléphone de l'agent
→ Tap → ouvre /dashboard (en mode standalone)
```

---

## §NOTES_REACTIONS — Réactions emoji sur les notes Organisation (T_ORG_NOTES)

> Mis à jour : 2026-04-14

### Table Supabase : `note_reactions`

```sql
CREATE TABLE note_reactions (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id    uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  auteur_nom text NOT NULL,
  type       text NOT NULL CHECK (type IN ('heart', 'fire', 'x', 'stop')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(note_id, auteur_nom, type)
);
```

### Signification des emojis (notes + discussions)

| Emoji | Type DB | Signification |
|---|---|---|
| ❤️ | `heart` | **Bien reçu** — message lu et compris |
| 🔥 | `fire`  | **Effectué / terminé** — tâche accomplie |
| ❌ | `x`     | **Problème / faute** — erreur à corriger |
| ⛔ | `stop`  | **Important** — à ne pas manquer / prioritaire |

> Même logique pour la table `reactions` (discussions) : `CHECK (type IN ('heart', 'fire', 'x', 'stop'))`

### Fonctionnement

- **Toggle** : cliquer une réaction déjà posée la retire
- **Compteur** : affiché si ≥ 1 réaction (ex: "❤️ 3")
- **Popover survol** : montre les noms des agents qui ont réagi
- **Temps réel** : `supabase.channel("org-realtime")` écoute INSERT/DELETE sur `note_reactions`
- **Vue desktop** : réactions dans le footer de la sticky note (canvas)
- **Vue mobile** : réactions directement sous le contenu de la note (liste)

### Édition de notes

- **Bouton ✎** : visible au hover (desktop) ou toujours visible (mobile)
- **Permissions** : auteur de la note + managers (owner, chef d'equipe, responsable)
- **NoteModal** : réutilisé avec `initialData` + `onUpdate` pour le mode édition
- **Champs modifiables** : contenu, couleur, destinataire(s) (assigned_to)
- **Multi-destinataires** : `assigned_to` stocké en virgule-séparée `"Alice, Bob"` — checkboxes en modal

### Discussions — Popover réactions

Le `ReactionBar` des discussions montre un popover stylisé au survol :
- Titre : emoji + label (ex: "❤️ Bien reçu")
- Liste des noms des réacteurs
- L'utilisateur actuel apparaît en **jaune** avec "✓ Vous"
- 4 emojis disponibles : ❤️ 🔥 ❌ ⛔

### Fichiers concernés

| Fichier | Changement |
|---|---|
| `vercel-quick/app/dashboard/organisation/page.js` | NoteReactionBar, NoteModal édition, handleCreateNote fix |
| `vercel-quick/app/dashboard/discussions/page.js` | ReactionBar + popover noms |
| `vercel-quick/tests/e2e/organisation-notes.spec.js` | Tests Playwright 4/4 ✅ |

*Mis à jour : 2026-04-14 — T_ORG_NOTES*

---

## §SOCIAL_QUEUE — File d'attente Réseaux Sociaux (T_SOCIAL_QUEUE) ✅ DONE

> Statut : DONE — Playwright humain 2/2 ✅. Ajout 2026-04-15 : bouton "↩ Remettre en file" (owner) pour annuler un partage accidentel → route POST /api/social-queue/unshare (service role)

### Workflow

```
Salon "Créatif" (Discussions)
  └── Owner clique [+ File d'attente] sur un message
        → Modal : titre + type (Reels/Story) + world (Coiffure/Onglerie)
                + plateformes (TikTok ☑ Insta ☑ FB ☑) + date publication
        → Entrée créée dans nc_social_queue (statut: validé)

Page /dashboard/social-queue
  └── Liste triée par date publication
  └── Drag & drop pour réorganiser (colonne `position`)
  └── Compteurs mensuels :
        🎬 Coiffure Reels : X/15  |  💅 Onglerie Reels : X/15
  └── Agent coche "Partagé ✅" → note automatique dans Organisation

Note automatique (Organisation) :
  "✅ [Titre] — [Reels Coiffure] partagé sur [TikTok, Insta] le [date] par [agent]"
  → couleur verte · tag tous les "agent digital" · push notification
```

### Table `nc_social_queue`

```sql
CREATE TABLE nc_social_queue (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  titre           text NOT NULL,
  type            text NOT NULL CHECK (type IN ('reels', 'story')),
  world           text NOT NULL CHECK (world IN ('coiffure', 'onglerie')),
  platforms       text[] NOT NULL DEFAULT '{}',  -- ['tiktok','instagram','facebook']
  source_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  content_url     text,
  status          text NOT NULL DEFAULT 'validé' CHECK (status IN ('validé', 'partagé')),
  publication_date date,
  position        int DEFAULT 0,
  created_by      text NOT NULL,
  published_by    text,
  published_at    timestamptz,
  created_at      timestamptz DEFAULT now()
);
```

### Objectifs mensuels (hardcodés UI)
- Coiffure Reels : **15/mois**
- Onglerie Reels : **15/mois**
- Stories : affichées mais sans objectif

### Permissions
- **Ajout à la file** : owner + chef d'equipe (via bouton dans le salon Créatif)
- **Marquer partagé** : tous les agents
- **Vue** : tous les agents

### Fichiers concernés
| Fichier | Rôle |
|---|---|
| `vercel-quick/app/dashboard/discussions/page.js` | Bouton ➕ sur messages du salon Créatif |
| `vercel-quick/app/dashboard/social-queue/page.js` | Nouvelle page (à créer) |
| `vercel-quick/app/dashboard/organisation/page.js` | Réception note automatique |
| `vercel-quick/tests/e2e/social-queue.spec.js` | Tests Playwright humain |

---

## §NOTE_TASKS — Checkboxes dans les notes (T_NOTE_TASKS) 🟡 PLANIFIÉ

> Statut : TODO — Playwright humain OBLIGATOIRE pour valider

### Fonctionnement
- Dans le modal d'édition de note : zone "Tâches" avec bouton **+ Ajouter une tâche**
- Le texte sélectionné dans la note peut être converti en tâche (style Miro)
- Les tâches sont stockées en colonne `checkboxes` JSONB sur la table `notes`
- **Cocher/décocher** : auteur de la note + owner uniquement
- État partagé — tout le monde voit les coches en temps réel
- Affiché : sticky note desktop + liste mobile

### Schéma DB (colonne à ajouter)
```sql
ALTER TABLE notes ADD COLUMN IF NOT EXISTS checkboxes jsonb DEFAULT '[]'::jsonb;
-- Format : [{"id": "uuid", "text": "Faire les stocks", "checked": false, "added_by": "najm"}]
```

### Permissions toggle checkbox
```
auteur de la note (note.auteur_nom) OU role = owner
```

### Fichiers concernés
| Fichier | Rôle |
|---|---|
| `vercel-quick/app/dashboard/organisation/page.js` | UI checkboxes + toggle handler |
| `vercel-quick/tests/e2e/note-tasks.spec.js` | Tests Playwright humain |

---

## §NOTE_OWNER_EDIT — Owner modifie les notes des autres (T_NOTE_OWNER_EDIT) 🟡 PLANIFIÉ

> Statut : TODO — Playwright humain OBLIGATOIRE pour valider

### Comportement
- Le owner voit le bouton ✎ sur **toutes** les notes (pas seulement les siennes)
- La modification est silencieuse (pas de trace "modifié par" affichée)
- Champs modifiables : contenu, couleur, assigned_to

### Fix RLS Supabase
La politique actuelle `UPDATE notes` autorise uniquement `auteur_nom = current_user`.
À mettre à jour pour inclure le role owner :
```sql
-- Vérifier la policy actuelle
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'notes';

-- Ajouter l'autorisation owner (si RLS est activé)
-- La logique owner se fait via le service role key côté Vercel
```

> Note : si la table `notes` utilise le service_role_key côté Vercel (pas l'anon key),
> la RLS n'est pas un blocage — seul le contrôle UI est nécessaire.

### Fichiers concernés
| Fichier | Rôle |
|---|---|
| `vercel-quick/app/dashboard/organisation/page.js` | `canEdit` condition — déjà `isManager()` inclut owner |
| `vercel-quick/tests/e2e/note-owner-edit.spec.js` | Tests Playwright humain |
