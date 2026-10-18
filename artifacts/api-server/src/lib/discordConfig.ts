/** Explicit purpose-specific names; keep the old main guild key compatible. */
export function misakiGuildId(): string | undefined {
  return process.env.DISCORD_MISAKI_GUILD_ID?.trim() || process.env.DISCORD_GUILD_ID?.trim() || undefined;
}

export function recruitmentGuildId(): string | undefined {
  return process.env.DISCORD_RECRUITMENT_GUILD_ID?.trim() || undefined;
}
