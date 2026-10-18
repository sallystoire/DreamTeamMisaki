import { MessageFlags, SlashCommandBuilder, escapeMarkdown, type Client, type Interaction } from "discord.js";
import { joinTeamByCode, MembershipError } from "./teamMembership";
import { logger } from "./logger";

export const joinTeamCommandDefinition = new SlashCommandBuilder()
  .setName("jointeam").setDescription("Rejoins l’équipe de ton capitaine avec son code.")
  .addStringOption(option => option.setName("code").setDescription("Le code transmis par ton capitaine")
    .setRequired(true).setMinLength(4).setMaxLength(32));

export async function registerJoinTeamCommand(client: Client<true>, guildId: string): Promise<void> {
  const guild = await client.guilds.fetch(guildId);
  const commands = await guild.commands.fetch();
  const existing = commands.find(command => command.name === "jointeam" && command.type === 1);
  if (existing) await guild.commands.edit(existing.id, joinTeamCommandDefinition.toJSON());
  else await guild.commands.create(joinTeamCommandDefinition.toJSON());
  logger.info("Discord /jointeam command registered in the configured guild");
}

export async function handleJoinTeamInteraction(interaction: Interaction, guildId: string | undefined): Promise<void> {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "jointeam") return;
  try {
    if (!guildId || interaction.guildId !== guildId) {
      await interaction.reply({ content: "Utilise /jointeam sur le serveur Misaki.", flags: MessageFlags.Ephemeral }); return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const team = await joinTeamByCode({
      discordId: interaction.user.id,
      username: interaction.user.globalName || interaction.user.username,
      avatarUrl: interaction.user.displayAvatarURL({ size: 128 }),
    }, interaction.options.getString("code", true));
    await interaction.editReply({
      content: `Tu fais maintenant partie de **${escapeMarkdown(team.name)}**. Connecte-toi au site avec ce même compte Discord pour suivre ton équipe.`,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    if (!(error instanceof MembershipError)) logger.error({ err: error }, "Discord /jointeam failed");
    const content = error instanceof MembershipError ? error.message : "Impossible de rejoindre l’équipe pour le moment. Réessaie plus tard.";
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content });
      else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch { /* Expired interaction; failures were logged above. */ }
  }
}
