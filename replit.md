# DreamTeam Misaki

Site privé de compétition hebdomadaire : connexion Discord, équipes de capitaines, classement vocal et administration réservée aux Admin+.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API Discord, bot vocal et endpoints (port fourni par le workflow)
- `pnpm --filter @workspace/dreamteam-misaki run dev` — interface React
- `pnpm run typecheck` — vérification TypeScript complète
- `pnpm --filter @workspace/api-spec run codegen` — régénère les hooks React et schémas Zod depuis OpenAPI
- `pnpm --filter @workspace/db run push` — applique le schéma PostgreSQL de développement
- Configuration nécessaire : `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` (secret), `DISCORD_GUILD_ID`, `DISCORD_BOT_TOKEN` (secret), `DISCORD_VOICE_CHANNEL_IDS`, `ADMIN_DISCORD_IDS`. `DISCORD_REDIRECT_URI` est optionnel en développement et requis si le domaine déployé ne correspond pas au domaine de développement.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Discord: OAuth2 pour l’identité, discord.js Gateway pour les changements de salons vocaux

## Where things live

- `artifacts/dreamteam-misaki/` — application web React/Vite.
- `artifacts/api-server/src/routes/auth.ts` — connexion Discord et sessions.
- `artifacts/api-server/src/routes/dreamteam.ts` — équipes, rôles, administration et défis.
- `artifacts/api-server/src/lib/voiceBot.ts` — collecte des événements vocaux Discord.
- `artifacts/api-server/src/lib/challengeService.ts` — classement, calcul des heures et tirage.
- `lib/db/src/schema/dreamteam.ts` — schéma PostgreSQL.
- `lib/api-spec/openapi.yaml` — contrat source des réponses et hooks.

## Architecture decisions

- Discord ID est l’identifiant unique d’un compte. Les jetons OAuth ne sont pas conservés; la base ne stocke qu’un hash du cookie de session.
- Les permissions sont contrôlées par l’API, pas seulement par les pages React. Les Admin+ initiaux sont désignés par `ADMIN_DISCORD_IDS`.
- Le site n’importe pas les 200 000 membres du serveur : seuls les membres qui se connectent sont inscrits au roster.
- Le bot comptabilise uniquement la durée en vocal dans les salons explicitement configurés; aucun audio n’est enregistré.
- La clôture d’un défi et le tirage pondéré sont exécutés côté serveur; le capitaine éligible possède deux tickets.

## Product

Les membres se connectent via Discord et rejoignent une équipe par code. Les capitaines peuvent gérer leur équipe; les Admin+ attribuent les rôles, gèrent les équipes et lancent des défis de sept jours. Le site suit les heures vocales et conserve l’historique des défis.

## User preferences

Pas de préférence générale à noter pour le moment.

## Gotchas

- Ajouter l’URL de retour OAuth du site dans le portail développeur Discord; définir `DISCORD_REDIRECT_URI` pour le domaine de production.
- `DISCORD_VOICE_CHANNEL_IDS` accepte une liste d’identifiants de salons autorisés, séparés par des virgules.
- Après une modification de `lib/api-spec/openapi.yaml`, lancer le codegen avant de vérifier les applications consommatrices.
- Après une modification du schéma Drizzle, lancer `pnpm --filter @workspace/db run push` en développement.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
