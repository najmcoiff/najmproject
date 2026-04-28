# NajmCoiff

> Grossiste **coiffure + onglerie** en Algérie. Site client + dashboard agents + agents marketing IA.
> Propriétaire : NajmCoiff — Phase M5 (Marketing IA active).

---

## 🌐 Les 2 produits

| Système | URL | À quoi ça sert |
|---|---|---|
| 🏪 **Boutique client** | https://nc-boutique.vercel.app | Site public où les clients passent commande (paiement à la livraison) |
| 📊 **Dashboard agents** | https://najmcoiffdashboard.vercel.app | Interface interne pour les agents (commandes, stock, POS, marketing) |

Les deux partagent la même base **Supabase** (tables `nc_*`).

---

## 🛠️ Stack technique

- **Next.js 16** + React 19 + Tailwind v4
- **Supabase** (PostgreSQL + RLS + Storage)
- **Vercel** (hébergement, projets séparés)
- **Playwright** (tests e2e mobile + desktop)
- **ZR Express** (livraison nationale Algérie)
- **Meta Ads + WhatsApp WATI** (marketing automatisé via agents IA)

---

## 📁 Organisation du repo

```
boutique/   ← site client public (Next.js)
dashboard/  ← interface agents (Next.js)
docs/       ← documentation technique
archive/    ← obsolète (gas, anciens MD, historique)
secrets/    ← creds et tokens (GITIGNORED — jamais sur Git)
scripts/    ← automatisations (notify, health-check, migrations)
```

---

## 🚀 Liens utiles

- **Production** : [boutique](https://nc-boutique.vercel.app) · [dashboard](https://najmcoiffdashboard.vercel.app) · [War Room marketing](https://najmcoiffdashboard.vercel.app/dashboard/owner/marketing)
- **Hébergement** : [Vercel](https://vercel.com/najm-webs-projects) (projets `nc-boutique` + `vercel-quick`)
- **Base de données** : [Supabase](https://app.supabase.com/project/alyxejkdtkdmluvgfnqk)
- **GitHub** : [najmcoiff/najmproject](https://github.com/najmcoiff/najmproject)

---

## 🤖 Travailler avec l'IA (Claude Code dans Cursor)

1. Ouvre Cursor + un terminal
2. Tape :
   ```
   continue
   ```
3. L'IA lit `JOURNAL.md` (état du projet) + `TACHES.md` (à faire) et enchaîne tout seule.
4. Tu reçois une **notification vocale** quand elle a terminé une tâche.

L'IA a une **autorisation permanente** de :
- modifier le code, déployer, tester, requêter la base
- créer/supprimer fichiers du repo
- appeler les APIs Meta, WATI, Supabase, Vercel

Elle ne te dérange que pour les actions **irréversibles avec impact client** (envoi mass-WhatsApp, suppression prod, dépense pub).

---

## 📘 Documentation

| Pour... | Lire |
|---|---|
| Suivre l'état du projet (humain) | **`JOURNAL.md`** |
| Tâches actives | `TACHES.md` |
| Règles techniques (HARD + SOFT) | `docs/regles.md` |
| Lexique métier + tech | `docs/glossaire.md` |
| Décisions historiques | `docs/decisions.md` |
| Plan boutique | `docs/boutique/PLAN.md` |
| Plan dashboard | `docs/dashboard/ARCHITECTURE.md` |
| Marketing IA | `docs/marketing/` |
| Pour l'IA (technique) | `AGENTS.md` |

---

## 📞 Contact

Owner : NajmCoiff (Algérie)
GitHub : [@najmcoiff](https://github.com/najmcoiff)
