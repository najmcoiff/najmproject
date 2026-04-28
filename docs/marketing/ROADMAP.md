# ROADMAP.md — Planning d'exécution semaine par semaine
> version: 1.0 | updated: 2026-04-14
> Planning sur 6 semaines avec jalons et critères de succès.
> Référence : `docs/marketing/STRATEGY.md` pour les objectifs.

---

## Vue d'ensemble

```
Semaine 1  ████████░░  Documentation + Pixels + CAPI + Agent 6
Semaine 2  ████████░░  Agent 1 (Catalog) + Agent 3 début (WATI)
Semaine 3  ████████░░  Agent 2 (Campaigns) + Agent 3 complet
Semaine 4  ████████░░  Agent 4 (Content) + Agent 5 début (Stock)
Semaine 5  ████████░░  Agent 5 complet + Optimisation globale
Semaine 6  ████████░░  Tests finaux + Passage en autonome
```

---

## Semaine 1 : Fondations (14-20 avril 2026)

### Objectifs
- Documentation marketing complète
- Pixels Facebook configurés (T14)
- CAPI server-side implémenté (T21)
- Agent 6 Analytics Commander (dashboard + rapport quotidien)

### Tâches

| ID | Tâche | Priorité | Statut |
|---|---|---|---|
| S1.1 | Créer `docs/marketing/STRATEGY.md` | haute | DONE |
| S1.2 | Créer `docs/marketing/AGENTS.md` | haute | DONE |
| S1.3 | Créer `docs/marketing/WATI_INTEGRATION.md` | haute | DONE |
| S1.4 | Créer `docs/marketing/META_ADS.md` | haute | DONE |
| S1.5 | Créer `docs/marketing/AI_PROMPTS.md` | haute | DONE |
| S1.6 | Créer `docs/marketing/SCHEMA.md` | haute | DONE |
| S1.7 | Créer `docs/marketing/ROADMAP.md` | haute | DONE |
| S1.8 | Exécuter DDL `nc_ai_*` tables dans Supabase | haute | TODO |
| S1.9 | Implémenter T14 — deux pixels Facebook (client-side) | haute | TODO |
| S1.10 | Implémenter T21 — CAPI server-side dans track-event | haute | TODO |
| S1.11 | Créer `lib/ai-helpers.js` — fonctions partagées agents | haute | TODO |
| S1.12 | Implémenter Agent 6 — `GET /api/ai/dashboard` | haute | TODO |
| S1.13 | Implémenter Agent 6 — `POST /api/ai/daily-report` | haute | TODO |
| S1.14 | Créer page `/dashboard/owner/ai` | haute | TODO |
| S1.15 | Configurer crons dans `vercel.json` | haute | TODO |

### Prérequis owner
- [ ] Fournir les 2 Pixel IDs Facebook (coiffure + onglerie)
- [ ] Clé API OpenAI ou Anthropic

### Critères de succès Semaine 1
- [ ] Les 7 fichiers doc sont créés et cohérents
- [ ] Les 13 tables `nc_ai_*` existent dans Supabase
- [ ] Le pixel coiffure ET onglerie envoient des événements PageView
- [ ] CAPI envoie les événements serveur (vérifiable dans Events Manager)
- [ ] La page `/dashboard/owner/ai` affiche les KPIs de base
- [ ] Le rapport quotidien WhatsApp est envoyé à 8h
- [ ] `npx playwright test` = 0 échec

---

## Semaine 2 : Intelligence Catalogue + WATI (21-27 avril 2026)

### Objectifs
- Agent 1 Catalog Intelligence opérationnel
- Intégration WATI API base
- Début de la segmentation clients

### Tâches

