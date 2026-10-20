# Serveur MCP d'AI-nvoices

AI-nvoices expose un serveur [MCP (Model Context Protocol)](https://modelcontextprotocol.io). Un agent comme Claude peut ainsi gérer vos tâches, saisir du temps, piloter le timer et préparer vos factures.

- **Point d'accès :** `https://<votre-domaine>/api/mcp` (transport *Streamable HTTP*, sans état)
- **Authentification :** `Authorization: Bearer ainv_…`, avec un jeton personnel créé dans **Paramètres › Accès MCP**

## Connexion depuis Claude Code

1. Dans l'app, ouvrez **Paramètres › Accès MCP** et créez un jeton. Il n'est affiché qu'une fois.
2. Lancez la commande proposée :

```bash
claude mcp add --transport http ai-nvoices https://ai-nvoices.vercel.app/api/mcp \
  --header "Authorization: Bearer ainv_xxxxxxxx"
```

3. Vérifiez avec `claude mcp list`. Les outils apparaissent sous le préfixe `mcp__ai-nvoices__…`.

Un jeton se révoque à tout moment depuis la même page, et la révocation est immédiate.

## Sécurité

- Le jeton n'est jamais stocké en clair. La base n'en garde que l'empreinte SHA-256.
- Le serveur transmet le jeton à Supabase dans l'en-tête `x-ainv-token`. La fonction SQL `app_uid()` le vérifie, et **toutes les règles RLS s'appliquent comme pour une session de l'app**. Un jeton ne voit que les données de son propriétaire.
- Un jeton ne permet pas de gérer les jetons : la table `api_tokens` n'est accessible que depuis une vraie session.
- Aucune clé `service_role` n'est utilisée.

## Outils

| Domaine | Outils |
| --- | --- |
| Vue d'ensemble | `get_overview` |
| Clients | `list_clients`, `create_client`, `update_client` |
| Projets | `list_projects`, `create_project`, `update_project` |
| Tâches | `list_tasks`, `get_task`, `create_task`, `update_task`, `delete_task` |
| Timer | `timer_status`, `start_timer`, `pause_timer`, `resume_timer`, `stop_timer` |
| Temps | `list_time_entries`, `add_time_entry`, `update_time_entry`, `delete_time_entry` |
| Facturation | `list_unbilled`, `list_invoices`, `get_invoice`, `add_tasks_to_invoice`, `create_invoice_from_unbilled`, `add_unbilled_to_invoice`, `create_invoice`, `add_invoice_line`, `set_invoice_status` |

Les outils d'écriture acceptent souvent un nom à la place d'un identifiant, comme `project_name` ou `client_name`. Les réponses sont en JSON, avec les durées en heures décimales.

## Architecture

```
Claude ──HTTP + Bearer──▶ /api/mcp (src/app/api/mcp/route.ts)
                            │ token_whoami() : jeton valide ?
                            ▼
                   src/lib/mcp/server.ts (outils, schémas Zod)
                            ▼
                   src/lib/domain/* (même logique que l'app)
                            ▼
                   Supabase (RLS via app_uid())
```

Pour ajouter un outil, implémentez la logique dans `src/lib/domain/`, puis déclarez l'outil dans `src/lib/mcp/server.ts` avec `server.registerTool`.
