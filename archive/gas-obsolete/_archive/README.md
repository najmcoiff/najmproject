# GAS _archive — Phase M4 (2026-04-14)

Ces fichiers Google Apps Script ont été archivés lors de la fermeture Shopify (Phase M4).

## Raison de l'archivage

Toutes les actions GAS ont été migrées vers des routes Vercel natives :

| Fichier GAS | Remplacé par |
|---|---|
| `🌎INJECTER BON DE COMMANDE.js` | `/api/po/inject` (T203) |
| `🌎MODIFIER LES ARTICLES D'UNE COMMANDE SHOPIFY.js` | `/api/orders/modify-items` (T202) |
| `🌐DASHBOARD API.js` | Routes Vercel natives |
| `📊 EVENTS & STOCK.js` | Supabase direct |
| `🔧 ADMIN & HELPERS.js` | Inutilisé |
| `🛟Dopost centrale webhook.js` | `/api/webhooks/shopify` → 410 (T205) |

## Ne pas supprimer

Ces fichiers sont conservés à titre de référence historique.
Le déploiement `.clasp.json` a été retiré du projet actif.
