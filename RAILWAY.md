# Hébergement Railway

Le service Railway sert le site, l’API et le bot Discord dans un même processus permanent. Ne pas lancer plusieurs répliques du bot.

1. Importer le dépôt dans Railway, conserver la racine du monorepo et utiliser `railway.json`.
2. Ajouter PostgreSQL et définir `DATABASE_URL` pour le service. Sur une nouvelle base, appliquer explicitement le schéma avec `pnpm --filter @workspace/db run push` avant la première utilisation. Ne pas remplacer ou écraser une base existante.
3. Ajouter `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_VOICE_CHANNEL_IDS` (IDs séparés par des virgules).
4. Générer le domaine public Railway. Définir `DISCORD_REDIRECT_URI` à `https://VOTRE-DOMAINE/api/auth/discord/callback` et ajouter exactement cette URL dans Discord Developer Portal → OAuth2 → Redirects.
5. Définir `VITE_RECRUITMENT_INVITE_URL` avec le lien du serveur de recrutement, puis reconstruire le site.
6. Inviter le bot sur le serveur et lui accorder la visibilité sur les salons vocaux autorisés. Aucun droit d’enregistrement audio n’est nécessaire.

Les deux Admin+ initiaux sont reconnus côté serveur par leur identifiant Discord. `ADMIN_DISCORD_IDS` peut étendre cette liste. Aucun mot de passe ni jeton Discord utilisateur n’est conservé.

Cette configuration prépare le déploiement; elle ne crée pas de projet Railway et ne publie pas automatiquement.
