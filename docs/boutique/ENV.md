# ENV.md — Variables d'environnement
> version: 1.0 | updated: 2026-04-11
> ⚠️ Ne jamais committer les valeurs réelles. Ce fichier documente les noms uniquement.
> Valeurs réelles : `docs/CONTROLE_TOTALE.md` (lecture uniquement en local)

---

## nc-boutique (projet Vercel séparé)

| Variable | Où | Obligatoire | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + `.env.local` | ✅ | URL Supabase (format `https://xxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + `.env.local` | ✅ | Clé anon JWT (`eyJ...`) — **pas** la clé `sb_publishable_` |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel uniquement | ✅ | Clé service role — jamais côté client |
| `BOUTIQUE_SECRET` | Vercel + `.env.local` | ✅ | Token inter-services boutique (générer avec `openssl rand -hex 32`) |
| `ZR_API_KEY` | Vercel + `.env.local` | ✅ | Clé API ZR Express (livraison) |
| `ZR_TENANT_ID` | Vercel + `.env.local` | 🟡 | ID tenant ZR Express |
| `FB_PIXEL_COIFFURE` | Vercel + `.env.local` | 🟡 Phase E | ID pixel Facebook Coiffure |
| `FB_PIXEL_ONGLERIE` | Vercel + `.env.local` | 🟡 Phase E | ID pixel Facebook Onglerie |
| `FB_ACCESS_TOKEN_COIFFURE` | Vercel | 🟡 Phase E | Token CAPI Facebook Coiffure |
| `FB_ACCESS_TOKEN_ONGLERIE` | Vercel | 🟡 Phase E | Token CAPI Facebook Onglerie |

---

## vercel-quick (dashboard agents)

| Variable | Obligatoire | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Même valeur que nc-boutique |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Même valeur que nc-boutique |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Même valeur que nc-boutique |
| `SHOPIFY_ACCESS_TOKEN` | ✅ (Phase M1-M3) | Supprimé en Phase M4 |
| `SHOPIFY_WEBHOOK_SECRET` | ✅ (Phase M1-M3) | Supprimé en Phase M4 |
| `ZR_API_KEY` | ✅ | Même valeur |
| `ZR_TENANT_ID` | ✅ | Même valeur |
| `DASHBOARD_SECRET` | ✅ | Token agents |
| `VAPID_PUBLIC_KEY` | ✅ | Push notifications |
| `VAPID_PRIVATE_KEY` | ✅ | Push notifications |

---

## .env.local (nc-boutique — exemple non commit)

```env
# Copier vers nc-boutique/.env.local
# Ne jamais committer ce fichier

NEXT_PUBLIC_SUPABASE_URL=https://alyxejkdtkdmluvgfnqk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
BOUTIQUE_SECRET=...
ZR_API_KEY=...
ZR_TENANT_ID=...
```

---

## Comment configurer les variables Vercel

```bash
# Dans nc-boutique/
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add BOUTIQUE_SECRET production
npx vercel env add ZR_API_KEY production
```

---

## Règles de sécurité

1. `NEXT_PUBLIC_*` = exposé au navigateur — ne jamais mettre de clé secrète
2. `SERVICE_ROLE_KEY` = jamais dans un fichier `NEXT_PUBLIC_*`
3. `BOUTIQUE_SECRET` = clé rotatable — si compromis, générer une nouvelle et redéployer
4. Toujours utiliser `process.env` côté serveur, jamais `window.ENV`
5. Les clés Supabase dans `.env.local` = format JWT uniquement (voir `TROUBLESHOOT.md`)
