# AI-nvoices

Time tracker pour freelances avec facturation PDF, inspiré de Clockify.
Portage web d'une application de bureau existante, interface entièrement en français.

**Stack** : Next.js 15 (App Router, Server Components, Server Actions) · TypeScript · Supabase (Postgres, Auth, RLS, Storage) · Tailwind CSS v4 · `@react-pdf/renderer`.

## Fonctionnalités

- **Timer persistant en base** : un seul timer actif par utilisateur, pause / reprise / stop / switch, qui survit au rechargement, aux onglets et aux appareils. Widget toujours visible, palette de tâches récentes (Ctrl/⌘ + K), mini-timer flottant (Document Picture-in-Picture, sinon popup).
- **Dashboard** : heures du jour, de la semaine (lundi-dimanche) et du mois, graphiques par client et par projet.
- **Calendrier** mensuel avec total par jour, détail et saisie des entrées d'un jour.
- **Clients, projets, tâches** : tables CRUD, sélection multiple, suppression groupée, pages détail.
- **Facturation** : création manuelle, génération depuis une période, ajout groupé de tâches, synchronisation des heures pour les factures non payées, regroupement par projet, export PDF, profils émetteur avec logo.
- **Prêt pour un serveur MCP** : voir [docs/MCP.md](docs/MCP.md).

## Déploiement

L'app est prête pour **Vercel + Supabase**. Le pas-à-pas complet est dans [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) : projet Supabase, migrations, variables Vercel, URLs d'authentification et emails en production.

## Prérequis

- Node.js 20 ou plus récent
- Un projet [Supabase](https://supabase.com) (gratuit) et la [CLI Supabase](https://supabase.com/docs/guides/cli)

## Installation

### 1. Dépendances

```bash
npm install
```

### 2. Variables d'environnement

Copiez le modèle puis renseignez les valeurs (Supabase : *Project Settings › API*) :

```bash
cp .env.example .env.local
```

| Variable | Usage |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique `anon` (ou `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` avec une clé `sb_publishable_…`) |
| `NEXT_PUBLIC_SITE_URL` | URL publique de l'app, utilisée pour les liens magiques (`http://localhost:3000` en local) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Seed uniquement.** Ne jamais l'exposer côté client ni la déployer avec l'app |
| `SEED_USER_EMAIL`, `SEED_USER_PASSWORD` | Identifiants du compte de démonstration créé par le seed |

### 3. Base de données

Liez le dossier au projet distant puis appliquez les migrations de `supabase/migrations/` :

```bash
npx supabase login
npx supabase link --project-ref <votre-project-ref>
npm run db:push
```

Les migrations créent les tables, les policies RLS, les index, les vues de totaux, les fonctions du timer et des statistiques, le trigger du profil émetteur par défaut et le bucket de stockage `logos`.

### 4. Authentification

Dans le tableau de bord Supabase, *Authentication › URL Configuration* :

- **Site URL** : `http://localhost:3000` (puis l'URL de production)
- **Redirect URLs** : ajoutez `http://localhost:3000/auth/callback` (et l'équivalent en production)

Les connexions par email / mot de passe et par magic link sont activées par défaut.

### 5. Données de démonstration (facultatif)

```bash
npm run seed
```

Crée un compte confirmé (`demo@ai-nvoices.local` / `demo1234` par défaut) avec trois clients, cinq projets, onze tâches, six semaines d'entrées de temps et deux factures. Relancer la commande réinitialise les données de ce compte uniquement.

### 6. Lancement

```bash
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000).

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` puis `npm start` | Build et serveur de production |
| `npm run typecheck` | Vérification TypeScript |
| `npm run db:push` | Applique les migrations au projet Supabase lié |
| `npm run seed` | Données de démonstration |

## Structure

```
supabase/
  migrations/            Schéma SQL versionné (tables, RLS, fonctions, stockage)
scripts/seed.mjs         Seed de démonstration
docs/MCP.md              Préparation du futur serveur MCP
src/
  middleware.ts          Rafraîchissement de session et protection des routes
  app/
    login/               Connexion, inscription, magic link
    auth/callback/       Retour du magic link
    (app)/               Pages authentifiées (layout avec sidebar et widget timer)
      page.tsx           Dashboard
      calendar/          Calendrier
      clients/ projects/ tasks/   Tables et pages détail [id]
      invoices/          Factures
      settings/          Profils émetteur
    mini-timer/          Popup du mode compact (repli sans Picture-in-Picture)
    api/invoices/[id]/pdf/   Génération du PDF
  actions/               Server Actions (validation Zod puis couche domaine)
  components/            Composants UI (timer, tables, modales…)
  lib/
    domain/              Logique métier indépendante de Next.js + catalogue d'opérations
    pdf/                 Document PDF de facture
    supabase/            Clients Supabase (serveur, navigateur, jeton)
    currency.ts, numbers.ts, format.ts, tz-utils.ts   Utilitaires
```

## Choix techniques

- **Isolation des données** : RLS `user_id = auth.uid()` sur toutes les tables, et clés étrangères composites `(id, user_id)` pour qu'aucune ligne ne puisse référencer les données d'un autre utilisateur.
- **Timer atomique** : `timer_start`, `timer_pause`, `timer_resume`, `timer_stop` et `timer_status` sont des fonctions Postgres. Un index unique partiel garantit une seule entrée en cours par utilisateur.
- **Temps total d'une tâche** : vue `task_totals` (l'entrée en cours compte jusqu'à maintenant).
- **Fuseaux horaires** : le navigateur transmet son fuseau IANA via un cookie. Les statistiques sont calculées en SQL dans ce fuseau, et l'affichage utilise des calculs isomorphes (`src/lib/tz-utils.ts`) pour éviter les écarts d'hydratation.
- **Saisie numérique** : la virgule est acceptée comme séparateur décimal partout (`parseDecimal`).
- **Synchronisation des heures** : à l'affichage ou à l'export d'une facture `unpaid`, les lignes liées à une tâche reprennent le temps total de la tâche, arrondi à 2 décimales. Les factures `sent` et `paid` sont figées.
  - Les lignes générées depuis une période ne sont pas synchronisées, pour conserver les heures de la période.
  - Une ligne dont vous modifiez les heures à l'ajout n'est plus synchronisée. Le comportement se règle ligne par ligne dans la modale d'édition.
