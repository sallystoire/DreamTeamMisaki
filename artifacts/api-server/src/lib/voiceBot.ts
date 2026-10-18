import { randomUUID } from "node:crypto";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { and, eq, isNull } from "drizzle-orm";
import { db, dreamUsersTable, dreamVoiceSessionsTable } from "@workspace/db";
import { logger } from "./logger";
import { isPublicVoiceChannel } from "./publicVoice";

let client: Client | undefined;

export function getDiscordBot(): Client | undefined { return client; }

export function isVoiceBotConnected(): boolean {
  return Boolean(client?.isReady() && client.guilds.cache.has(process.env.DISCORD_GUILD_ID ?? ""));
}

async function startTrackedSession(
  discordId: string,
  channelId: string,
  startedAt = new Date(),
): Promise<void> {
  const [user] = await db
    .select({ teamId: dreamUsersTable.teamId })
    .from(dreamUsersTable)
    .where(eq(dreamUsersTable.discordId, discordId))
    .limit(1);
  if (!user?.teamId) return;

  const [existing] = await db
    .select({ id: dreamVoiceSessionsTable.id })
    .from(dreamVoiceSessionsTable)
    .where(
      and(
        eq(dreamVoiceSessionsTable.discordId, discordId),
        isNull(dreamVoiceSessionsTable.endedAt),
      ),
    )
    .limit(1);
  if (existing) return;

  try {
    await db.insert(dreamVoiceSessionsTable).values({
      id: randomUUID(),
      discordId,
      teamId: user.teamId,
      channelId,
      startedAt,
    });
  } catch (error) {
    if ((error as { code?: string }).code !== "23505") throw error;
  }
}

async function stopTrackedSession(discordId: string, endedAt = new Date()): Promise<void> {
  await db
    .update(dreamVoiceSessionsTable)
    .set({ endedAt })
    .where(
      and(
        eq(dreamVoiceSessionsTable.discordId, discordId),
        isNull(dreamVoiceSessionsTable.endedAt),
      ),
    );
}

async function stopAllTrackedSessions(): Promise<void> {
  await db
    .update(dreamVoiceSessionsTable)
    .set({ endedAt: new Date() })
    .where(isNull(dreamVoiceSessionsTable.endedAt));
}

export async function updateActiveVoiceTeam(
  discordId: string,
  nextTeamId: string | null,
): Promise<void> {
  const [active] = await db
    .select()
    .from(dreamVoiceSessionsTable)
    .where(
      and(
        eq(dreamVoiceSessionsTable.discordId, discordId),
        isNull(dreamVoiceSessionsTable.endedAt),
      ),
    )
    .limit(1);

  if (!active) {
    if (nextTeamId) await syncMemberVoiceState(discordId);
    return;
  }
  if (active.teamId === nextTeamId) return;

  const now = new Date();
  await db
    .update(dreamVoiceSessionsTable)
    .set({ endedAt: now })
    .where(eq(dreamVoiceSessionsTable.id, active.id));
  if (!nextTeamId) return;
  await db.insert(dreamVoiceSessionsTable).values({
    id: randomUUID(),
    discordId,
    teamId: nextTeamId,
    channelId: active.channelId,
    startedAt: now,
  });
}

export async function syncMemberVoiceState(discordId: string): Promise<void> {
  if (!client?.isReady()) return;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return;

  const guild = client.guilds.cache.get(guildId);
  const state = guild?.voiceStates.cache.get(discordId);
  const [active] = await db.select().from(dreamVoiceSessionsTable).where(and(
    eq(dreamVoiceSessionsTable.discordId, discordId), isNull(dreamVoiceSessionsTable.endedAt),
  )).limit(1);
  const eligible = state?.channelId && isPublicVoiceChannel(state.channel) && state.member && !state.member.user.bot;
  if (active && (!eligible || active.channelId !== state?.channelId)) await stopTrackedSession(discordId);
  if (eligible && state?.channelId) {
    await startTrackedSession(discordId, state.channelId);
  }
}

const memberQueues = new Map<string, Promise<void>>();
function queueVoiceSync(discordId: string): Promise<void> {
  const next = (memberQueues.get(discordId) ?? Promise.resolve()).catch(() => {}).then(() => syncMemberVoiceState(discordId));
  memberQueues.set(discordId, next);
  void next.finally(() => { if (memberQueues.get(discordId) === next) memberQueues.delete(discordId); }).catch(() => {});
  return next;
}

export function startVoiceBot(): void {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token) {
    logger.warn(
      "Discord bot is waiting for DISCORD_BOT_TOKEN",
    );
    return;
  }

  client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  client.on(Events.ClientReady, async (readyClient) => {
    await stopAllTrackedSessions();
    logger.info({ guildId: guildId ?? null }, "Discord bot connected");
    if (!guildId) {
      logger.warn("Voice tracking is waiting for DISCORD_GUILD_ID; recruitment bot remains available");
      return;
    }

    try {
      const guild =
        readyClient.guilds.cache.get(guildId) ??
        (await readyClient.guilds.fetch(guildId));
      for (const state of guild.voiceStates.cache.values()) {
        if (
          state.channelId &&
          isPublicVoiceChannel(state.channel) &&
          state.member &&
          !state.member.user.bot
        ) {
          await startTrackedSession(state.id, state.channelId);
        }
      }
    } catch (error) {
      logger.error(
        { message: error instanceof Error ? error.message : "unknown error" },
        "Could not sync existing Discord voice states",
      );
    }
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (newState.guild.id !== guildId) return;
    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;
    if (oldChannelId === newChannelId) return;

    void queueVoiceSync(newState.id).catch((error: unknown) => {
      logger.error(
        { message: error instanceof Error ? error.message : "unknown error" },
        "Failed to update Discord voice activity",
      );
    });
  });

  const reconcilePermissions = () => {
    const guild = client?.guilds.cache.get(guildId ?? "");
    for (const state of guild?.voiceStates.cache.values() ?? []) {
      void queueVoiceSync(state.id).catch((error: unknown) => logger.error({ err: error }, "Voice permission sync failed"));
    }
  };
  client.on(Events.ChannelUpdate, (_old, channel) => {
    if ("guild" in channel && channel.guild.id === guildId) reconcilePermissions();
  });
  client.on(Events.ChannelDelete, (channel) => {
    if ("guild" in channel && channel.guild.id === guildId) reconcilePermissions();
  });
  client.on(Events.GuildRoleUpdate, (_old, role) => {
    if (role.guild.id === guildId) reconcilePermissions();
  });

  client.on(Events.ShardDisconnect, () => {
    void stopAllTrackedSessions().catch((error: unknown) => {
      logger.error(
        { message: error instanceof Error ? error.message : "unknown error" },
        "Failed to close voice sessions after the Discord bot disconnected",
      );
    });
  });

  void client.login(token).catch((error: unknown) => {
    logger.error(
      { message: error instanceof Error ? error.message : "unknown error" },
      "Discord voice bot could not connect",
    );
  });
}
