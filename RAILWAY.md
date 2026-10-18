# Hébergement Railway

Le service Railway sert le site, l’API et le bot Discord dans un même processus permanent. Ne pas lancer plusieurs répliques du bot.

1. Importer le dépôt dans Railway, conserver la racine du monorepo et utiliser `railway.json`.
2. Ajouter PostgreSQL et définir `DATABASE_URL` pour le service. Sur une nouvelle base, appliquer explicitement le schéma avec `pnpm --filter @workspace/db run push` avant la première utilisation. Ne pas remplacer ou écraser une base existante.
3. Ajouter `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`. Aucune liste de salons n’est nécessaire : seuls les salons vocaux où `@everyone` a Voir le salon et Se connecter sont comptés (hors AFK et conférences).
4. Générer le domaine public Railway. Définir `DISCORD_REDIRECT_URI` à `https://VOTRE-DOMAINE/api/auth/discord/callback` et ajouter exactement cette URL dans Discord Developer Portal → OAuth2 → Redirects.
5. Inviter le même bot sur le serveur recrutement correspondant à `https://discord.gg/CNKn4X4jJ`. Il lui faut Gérer les salons, Gérer les rôles/permissions, Voir les salons, Envoyer des messages, Intégrer des liens et Voir les anciens messages. Les candidatures créent un salon privé au pseudo du candidat; il peut le voir dès qu’il rejoint le serveur.
6. Pour donner accès aux recruteurs non administrateurs Discord, définir `DISCORD_RECRUITMENT_STAFF_ROLE_IDS` (IDs des rôles, séparés par des virgules). Sans cette option, seuls le candidat, le bot, les Admin+ configurés et les administrateurs Discord ont accès. Les rôles du site ne donnent pas automatiquement des permissions sur Discord.
7. Inviter le bot sur Misaki et lui accorder la visibilité sur les salons vocaux publics. Aucun audio n’est enregistré. Les changements de permissions sont pris en compte pendant les sessions.

Les candidatures sont liées au compte Discord connecté, sauvegardées en base et envoyées au recrutement sans doublon. Une panne Discord n’est jamais présentée comme un envoi réussi : les réponses restent disponibles pour une nouvelle tentative après 30 secondes.

Les deux Admin+ initiaux sont reconnus côté serveur par leur identifiant Discord. `ADMIN_DISCORD_IDS` peut étendre cette liste. Aucun mot de passe ni jeton Discord utilisateur n’est conservé.

Cette configuration prépare le déploiement; elle ne crée pas de projet Railway et ne publie pas automatiquement.
