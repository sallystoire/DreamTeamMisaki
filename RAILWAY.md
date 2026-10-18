# Hébergement Railway

Le service Railway sert le site, l’API et le bot Discord dans un même processus permanent. Ne pas lancer plusieurs répliques du bot.

1. Importer le dépôt dans Railway, conserver la racine du monorepo et utiliser `railway.json`.
2. Ajouter PostgreSQL et relier sa variable `DATABASE_URL` au **service API/site**. Au démarrage, `@workspace/api-server start` lance `@workspace/db init` avant d’ouvrir le serveur et de connecter le bot. Sur une base neuve, les sept tables de l’application sont créées dans une transaction. Une base existante complète est simplement vérifiée; aucun compte, score ou défi n’est supprimé. Une base partiellement initialisée est refusée avec un message explicite : faire alors une migration examinée, jamais un reset ou un `push-force`.
3. Ajouter `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_MISAKI_GUILD_ID` (serveur principal : vocal, connexion et commandes) et `DISCORD_RECRUITMENT_GUILD_ID` (serveur des candidatures). L’ancienne variable `DISCORD_GUILD_ID` reste un alias de secours du serveur principal, mais ne pas y mettre le serveur recrutement. Aucune liste de salons n’est nécessaire : seuls les salons vocaux où `@everyone` a Voir le salon et Se connecter sont comptés (hors AFK et conférences).
4. Dans le service Railway → Settings → Networking → Public Networking → Generate Domain, créer le domaine public `*.up.railway.app`. Aucun achat de domaine personnel n’est nécessaire. Définir `DISCORD_REDIRECT_URI` à `https://VOTRE-DOMAINE/api/auth/discord/callback` et ajouter exactement cette URL dans Discord Developer Portal → votre application → OAuth2 → Redirects → Save Changes. Vérifier que l’Application ID de cette application est bien `DISCORD_CLIENT_ID` et que son bot utilise `DISCORD_BOT_TOKEN`.
5. Inviter le même bot sur le serveur recrutement correspondant à `https://discord.gg/CNKn4X4jJ`. Il lui faut Gérer les salons, Gérer les rôles/permissions, Voir les salons, Envoyer des messages, Intégrer des liens et Voir les anciens messages. Les candidatures créent un salon privé au pseudo du candidat; il peut le voir dès qu’il rejoint le serveur.
6. Pour donner accès aux recruteurs non administrateurs Discord, définir `DISCORD_RECRUITMENT_STAFF_ROLE_IDS` (IDs des rôles, séparés par des virgules). Sans cette option, seuls le candidat, le bot, les Admin+ configurés et les administrateurs Discord ont accès. Les rôles du site ne donnent pas automatiquement des permissions sur Discord.
7. Inviter le bot sur Misaki et lui accorder la visibilité sur les salons vocaux publics. Aucun audio n’est enregistré. Les changements de permissions sont pris en compte pendant les sessions.
8. Inviter le bot avec les scopes `bot` et `applications.commands` (Discord Developer Portal → OAuth2 → URL Generator). `/team` est enregistré au démarrage uniquement sur le serveur Misaki configuré. La réponse est privée et réservée au capitaine réel d’une équipe active : nom, code, classement du dernier défi et liste paginée de tous les membres. Aucune autre commande du bot n’est supprimée.
9. `/jointeam code:CODE` est disponible sur Misaki et répond en privé. Le compte est identifié par Discord et enregistré sans doublon, même sans première connexion au site. Une connexion ultérieure avec ce même compte retrouve son équipe. Un membre déjà dans une autre équipe ne peut pas changer d’équipe avec un autre code.

Le bot doit être installé sur les deux serveurs. Une installation sur le recrutement ne donne pas accès à Misaki. Les commandes sont automatiquement enregistrées aussi lors de l’ajout du bot sur Misaki, sans redémarrage manuel.

### Crash après démarrage et connexion Discord

