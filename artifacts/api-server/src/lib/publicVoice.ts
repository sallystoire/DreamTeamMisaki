import { ChannelType, PermissionFlagsBits, type GuildBasedChannel } from "discord.js";

/** Public means @everyone can both see and join, irrespective of personal roles. */
export function isPublicVoiceChannel(channel: GuildBasedChannel | null | undefined): boolean {
  if (!channel || channel.type !== ChannelType.GuildVoice || channel.id === channel.guild.afkChannelId) return false;
  const permissions = channel.permissionsFor(channel.guild.roles.everyone);
  return Boolean(permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]));
}
