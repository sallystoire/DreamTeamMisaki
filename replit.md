# DreamTeam Misaki

Site privé de compétition hebdomadaire : connexion Discord, équipes de capitaines, classement vocal et administration réservée aux Admin+.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API Discord, bot vocal et endpoints (port fourni par le workflow)
- `pnpm --filter @workspace/dreamteam-misaki run dev` — interface React
- `pnpm run typecheck` — vérification TypeScript complète
- `pnpm --filter @workspace/api-spec run codegen` — régénère les hooks React et schémas Zod depuis OpenAPI
- `pnpm --filter @workspace/db run push` — applique le schéma PostgreSQL de développement
- Configuration nécessaire : `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` (secret), `DISCORD_MISAKI_GUILD_ID`, `DISCORD_RECRUITMENT_GUILD_ID`, `DISCORD_BOT_TOKEN` (secret). `DISCORD_GUILD_ID` reste un ancien alias du serveur principal. `ADMIN_DISCORD_IDS` peut étendre les Admin+ initiaux. `DISCORD_REDIRECT_URI` est optionnel en développement et requis en production.

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
- Le bot comptabilise les membres en équipe dans les salons vocaux publics détectés automatiquement : `@everyone` doit pouvoir voir et rejoindre le salon; AFK et conférences exclus. Aucun audio n’est enregistré.
- Le bot suit uniquement les comptes inscrits qui appartiennent à une équipe. Le serveur et les salons sont configurés explicitement par leurs IDs Discord.
- Les capitaines gèrent leur roster, mais seuls Admin et Admin+ modifient le nom et le code d’équipe. Les attributions de rôle et le lancement des défis restent réservés aux Admin+.
- La clôture d’un défi et le tirage pondéré sont exécutés côté serveur; le capitaine éligible possède deux tickets.

## Product

Les membres se connectent via Discord et rejoignent une équipe par code. Les capitaines peuvent gérer leur équipe; les Admin+ attribuent les rôles, gèrent les équipes et lancent des défis de sept jours. Le site suit les heures vocales et conserve l’historique des défis.

## User preferences

Pas de préférence générale à noter pour le moment.

## Démo et accès

- Les visiteurs déconnectés voient une démo animée avec des équipes fictives clairement identifiées. Les comptes connectés voient exclusivement les vraies équipes. La démo ne doit jamais modifier la base.
- Le choix d’équipe affiche le classement réel même si l’accueil est en démo; les codes d’invitation ne sont jamais publics.
- Admin+ doit pouvoir créer directement une équipe et modifier ou retirer le cadeau de la semaine. Retirer le cadeau ne doit pas supprimer le défi ni ses scores.
- Le serveur principal Misaki et le serveur recrutement sont distincts. Vérifier la correspondance des invitations avant de configurer leurs IDs pour éviter de suivre le vocal du recrutement.

## Gotchas

- Ajouter l’URL de retour OAuth du site dans le portail développeur Discord; définir `DISCORD_REDIRECT_URI` pour le domaine de production.
- Ne pas réintroduire de liste de salons autorisés : le propriétaire demande une détection automatique des salons publics.
- Les candidatures Capitaine sont envoyées au serveur recrutement `https://discord.gg/CNKn4X4jJ`, dans un salon privé au pseudo du candidat. Le compte Discord connecté fait foi pour l’identité; ne pas accepter un autre identifiant saisi.
- Garder les salons de candidature privés : les réponses contiennent notamment l’âge et les disponibilités. Les rôles du site ne donnent pas de droits Discord; configurer les rôles recruteurs séparément si nécessaire.
- Après une modification de `lib/api-spec/openapi.yaml`, lancer le codegen avant de vérifier les applications consommatrices.
- Après une modification du schéma Drizzle, lancer `pnpm --filter @workspace/db run push` en développement.
- L’interface utilise Outfit et la direction sombre rose/violette fournie par l’utilisateur. Le logo remplace le nom dans l’en-tête.
- Voir `RAILWAY.md` pour le déploiement externe en service unique; Railway n’est pas publié automatiquement depuis cet espace.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
