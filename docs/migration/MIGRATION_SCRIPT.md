# MIGRATION_SCRIPT.md — Sortie définitive Shopify
> version: 1.0 | updated: 2026-04-11
> Ce document est le plan d'exécution pour migrer de Shopify vers nc-boutique.
> Lire entièrement avant d'exécuter la moindre étape.

---

## RÉSUMÉ STRATÉGIE

**Décision (2026-04-11) :** Sortie DÉFINITIVE de Shopify — pas progressive.
**Objectif :** Zéro dépendance Shopify. Frais d'abonnement = 0.
**Durée estimée :** 6-8 semaines (dépend du rythme de validation)

---

## 5 PHASES DE MIGRATION

### PHASE M1 — Extraction des données Shopify (1-2 semaines)
**Statut :** `TODO`
**Objectif :** Copier toutes les données utiles de Shopify vers Supabase.

**Checklist M1 :**
- [ ] Exécuter `node scripts/migrate-shopify.js --phase=products` (ajoute compare_at_price, collections, description, is_new)
- [ ] Exécuter `node scripts/migrate-shopify.js --phase=images` (copie images vers Supabase Storage ou CDN)
- [ ] Exécuter `node scripts/migrate-shopify.js --phase=collections` (peuple tableau `collections` dans nc_variants)
- [ ] Vérifier : `SELECT count(*) FROM nc_variants WHERE compare_at_price IS NOT NULL`
- [ ] Archiver export CSV produits Shopify (manuel : Shopify Admin > Produits > Export)
- [ ] Archiver export CSV commandes Shopify (manuel : Shopify Admin > Commandes > Export)

---

### PHASE M2 — Lancement Parallèle (2-3 semaines)
**Statut :** `IN_PROGRESS` (nc-boutique live)
**Objectif :** nc-boutique reçoit de vraies commandes. Shopify reste actif en parallèle comme filet de sécurité.

**Checklist M2 :**
- [ ] nc-boutique répond à de vraies commandes (pas juste des tests)
- [ ] Agents traitent les commandes `order_source='nc_boutique'` dans le dashboard
- [ ] Zéro commande perdue depuis le lancement nc-boutique
- [ ] Logs `nc_events` propres, zéro erreur critique
- [ ] Performance : temps chargement catalogue < 2s

---

### PHASE M3 — Validation et Consolidation (2-3 semaines)
**Statut :** `PENDING` (attend M2)
**Objectif :** Valider que nc-boutique est robuste avant de couper Shopify.

**Checklist M3 :**
- [ ] Phase M2 stable depuis 2 semaines minimum
- [ ] Zéro bug critique ouvert dans TASKS.md
- [ ] Design boutique validé par le propriétaire (RTL, noir/rouge, drawer, formulaire)
- [ ] Tests Playwright passent à 100%
- [ ] Tracking Facebook opérationnel (si activé)
- [ ] Dashboard owner `/dashboard/owner/*` fonctionnel
- [ ] Plusieurs commandes ZR Express traitées avec succès depuis nc-boutique
- [ ] Redirections 301 Shopify → nc-boutique planifiées

---

### PHASE M4 — Coupure Shopify (1 journée)
**Statut :** `PENDING` (attend M3 + décision propriétaire)
**Objectif :** Éteindre Shopify définitivement.

**⚠️ CETTE PHASE EST IRRÉVERSIBLE — Validation propriétaire obligatoire**

**Checklist M4 :**
- [ ] **Décision explicite du propriétaire** documentée dans DECISIONS.md
- [ ] Toutes les images migrées (zéro image sur `cdn.shopify.com` dans nc-boutique)
- [ ] Webhooks Shopify désactivés (`SHOPIFY_WEBHOOK_SECRET` remplacé par null)
- [ ] Variables d'environnement Shopify retirées de Vercel dashboard
- [ ] Redirections 301 configurées sur le domaine Shopify (si possible)
- [ ] Onglet Chrome sur nc-boutique.vercel.app côté propriétaire
- [ ] Annulation abonnement Shopify planifiée

---

### PHASE M5 — Nettoyage Final (1 semaine)
**Statut :** `PENDING` (après M4)
**Objectif :** Supprimer toute trace Shopify du code.

**Checklist M5 :**
- [ ] Supprimer `SHOPIFY_ACCESS_TOKEN` et `SHOPIFY_WEBHOOK_SECRET` de vercel-quick
- [ ] Supprimer `/api/webhooks/shopify/route.js` ou le désactiver
- [ ] Commenter/supprimer les routes API liées à Shopify dans vercel-quick
- [ ] Supprimer les GAS files ou les archiver dans `gas/archive/`
- [ ] Mettre à jour `AGENTS.md` : supprimer toutes les références Shopify
- [ ] Mettre à jour `docs/dashboard/ARCHITECTURE.md`
- [ ] Commit final "Phase M5 terminée — Shopify retiré"

---

## DONNÉES À MIGRER (détail)

| Données | Source | Destination | Script |
|---|---|---|---|
| Prix barré (`compare_at_price`) | Shopify Products API | `nc_variants.compare_at_price` | `migrate-shopify.js --phase=products` |
| Collections par produit | Shopify Collects API | `nc_variants.collections[]` | `migrate-shopify.js --phase=collections` |
| Descriptions produits | Shopify Products API | `nc_variants.description` | `migrate-shopify.js --phase=products` |
| Images haute résolution | `cdn.shopify.com` | Supabase Storage (futur) | `migrate-shopify.js --phase=images` |
| Badge nouveauté | Manuel (AWAKHIR collection) | `nc_variants.is_new = true` | `migrate-shopify.js --phase=collections` |

---

## DONNÉES À NE PAS MIGRER

| Données | Pourquoi |
|---|---|
| Historique commandes Shopify | Trop complexe, archivé en CSV suffit |
| Comptes clients Shopify | Pas de comptes clients en Phase 1/2 |
| Anciennes URLs Shopify | Les redirections 301 gèrent ça |
| Métadonnées SEO Shopify | Recréées nativement dans Next.js |

---

## COMMANDES D'EXÉCUTION

```bash
# Phase M1 — Récupérer les données produits
node scripts/migrate-shopify.js --phase=products --dry-run
node scripts/migrate-shopify.js --phase=products

# Phase M1 — Récupérer les collections
node scripts/migrate-shopify.js --phase=collections --dry-run
node scripts/migrate-shopify.js --phase=collections

# Vérification post-migration
node scripts/health-check.js
```

---

## ROLLBACK

Si nc-boutique a un problème critique en Phase M2/M3, Shopify est encore actif.
Il suffit de rediriger le trafic vers Shopify le temps de corriger.

En Phase M4+, le rollback n'est plus possible. C'est pourquoi M3 doit être parfaitement validée.