| ID | Tâche | Priorité | Statut |
|---|---|---|---|
| S2.1 | Créer `lib/wati.js` — client WATI API | haute | TODO |
| S2.2 | Implémenter Agent 1 — `POST /api/ai/catalog-intelligence` | haute | TODO |
| S2.3 | Scoring des 1000+ produits (premier run) | haute | TODO |
| S2.4 | Implémenter détection bundles (produits achetés ensemble) | moyenne | TODO |
| S2.5 | Implémenter segmentation clients (cron quotidien) | haute | TODO |
| S2.6 | Sync étiquettes WATI depuis Supabase | haute | TODO |
| S2.7 | Tests Playwright Agent 1 | haute | TODO |
| S2.8 | Review manuelle des premiers scores | moyenne | TODO |

### Prérequis owner
- [ ] Fournir le token API WATI et l'endpoint

### Critères de succès Semaine 2
- [ ] `nc_ai_product_scores` contient un score pour chaque variant actif
- [ ] `nc_ai_recommendations` contient au moins 10 recommandations pertinentes
- [ ] `nc_ai_client_segments` contient la segmentation de tous les clients
- [ ] Les étiquettes WATI sont synchronisées (vip, dormant, etc.)
- [ ] Le dashboard IA affiche les top/flop produits

---

## Semaine 3 : Campagnes Meta + WhatsApp complet (28 avril - 4 mai 2026)

### Objectifs
- Agent 2 Campaign Engine opérationnel
- Agent 3 WhatsApp automation complète
- Premières campagnes Meta lancées

### Tâches

| ID | Tâche | Priorité | Statut |
|---|---|---|---|
| S3.1 | Créer `lib/meta-ads.js` — client Meta Marketing API | haute | TODO |
| S3.2 | Implémenter Agent 2 — création de campagnes automatiques | haute | TODO |
| S3.3 | Implémenter Agent 2 — optimisation quotidienne | haute | TODO |
| S3.4 | Créer les audiences (visiteurs, acheteurs, lookalike) | haute | TODO |
| S3.5 | Lancer première campagne retargeting (coiffure) | haute | TODO |
| S3.6 | Templates WhatsApp — soumettre à Meta pour approbation | haute | TODO |
| S3.7 | Implémenter flux abandon panier WhatsApp | haute | TODO |
| S3.8 | Implémenter flux relance dormants WhatsApp | haute | TODO |
| S3.9 | Implémenter flux post-commande/post-livraison | moyenne | TODO |
| S3.10 | Tests Playwright Agents 2 et 3 | haute | TODO |

### Prérequis owner
- [ ] Meta Marketing API token (System User)
- [ ] Ad Account ID
- [ ] Budget ads initial déposé (15-20K DA)
- [ ] Templates WhatsApp approuvés par Meta

### Critères de succès Semaine 3
- [ ] Au moins 2 campagnes Meta actives (retargeting + best-sellers)
- [ ] ROAS > 3x après 3 jours
- [ ] Au moins 10 messages WhatsApp de relance envoyés
- [ ] Taux ouverture WhatsApp > 70%
- [ ] Le flux abandon panier fonctionne (test E2E)

---

## Semaine 4 : Contenu IA + Début Stock (5-11 mai 2026)

### Objectifs
- Agent 4 Content Generator opérationnel
- Descriptions produits générées (batch)
- Agent 5 début des prévisions stock

### Tâches

| ID | Tâche | Priorité | Statut |
|---|---|---|---|
| S4.1 | Implémenter Agent 4 — `POST /api/ai/generate-content` | haute | TODO |
| S4.2 | Implémenter Agent 4 — `GET /api/ai/content-queue` | haute | TODO |
| S4.3 | Page dashboard review contenu | moyenne | TODO |
| S4.4 | Batch descriptions produits (1000+ variants) | haute | TODO |
| S4.5 | Générer 30 posts sociaux (semaine de contenu) | haute | TODO |
| S4.6 | Générer ad copy pour campagnes actives | haute | TODO |
| S4.7 | Implémenter Agent 5 — `POST /api/ai/stock-forecast` | haute | TODO |
| S4.8 | Premier run prédiction de demande | haute | TODO |
| S4.9 | Tests Playwright Agents 4 et 5 | haute | TODO |

