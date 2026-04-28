# START — Guide pour démarrer une session de travail
> Tu n'as pas besoin de savoir coder pour suivre ce guide.
> Lis uniquement ce fichier avant chaque session.

---

## AVANT DE COMMENCER (30 secondes)

### Étape 1 — Ouvrir le terminal dans Cursor
Dans Cursor : menu **Terminal** → **New Terminal**

### Étape 2 — Lancer le script de démarrage
```powershell
.\scripts\session-start.ps1
```
Ce script te dira exactement ce que l'IA doit faire aujourd'hui.

### Étape 3 — Copier le prompt fixe
Ouvre le fichier `PROMPT.md`, copie le texte entre les trois backticks \`\`\`.

### Étape 4 — Coller dans Cursor Chat
Colle le prompt dans la fenêtre de chat Cursor et envoie.

### Étape 5 — Attendre la notification
L'IA travaille. Quand elle a fini tu entendras un son + une bulle Windows apparaît.
Tu reviens au PC, tu lis la réponse, tu cliques "Accept" si elle demande d'accepter les changements.

### Étape 6 — Répéter
Si l'IA te dit "prochaine tâche : X" → tu réponds juste **"vas-y"**.

---

## QUAND ACCEPTER / REFUSER LES CHANGEMENTS

| L'IA dit... | Tu fais... |
|---|---|
| "j'ai créé / modifié [fichier]" | Clique **Accept** |
| "voulez-vous que je..." | Réponds **"oui"** ou **"non"** |
| "erreur / bug trouvé" | Réponds **"corrige"** |
| Elle te pose une question | Réponds simplement |
| Elle attend depuis longtemps | Écris **"continue"** |

---

## COMMENT SAVOIR OÙ ON EN EST

```powershell
.\scripts\session-start.ps1
```
Ce script affiche :
- Les tâches en cours
- Les tâches bloquées (attente info de ta part)
- La prochaine action recommandée

---

## SI QUELQUE CHOSE SE PASSE MAL

Ne panique pas. Écris dans le chat :
> "quelque chose ne marche pas, dis-moi quoi faire"

L'IA consultera `docs/boutique/TROUBLESHOOT.md` et te guidera.

---

## QUAND SOMMES-NOUS À 100% PRÊTS AU LANCEMENT ?

L'IA te dira **"PRÊT POUR LANCEMENT"** quand :
- [ ] Toutes les tâches 🔴 CRITIQUE dans TASKS.md sont `DONE`
- [ ] `node scripts/health-check.js` retourne 100% vert
- [ ] `npx playwright test` retourne 0 échec
- [ ] Le design a été validé visuellement par toi
- [ ] Une commande test de bout en bout a réussi

Tant que tu n'as pas vu ces 5 points validés, le site n'est pas prêt.

---

## GLOSSAIRE EXPRESS (si tu vois ces mots)

| Mot | Ce que ça veut dire |
|---|---|
| **Déployer** | Mettre en ligne la dernière version |
| **Migrer** | Déplacer des données d'un endroit à un autre |
| **Route API** | Une adresse web que le site utilise en coulisses |
| **Supabase** | La base de données (comme un Excel géant en ligne) |
| **Vercel** | Le serveur qui héberge le site |
| **Commit** | Sauvegarder une version du code dans l'historique |
| **Build** | Compiler le code pour le mettre en ligne |
| **Bug** | Erreur dans le code |