- `relation "dream_voice_sessions" does not exist` signifie que le schéma PostgreSQL n’a pas été initialisé sur la base reliée au service. Le nouveau démarrage inclut cette initialisation et ne laisse pas le bot démarrer avant sa réussite. Les erreurs Discord sont gérées et journalisées, sans devenir des erreurs de processus non interceptées.
- Le service `@workspace/mockup-sandbox` est un outil de prévisualisation Replit, pas une application à lancer sur Railway. Ne pas le démarrer en production et ne pas contourner son erreur `BASE_PATH` : utiliser uniquement la commande de démarrage API/site de `railway.json`.
- Les variables et secrets présents sur Replit ne sont pas automatiquement présents sur Railway. Sur le service Railway API/site, renseigner `DISCORD_CLIENT_ID=1561196644601438330`, le `DISCORD_CLIENT_SECRET` de cette application, `DISCORD_BOT_TOKEN`, les deux IDs de serveurs et `DATABASE_URL`.
- Définir `DISCORD_REDIRECT_URI=https://dreamteammisaki.up.railway.app/api/auth/discord/callback` et ajouter **exactement** cette adresse dans Discord Developer Portal → OAuth2 → Redirects. Si l’URI explicite est absente, le code peut utiliser `RAILWAY_PUBLIC_DOMAIN`; il ne choisit jamais un domaine de développement Replit en production.
- Un 502 Railway bloque aussi `/api/auth/discord/login` : le résoudre avant de diagnostiquer une erreur d’autorisation Discord. Un 503 JSON sur cette route, une fois le serveur disponible, indique désormais les noms des variables OAuth manquantes ou invalides, jamais leurs valeurs secrètes.

### Version de pnpm et installation reproductible

Les champs `packageManager` et `engines.pnpm` du `package.json` racine, ainsi que `packages.pnpm` dans `railpack.json`, fixent pnpm à `10.26.1`. Le runtime Node est fixé à la branche 24. Les réglages `overrides` sont dans `pnpm-workspace.yaml`; pnpm 9 refuse ce lockfile avec `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`, ce qui a été reproduit dans une copie propre du projet.

Railpack effectue son installation **avant** la commande de compilation de `railway.json`. Modifier seulement cette commande de compilation ne peut donc pas corriger une erreur de l’installation automatique. `railpack.json` configure cette étape et affiche les versions Node/pnpm avant de conserver les commandes d’installation automatiques. `railway.json` ne lance pas une seconde installation.

Après modification, envoyer **ensemble** `package.json`, `railpack.json` et `railway.json` au dépôt connecté et déployer ce nouveau commit. Le log de l’étape `install` doit afficher `10.26.1`. Si cette ligne n’apparaît pas, vérifier le commit déployé, le dossier racine du service et une éventuelle variable Railway `RAILPACK_CONFIG_FILE` qui sélectionnerait un autre fichier.

Conserver `--frozen-lockfile` pendant le déploiement. Après un changement de dépendances, régénérer le lockfile avec cette même version de pnpm et envoyer ensemble `package.json`, `pnpm-workspace.yaml` et `pnpm-lock.yaml` au dépôt utilisé par Railway. La racine du service doit être celle du monorepo, pas un sous-dossier `artifacts/`.

Les Admin+ disposent d’un formulaire de création d’équipe, y compris pour eux-mêmes sans perdre leurs droits. Ils peuvent modifier ou retirer la récompense d’un défi sans supprimer son historique ni ses scores. Les données fictives de démonstration sont exclusivement côté navigateur pour les visiteurs déconnectés : elles ne sont jamais insérées dans la base.

Pour utiliser un domaine personnel, ajouter Custom Domain dans Public Networking, puis copier les enregistrements CNAME et TXT indiqués par Railway chez le fournisseur du domaine. Attendre la validation HTTPS, puis remplacer l’URL de retour OAuth des deux côtés.

La connexion OAuth du site identifie les membres; l’invitation du bot installe le bot sur les serveurs. Ce sont deux opérations distinctes. Le rôle Admin+ est attribué côté serveur au compte Discord connecté correspondant aux identifiants initiaux, sans rôle Discord supplémentaire à créer.

Les candidatures sont liées au compte Discord connecté, sauvegardées en base et envoyées au recrutement sans doublon. Une panne Discord n’est jamais présentée comme un envoi réussi : les réponses restent disponibles pour une nouvelle tentative après 30 secondes.

Les deux Admin+ initiaux sont reconnus côté serveur par leur identifiant Discord. `ADMIN_DISCORD_IDS` peut étendre cette liste. Aucun mot de passe ni jeton Discord utilisateur n’est conservé.

Cette configuration prépare le déploiement; elle ne crée pas de projet Railway et ne publie pas automatiquement.