### Critères de succès Semaine 4
- [ ] 500+ descriptions produits générées et appliquées
- [ ] 30 posts sociaux dans la queue, prêts à publier
- [ ] `nc_ai_demand_forecast` contient des prévisions pour les top 100 produits
- [ ] Alertes stock critiques affichées dans le dashboard

---

## Semaine 5 : Optimisation globale (12-18 mai 2026)

### Objectifs
- Agent 5 Stock Optimizer complet
- Optimisation de tous les agents
- Fine-tuning des modèles et seuils

### Tâches

| ID | Tâche | Priorité | Statut |
|---|---|---|---|
| S5.1 | Agent 5 — détection stock mort + alertes | haute | TODO |
| S5.2 | Agent 5 — saisonnalité et scoring fournisseur | moyenne | TODO |
| S5.3 | Optimiser les seuils Agent 1 (scoring) | haute | TODO |
| S5.4 | Optimiser les campagnes Meta (A/B tests) | haute | TODO |
| S5.5 | Analyser les résultats WhatsApp et ajuster | haute | TODO |
| S5.6 | Score santé business complet | haute | TODO |
| S5.7 | Interconnexion agents (Agent 6 → décisions automatiques) | haute | TODO |
| S5.8 | Documentation des résultats et leçons | moyenne | TODO |

### Critères de succès Semaine 5
- [ ] Score santé business > 70/100
- [ ] CA semaine 5 > CA semaine 1
- [ ] Au moins 3 décisions automatiques exécutées par Agent 6
- [ ] Tous les agents tournent sans erreur depuis 48h+

---

## Semaine 6 : Autonomie totale (19-25 mai 2026)

### Objectifs
- Machine en mode autonome complet
- Documentation finale
- Transition vers maintenance

### Tâches

| ID | Tâche | Priorité | Statut |
|---|---|---|---|
| S6.1 | Test de fonctionnement autonome 72h (0 intervention) | haute | TODO |
| S6.2 | Vérification que tous les crons s'exécutent | haute | TODO |
| S6.3 | Rapport de lancement avec métriques | haute | TODO |
| S6.4 | Former le owner sur le dashboard IA | haute | TODO |
| S6.5 | Mettre à jour TASKS.md, CHANGELOG.md, CONTEXT.md | haute | TODO |
| S6.6 | Plan de maintenance mensuelle | moyenne | TODO |

### Critères de succès Semaine 6
- [ ] 72h de fonctionnement autonome sans intervention
- [ ] CA mois 1 ≥ 1M DA
- [ ] Tous les tests Playwright passent
- [ ] Le owner comprend le dashboard IA
- [ ] Documentation complète et à jour

---

## Métriques de suivi hebdomadaire

À chaque fin de semaine, vérifier :

| Métrique | S1 | S2 | S3 | S4 | S5 | S6 |
|---|---|---|---|---|---|---|
| CA hebdo (DA) | - | - | - | - | - | - |
| Commandes | - | - | - | - | - | - |
| Messages WA envoyés | 0 | 0 | - | - | - | - |
| Campagnes Meta actives | 0 | 0 | - | - | - | - |
| Contenu publié | 0 | 0 | 0 | - | - | - |
| Score santé | - | - | - | - | - | - |
| Tests échoués | 0 | 0 | 0 | 0 | 0 | 0 |

---

## Dépendances critiques

```
S1.9 (pixels) ──→ S3.2 (campagnes)
S1.10 (CAPI) ──→ S3.2 (campagnes)
S2.1 (WATI lib) ──→ S3.7-S3.9 (flux WA)
S2.2 (Agent 1) ──→ S3.2 (Agent 2 utilise les scores)
S2.5 (segments) ──→ S3.8 (relance dormants)
S3.6 (templates approuvés) ──→ S3.7-S3.9 (envoi messages)
S4.1 (Agent 4) ──→ S3.2 (ad copy pour campagnes)
```

**Chemin critique** : Pixels → CAPI → Audiences → Campagnes
**Bloquant principal** : Approbation templates WhatsApp par Meta (24-48h)
