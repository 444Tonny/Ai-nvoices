# Préparation du serveur MCP

AI-nvoices est prêt à recevoir son propre serveur [MCP (Model Context Protocol)](https://modelcontextprotocol.io), qui permettra à un agent (Claude, etc.) de piloter le timer, consulter les heures et préparer des factures. **Le serveur n'est pas encore implémenté** : ce document décrit ce qui est en place et les étapes restantes.

## Ce qui est déjà en place

| Élément | Fichier | Rôle |
| --- | --- | --- |
| Couche domaine | `src/lib/domain/*.ts` | Toute la logique métier, sans dépendance à Next.js. Chaque fonction reçoit un client Supabase déjà authentifié. |
| Schémas d'entrée | `src/lib/domain/schemas.ts` | Contrats Zod partagés par les Server Actions et les futurs outils. |
| Catalogue d'opérations | `src/lib/domain/operations.ts` | Liste des opérations exposables : nom stable, description, schéma, indicateur lecture seule, handler. `runOperation(db, name, input)` valide puis exécute. |
| Client par jeton | `src/lib/supabase/token.ts` | Crée un client Supabase à partir d'un JWT utilisateur (en-tête `Authorization`), sans cookies. |
| Logique atomique en SQL | `supabase/migrations/*_functions.sql` | Timer, synchronisation des heures et statistiques en fonctions Postgres `security invoker` : mêmes garanties quel que soit l'appelant. |

La sécurité repose entièrement sur la RLS : un appel MCP authentifié avec le jeton d'un utilisateur ne peut lire ou modifier que ses propres données. Aucune clé `service_role` n'est nécessaire.

## Architecture cible

```
Agent MCP ──(Streamable HTTP + Bearer)──▶ /api/mcp (route Next.js)
                                             │ vérifie le jeton
                                             │ createClientWithAccessToken(jeton)
                                             ▼
                                   operations.ts ─▶ couche domaine ─▶ Supabase (RLS)
```

Deux transports possibles, au choix :

1. **Route HTTP dans l'app** (`src/app/api/mcp/route.ts`), transport *Streamable HTTP*. Recommandé : déployé avec l'app, aucune infra supplémentaire.
2. **Processus stdio local** (`mcp/server.ts`), pour un usage dans Claude Desktop / Claude Code. Il réutilise le même catalogue.

## Étapes restantes

1. Installer le SDK : `npm install @modelcontextprotocol/sdk`.
2. Choisir l'authentification :
   - **OAuth 2.1** via le serveur d'autorisation Supabase (recommandé, conforme à la spécification MCP), ou
   - **jetons d'accès personnels** : ajouter une table `api_tokens` (hash du jeton, `user_id`, `last_used_at`, `revoked_at`) avec RLS et une page de gestion dans « Profils émetteur » ou une page « Paramètres ».
3. Créer la route `/api/mcp` :
   - extraire le jeton `Authorization: Bearer …` et le valider (`supabase.auth.getUser(jeton)`) ;
   - construire le client avec `createClientWithAccessToken` ;
   - enregistrer chaque entrée de `operations` comme outil (`server.registerTool(op.name, { description, inputSchema, annotations: { readOnlyHint: op.readOnly } }, handler)`), le handler appelant `runOperation`.
4. Exclure `/api/mcp` de la redirection vers `/login` dans `src/lib/supabase/middleware.ts` (la route gère elle-même son authentification et répond 401).
5. Ajouter éventuellement des **ressources** MCP (ex. `invoice://{id}/pdf` en réutilisant `src/lib/pdf/invoice-pdf.tsx`) et des **prompts** (« prépare la facture du mois pour le client X »).
6. Tester avec l'inspecteur MCP : `npx @modelcontextprotocol/inspector`.

## Conventions à respecter

- Toute nouvelle fonctionnalité métier s'ajoute d'abord dans `src/lib/domain/`, puis est exposée via une Server Action **et** une entrée de `operations.ts`.
- Les noms d'opérations sont stables (snake_case) : les renommer casse les agents qui les utilisent.
- Les opérations destructrices (`delete_*`, `set_invoice_status`) gardent `readOnly: false` pour que les clients MCP demandent confirmation.
- Les durées sont exprimées en secondes et les dates en ISO 8601, comme dans la base.
