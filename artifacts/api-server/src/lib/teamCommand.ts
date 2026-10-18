import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
  SlashCommandBuilder, escapeMarkdown,
  type Client, type Interaction,
} from "discord.js";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, dreamTeamsTable, dreamUsersTable } from "@workspace/db";
import { getDreamTeamDashboard } from "./challengeService";
import { logger } from "./logger";

const pageSize = 15;
const buttonPrefix = "misaki:team:";
export const teamCommandDefinition = new SlashCommandBuilder()
  .setName("team")
  .setDescription("Capitaine : affiche ton équipe, tes membres, ton classement et ton code.");

type TeamView = {
  id: string; name: string; joinCode: string;
  members: { discordId: string; username: string }[];
  rank: number | null; totalTeams: number; finished: boolean; voiceHours: number;
};

export function buildTeamReply(team: TeamView, ownerId: string, requestedPage = 0) {
  const pages = Math.max(1, Math.ceil(team.members.length / pageSize));
  const page = Math.min(pages - 1, Math.max(0, Math.floor(requestedPage)));
  const roster = team.members.slice(page * pageSize, (page + 1) * pageSize)
    .map((member, index) => `${page * pageSize + index + 1}. ${escapeMarkdown(member.username.slice(0, 80))} — ${member.discordId}`);
  const embed = new EmbedBuilder()
    .setColor(0xe5bc63).setTitle(team.name)
    .setDescription(roster.length ? roster.join("\n") : "Aucun membre dans cette équipe.")
    .addFields(
      { name: "Classement" + (team.finished ? " final" : ""), value: team.rank ? `#${team.rank} / ${team.totalTeams}` : "Aucun défi disponible", inline: true },
      { name: "Code de l’équipe", value: team.joinCode, inline: true },
      { name: "Membres", value: String(team.members.length), inline: true },
      { name: "Vocal du défi", value: `${team.voiceHours.toFixed(2)} h`, inline: true },
    )
    .setFooter({ text: `Page ${page + 1}/${pages} · Informations privées du capitaine` });
  const components = pages > 1 ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${buttonPrefix}${ownerId}:${page - 1}`).setLabel("Précédent").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`${buttonPrefix}${ownerId}:${page + 1}`).setLabel("Suivant").setStyle(ButtonStyle.Secondary).setDisabled(page === pages - 1),
  )] : [];
  return { embeds: [embed], components, allowedMentions: { parse: [] as never[] } };
}

export async function getCaptainTeamView(discordId: string): Promise<TeamView | null> {
  const [team] = await db.select().from(dreamTeamsTable).where(and(
    eq(dreamTeamsTable.captainDiscordId, discordId), isNull(dreamTeamsTable.archivedAt),
  )).limit(1);
  if (!team) return null;
  const [members, dashboard] = await Promise.all([
    db.select({ discordId: dreamUsersTable.discordId, username: dreamUsersTable.username })
      .from(dreamUsersTable).where(eq(dreamUsersTable.teamId, team.id)).orderBy(asc(dreamUsersTable.username)),
    getDreamTeamDashboard(),
  ]);
  const index = dashboard.leaderboard.findIndex(row => row.id === team.id);
  return {
    ...team, members, rank: dashboard.challenge && index >= 0 ? index + 1 : null,
    totalTeams: dashboard.leaderboard.length,
    finished: dashboard.challenge?.status === "COMPLETED",
    voiceHours: index >= 0 ? dashboard.leaderboard[index].voiceHours : 0,
  };
}

export async function registerTeamCommand(client: Client<true>, guildId: string): Promise<void> {
  const guild = await client.guilds.fetch(guildId);
  const commands = await guild.commands.fetch();
  const existing = commands.find(command => command.name === "team" && command.type === 1);
  // Do not overwrite or remove unrelated bot commands.
  if (existing) await guild.commands.edit(existing.id, teamCommandDefinition.toJSON());
  else await guild.commands.create(teamCommandDefinition.toJSON());
  logger.info("Discord /team command registered in the configured guild");
}

export async function handleTeamInteraction(interaction: Interaction, guildId: string | undefined): Promise<void> {
  const slash = interaction.isChatInputCommand() && interaction.commandName === "team";
  const button = interaction.isButton() && interaction.customId.startsWith(buttonPrefix);
  if (!slash && !button) return;
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;
  try {
    if (!guildId || interaction.guildId !== guildId) {
      await interaction.reply({ content: "Cette commande est disponible uniquement sur le serveur Misaki configuré.", flags: MessageFlags.Ephemeral });
      return;
    }
    let page = 0;
    if (interaction.isButton()) {
      const [ownerId, rawPage] = interaction.customId.slice(buttonPrefix.length).split(":");
      if (ownerId !== interaction.user.id) {
        await interaction.reply({ content: "Ce menu appartient à un autre capitaine.", flags: MessageFlags.Ephemeral }); return;
      }
      page = Number(rawPage);
      if (!Number.isSafeInteger(page)) return;
      await interaction.deferUpdate();
    } else {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    const team = await getCaptainTeamView(interaction.user.id);
    if (!team) {
      await interaction.editReply({
        content: "Tu n’es pas capitaine d’une équipe active sur le site. Un Admin doit d’abord t’attribuer une équipe.",
        embeds: [], components: [],
      }); return;
    }
    await interaction.editReply({ content: "", ...buildTeamReply(team, interaction.user.id, page) });
  } catch (error) {
    logger.error({ err: error }, "Discord /team failed");
    const message = { content: "Impossible de charger ton équipe pour le moment. Réessaie dans un instant.", embeds: [], components: [] };
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply(message);
      else await interaction.reply({ ...message, flags: MessageFlags.Ephemeral });
    } catch { /* Interaction expired; the original failure is already logged. */ }
  }
}
