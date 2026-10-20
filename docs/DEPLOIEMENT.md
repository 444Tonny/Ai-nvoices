# Déployer AI-nvoices sur Vercel + Supabase

Comptez une vingtaine de minutes. Les deux services ont une offre gratuite suffisante pour un usage personnel.

## 1. Créer le projet Supabase

1. Sur [supabase.com](https://supabase.com), créez un projet. Notez le **mot de passe de la base** : il sert à appliquer les migrations.
2. Choisissez une **région proche de vos utilisateurs**, par exemple *West EU (Paris)*. La région Vercel doit être la même (étape 4).

## 2. Appliquer le schéma

Depuis le dossier du projet :

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npm run db:push
```

Le `project-ref` est l'identifiant du projet, visible dans l'URL du tableau de bord et dans *Project Settings › General*.

La commande crée les tables, la sécurité par ligne (RLS), les fonctions du timer et des statistiques, le profil émetteur par défaut et le bucket de logos.

> **Automatiser les prochaines migrations (facultatif).** Le workflow GitHub `.github/workflows/supabase-migrations.yml` applique les migrations à chaque push sur `main` qui modifie `supabase/migrations/`. Il lui faut trois secrets de dépôt : `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` et `SUPABASE_DB_PASSWORD`.

## 3. Mettre le code sur GitHub

```bash
git remote add origin https://github.com/<vous>/ai-nvoices.git
git push -u origin main
```

## 4. Créer le projet Vercel

1. Sur [vercel.com/new](https://vercel.com/new), importez le dépôt. Le framework Next.js est détecté tout seul.
2. **Région des fonctions** : `vercel.json` fixe `cdg1` (Paris). Si votre projet Supabase est ailleurs, remplacez-la par la région Vercel la plus proche, par exemple `fra1` pour Francfort ou `iad1` pour l'est des États-Unis. Chaque page fait plusieurs requêtes à la base : une région éloignée ralentit nettement l'app.
3. **Variables d'environnement**, au choix :
   - **Intégration Supabase** (le plus simple) : *Vercel › Integrations › Supabase*, puis liez le projet. Les variables `NEXT_PUBLIC_SUPABASE_URL` et la clé publique sont posées automatiquement.
   - **Manuellement**, dans *Project Settings › Environment Variables* :

| Variable | Environnements | Valeur |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development | *Supabase › Project Settings › API › Project URL* |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Development | Clé `anon` (ou `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` avec la clé `sb_publishable_…`) |
| `NEXT_PUBLIC_SITE_URL` | Production uniquement, facultatif | `https://votre-domaine.fr`. Sans elle, le domaine de production Vercel est utilisé. |

N'ajoutez **jamais** `SUPABASE_SERVICE_ROLE_KEY` à Vercel. L'app n'en a pas besoin : elle sert uniquement au seed lancé depuis votre machine.

4. Cliquez sur **Deploy**.

## 5. Configurer l'authentification Supabase

Dans *Supabase › Authentication › URL Configuration* :

- **Site URL** : l'URL de production, par exemple `https://ai-nvoices.vercel.app` ou votre domaine.
- **Redirect URLs** : ajoutez
  - `https://<url-de-production>/auth/callback`
  - `https://*-<votre-equipe-vercel>.vercel.app/auth/callback` pour les déploiements de prévisualisation
  - `http://localhost:3000/auth/callback` pour le développement local

Sans ces URLs, les liens magiques et les confirmations d'email renvoient vers la mauvaise adresse.

### Emails en production

Le service d'email intégré de Supabase est fortement limité : quelques messages par heure, et seulement vers les adresses des membres de l'équipe Supabase. Pour que d'autres personnes puissent s'inscrire ou recevoir un magic link, configurez un SMTP dans *Authentication › Emails › SMTP Settings*, par exemple avec Resend, Brevo ou Postmark.

Pour un usage strictement personnel, vous pouvez à la place créer votre compte depuis *Authentication › Users › Add user*, avec l'option de confirmation automatique, puis vous connecter par mot de passe.

## 6. Données de démonstration (facultatif)

Depuis votre machine, avec `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local` :

```bash
npm run seed
```

## 7. Domaine personnalisé (facultatif)

1. Ajoutez le domaine dans *Vercel › Project Settings › Domains*.
2. Mettez à jour `NEXT_PUBLIC_SITE_URL`, puis la **Site URL** et les **Redirect URLs** de Supabase.
3. Redéployez pour prendre en compte la variable.

## Points techniques déjà réglés

- **PDF** : la route `/api/invoices/[id]/pdf` tourne sur le runtime Node.js, avec un délai maximal de 30 s. Les polices standard de pdfkit, chargées dynamiquement, sont embarquées explicitement via `outputFileTracingIncludes` dans `next.config.ts`.
- **Sessions** : le middleware rafraîchit la session Supabase à chaque requête et protège toutes les pages, sauf `/login` et `/auth`.
- **Liens par email** : sur un déploiement de prévisualisation, les liens pointent vers l'URL de ce déploiement. En production, ils pointent vers `NEXT_PUBLIC_SITE_URL` ou le domaine de production.
- **Sécurité** : en-têtes `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` et `Permissions-Policy` sur toutes les réponses. Toutes les données passent par la RLS, sans clé `service_role` côté serveur.

## Dépannage

| Symptôme | Cause probable |
| --- | --- |
| Erreur 500 avec « Variable manquante : NEXT_PUBLIC_SUPABASE_URL » | Variables absentes de l'environnement Vercel concerné. Ajoutez-les puis redéployez. |
| Le magic link ramène sur `/login?error=lien` | URL de callback absente des Redirect URLs Supabase, ou lien déjà utilisé ou expiré. |
| « relation "public.clients" does not exist » | Migrations non appliquées : relancez `npm run db:push`. |
| Le logo n'apparaît pas sur le PDF | Seuls le PNG et le JPEG de 2 Mo maximum sont pris en charge. Vérifiez que la migration de stockage a créé le bucket `logos`. |
| Pages lentes | Régions Vercel et Supabase éloignées : alignez `regions` dans `vercel.json`. |
