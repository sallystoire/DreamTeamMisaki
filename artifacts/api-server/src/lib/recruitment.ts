import { ChannelType, OverwriteType, PermissionFlagsBits } from "discord.js";
import { SubmitCaptainApplicationBody } from "@workspace/api-zod";
import { configuredAdminIds } from "../middlewares/dreamteam-auth";
import { getDiscordBot } from "./voiceBot";
import { recruitmentGuildId } from "./discordConfig";

export const recruitmentInvite = "https://discord.gg/CNKn4X4jJ";
type CaptainApplicationInput = ReturnType<typeof SubmitCaptainApplicationBody.parse>;

export async function deliverCaptainApplication(discordId: string, answers: CaptainApplicationInput) {
  const bot = getDiscordBot();
  if (!bot?.isReady()) throw new Error("Recruitment bot is not connected");
  let targetGuildId = recruitmentGuildId();
  if (!targetGuildId) {
    const invite = await bot.fetchInvite(recruitmentInvite);
    if (!invite.guild) throw new Error("Recruitment invite has no guild");
    targetGuildId = invite.guild.id;
  }
  const guild = await bot.guilds.fetch(targetGuildId);
  const marker = `misaki-captain:${discordId}`;
  const channels = await guild.channels.fetch();
  let channel = channels.find((item) => item?.type === ChannelType.GuildText && item.topic === marker);
  if (!channel) {
    const slug = answers.discordUsername.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || discordId;
    const access = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory];
    const staffRoles = (process.env.DISCORD_RECRUITMENT_STAFF_ROLE_IDS ?? "").split(",").map(x => x.trim()).filter(x => /^\d{17,20}$/.test(x));
    if (staffRoles.includes(guild.id)) throw new Error("Recruitment staff role cannot be @everyone");
    channel = await guild.channels.create({
      name: slug,
      type: ChannelType.GuildText,
      topic: marker,
      reason: "Candidature Capitaine envoyée depuis Misaki",
      permissionOverwrites: [
        { id: guild.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
        ...[...new Set([discordId, bot.user.id, ...configuredAdminIds()])].map(id => ({
          id, type: OverwriteType.Member, allow: access,
        })),
        ...staffRoles.map(id => ({ id, type: OverwriteType.Role, allow: access })),
      ],
    });
  }
  if (channel.type !== ChannelType.GuildText) throw new Error("Invalid recruitment channel");
  if (channel.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)) {
    throw new Error("Recruitment channel must be private");
  }
  // Recover an interrupted delivery without posting the same application twice.
  const messages = await channel.messages.fetch({ limit: 100 });
  let message = messages.find(item => item.author.id === bot.user.id && item.embeds.some(embed => embed.footer?.text === marker));
  if (!message) {
    const field = (name: string, value: string | number) => ({ name, value: String(value), inline: false });
    message = await channel.send({
      allowedMentions: { parse: [] },
      embeds: [{
        title: "Candidature Capitaine — Misaki",
        color: 0xe5bc63,
        fields: [
          field("Pseudo Discord", answers.discordUsername), field("Identifiant Discord vérifié", discordId),
          field("Âge", answers.age), field("Disponibilité (semaine/week-end)", answers.availability),
          field("Motivation", answers.motivation), field("Qu’est-ce que la Gestion Staff ?", answers.staffManagement),
          field("Expérience sur Discord", answers.experience), field("Heures de vocal sur Misaki (déclarées)", answers.voiceHours),
          field("Rôles sur Misaki", answers.misakiRoles),
        ],
        footer: { text: marker },
        timestamp: new Date().toISOString(),
      }],
    });
  }
  return { channelId: channel.id, guildId: guild.id, messageId: message.id };
}
