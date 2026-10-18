import { randomUUID } from "node:crypto";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { and, eq, isNull } from "drizzle-orm";
import { db, dreamUsersTable, dreamVoiceSessionsTable } from "@workspace/db";
import { logger } from "./logger";

let client: Client | undefined;

function allowedChannelIds(): Set<string> {
  return new Set(
    (process.env.DISCORD_VOICE_CHANNEL_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function isVoiceBotConnected(): boolean {
  return Boolean(client?.isReady() && allowedChannelIds().size > 0);
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
  const channels = allowedChannelIds();
  if (!guildId || channels.size === 0) return;

  const guild = client.guilds.cache.get(guildId);
  const state = guild?.voiceStates.cache.get(discordId);
  if (state?.channelId && channels.has(state.channelId) && !state.member?.user.bot) {
    await startTrackedSession(discordId, state.channelId);
  }
}

export function startVoiceBot(): void {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) {
    logger.warn(
      "Discord voice tracking is waiting for DISCORD_BOT_TOKEN and DISCORD_GUILD_ID",
    );
    return;
  }

  client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  client.on(Events.ClientReady, async (readyClient) => {
    await stopAllTrackedSessions();
    logger.info({ guildId: readyClient.guilds.cache.get(guildId)?.id ?? guildId }, "Discord voice bot connected");
    const channels = allowedChannelIds();
    if (channels.size === 0) {
      logger.warn("Discord voice tracking is connected but no voice channels are configured");
      return;
    }

    try {
      const guild =
        readyClient.guilds.cache.get(guildId) ??
        (await readyClient.guilds.fetch(guildId));
      for (const state of guild.voiceStates.cache.values()) {
        if (
          state.channelId &&
          channels.has(state.channelId) &&
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
    const channels = allowedChannelIds();
    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;
    if (oldChannelId === newChannelId) return;

    void (async () => {
      if (oldChannelId && channels.has(oldChannelId)) {
        await stopTrackedSession(newState.id);
      }
      if (
        newChannelId &&
        channels.has(newChannelId) &&
        !newState.member?.user.bot
      ) {
        await startTrackedSession(newState.id, newChannelId);
      }
    })().catch((error: unknown) => {
      logger.error(
        { message: error instanceof Error ? error.message : "unknown error" },
        "Failed to update Discord voice activity",
      );
    });
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
