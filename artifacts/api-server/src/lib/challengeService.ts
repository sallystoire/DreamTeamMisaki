import { randomInt } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  dreamChallengesTable,
  dreamTeamsTable,
  dreamUsersTable,
  dreamVoiceSessionsTable,
  type DreamChallenge,
} from "@workspace/db";
import { logger } from "./logger";
import { isVoiceBotConnected } from "./voiceBot";

type TeamStats = {
  teamId: string;
  voiceSeconds: number;
  activeMembers: number;
};

type MemberStats = {
  teamId: string;
  discordId: string;
  voiceSeconds: number;
  isInVoice: boolean;
};

type TeamProgressDto = {
  id: string;
  name: string;
  captainDiscordId: string;
  captainName: string;
  memberCount: number;
  voiceHours: number;
  activeMembers: number;
};

const secondsInVoiceSession = (challenge: DreamChallenge) => sql<number>`
  GREATEST(
    0,
    EXTRACT(
      EPOCH FROM (
        LEAST(COALESCE(${dreamVoiceSessionsTable.endedAt}, now()), ${challenge.endsAt})
        - GREATEST(${dreamVoiceSessionsTable.startedAt}, ${challenge.startsAt})
      )
    )
  )::float8
`;

async function getTeamStats(challenge: DreamChallenge): Promise<TeamStats[]> {
  const seconds = secondsInVoiceSession(challenge);
  const rows = await db
    .select({
      teamId: dreamVoiceSessionsTable.teamId,
      voiceSeconds: sql<number>`COALESCE(SUM(${seconds}), 0)::float8`,
      activeMembers: sql<number>`
        COUNT(DISTINCT CASE
          WHEN ${dreamVoiceSessionsTable.endedAt} IS NULL THEN ${dreamVoiceSessionsTable.discordId}
          ELSE NULL
        END)::int
      `,
    })
    .from(dreamVoiceSessionsTable)
    .where(
      and(
        isNotNull(dreamVoiceSessionsTable.teamId),
        lt(dreamVoiceSessionsTable.startedAt, challenge.endsAt),
        or(
          isNull(dreamVoiceSessionsTable.endedAt),
          gt(dreamVoiceSessionsTable.endedAt, challenge.startsAt),
        ),
      ),
    )
    .groupBy(dreamVoiceSessionsTable.teamId);

  return rows
    .filter((row): row is typeof row & { teamId: string } => row.teamId !== null)
    .map((row) => ({
      teamId: row.teamId,
      voiceSeconds: Number(row.voiceSeconds) || 0,
      activeMembers: Number(row.activeMembers) || 0,
    }));
}

async function getMemberStats(challenge: DreamChallenge): Promise<MemberStats[]> {
  const seconds = secondsInVoiceSession(challenge);
  const rows = await db
    .select({
      teamId: dreamVoiceSessionsTable.teamId,
      discordId: dreamVoiceSessionsTable.discordId,
      voiceSeconds: sql<number>`COALESCE(SUM(${seconds}), 0)::float8`,
      isInVoice: sql<boolean>`BOOL_OR(${dreamVoiceSessionsTable.endedAt} IS NULL)`,
    })
    .from(dreamVoiceSessionsTable)
    .where(
      and(
        isNotNull(dreamVoiceSessionsTable.teamId),
        lt(dreamVoiceSessionsTable.startedAt, challenge.endsAt),
        or(
          isNull(dreamVoiceSessionsTable.endedAt),
          gt(dreamVoiceSessionsTable.endedAt, challenge.startsAt),
        ),
      ),
    )
    .groupBy(dreamVoiceSessionsTable.teamId, dreamVoiceSessionsTable.discordId);

  return rows
    .filter((row): row is typeof row & { teamId: string } => row.teamId !== null)
    .map((row) => ({
      teamId: row.teamId,
      discordId: row.discordId,
      voiceSeconds: Number(row.voiceSeconds) || 0,
      isInVoice: Boolean(row.isInVoice),
    }));
}

export function challengeToDto(challenge: DreamChallenge) {
  return {
    id: challenge.id,
    title: challenge.title,
    reward: challenge.reward,
    startsAt: challenge.startsAt.toISOString(),
    endsAt: challenge.endsAt.toISOString(),
    status: challenge.status,
    drawStatus: challenge.drawStatus,
    winningTeamId: challenge.winningTeamId,
    winningTeamName: challenge.winningTeamName,
    winnerDiscordId: challenge.winnerDiscordId,
    winnerUsername: challenge.winnerUsername,
    winnerAvatarUrl: challenge.winnerAvatarUrl,
  };
}

async function buildLeaderboard(
  challenge: DreamChallenge | null,
): Promise<TeamProgressDto[]> {
  const teams = await db
    .select({
      id: dreamTeamsTable.id,
      name: dreamTeamsTable.name,
      captainDiscordId: dreamTeamsTable.captainDiscordId,
      captainName: dreamUsersTable.username,
    })
    .from(dreamTeamsTable)
    .leftJoin(
      dreamUsersTable,
      eq(dreamUsersTable.discordId, dreamTeamsTable.captainDiscordId),
    )
    .where(isNull(dreamTeamsTable.archivedAt))
    .orderBy(asc(dreamTeamsTable.name));

  const [teamStats, members, currentMembers] = await Promise.all([
    challenge ? getTeamStats(challenge) : Promise.resolve([] as TeamStats[]),
    challenge ? getMemberStats(challenge) : Promise.resolve([] as MemberStats[]),
    db
      .select({
        teamId: dreamUsersTable.teamId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(dreamUsersTable)
      .where(isNotNull(dreamUsersTable.teamId))
      .groupBy(dreamUsersTable.teamId),
  ]);
  const statsByTeam = new Map(teamStats.map((stat) => [stat.teamId, stat]));
  const countsByTeam = new Map(
    currentMembers
      .filter((row): row is typeof row & { teamId: string } => row.teamId !== null)
      .map((row) => [row.teamId, Number(row.count) || 0]),
  );

  return teams
    .map((team) => {
      const stats = statsByTeam.get(team.id);
      return {
        id: team.id,
        name: team.name,
        captainDiscordId: team.captainDiscordId,
        captainName: team.captainName ?? "Capitaine",
        memberCount: countsByTeam.get(team.id) ?? 0,
        voiceHours: Math.round(((stats?.voiceSeconds ?? 0) / 3600) * 100) / 100,
        activeMembers:
          challenge?.status === "ACTIVE" ? (stats?.activeMembers ?? 0) : 0,
      };
    })
    .sort(
      (left, right) =>
        right.voiceHours - left.voiceHours ||
        left.name.localeCompare(right.name, "fr"),
    );
}

export async function finalizeExpiredChallenges(): Promise<void> {
  const now = new Date();
  const expired = await db
    .select()
    .from(dreamChallengesTable)
    .where(
      and(
        eq(dreamChallengesTable.status, "ACTIVE"),
        lte(dreamChallengesTable.endsAt, now),
      ),
    );

  for (const challenge of expired) {
    const [teamStats, memberStats] = await Promise.all([
      getTeamStats(challenge),
      getMemberStats(challenge),
    ]);
    const teams = await db
      .select({
        id: dreamTeamsTable.id,
        name: dreamTeamsTable.name,
        captainDiscordId: dreamTeamsTable.captainDiscordId,
      })
      .from(dreamTeamsTable)
      .where(isNull(dreamTeamsTable.archivedAt));
    const teamById = new Map(teams.map((team) => [team.id, team]));
    const winningTeam = [...teamStats]
      .sort((left, right) => {
        if (right.voiceSeconds !== left.voiceSeconds) {
          return right.voiceSeconds - left.voiceSeconds;
        }
        return (
          (teamById.get(left.teamId)?.name ?? "").localeCompare(
            teamById.get(right.teamId)?.name ?? "",
            "fr",
          ) || left.teamId.localeCompare(right.teamId)
        );
      })
      .map((stats) => teamById.get(stats.teamId))
      .find((team): team is NonNullable<typeof team> => Boolean(team));

    let drawStatus: "DRAWN" | "NO_ELIGIBLE_MEMBERS" = "NO_ELIGIBLE_MEMBERS";
    let winnerDiscordId: string | null = null;
    let winnerUsername: string | null = null;
    let winnerAvatarUrl: string | null = null;

    if (winningTeam) {
      const eligible = memberStats.filter(
        (member) =>
          member.teamId === winningTeam.id && member.voiceSeconds >= 10 * 60 * 60,
      );
      const weighted = eligible.flatMap((member) => {
        const count = member.discordId === winningTeam.captainDiscordId ? 2 : 1;
        return Array.from({ length: count }, () => member.discordId);
      });
      if (weighted.length > 0) {
        winnerDiscordId = weighted[randomInt(weighted.length)] ?? null;
        drawStatus = "DRAWN";
        if (winnerDiscordId) {
          const [winner] = await db
            .select({
              username: dreamUsersTable.username,
              avatarUrl: dreamUsersTable.avatarUrl,
            })
            .from(dreamUsersTable)
            .where(eq(dreamUsersTable.discordId, winnerDiscordId))
            .limit(1);
          winnerUsername = winner?.username ?? null;
          winnerAvatarUrl = winner?.avatarUrl ?? null;
        }
      }
    }

    const [updated] = await db
      .update(dreamChallengesTable)
      .set({
        status: "COMPLETED",
        drawStatus,
        winningTeamId: winningTeam?.id ?? null,
        winningTeamName: winningTeam?.name ?? null,
        winnerDiscordId,
        winnerUsername,
        winnerAvatarUrl,
      })
      .where(
        and(
          eq(dreamChallengesTable.id, challenge.id),
          eq(dreamChallengesTable.status, "ACTIVE"),
          lte(dreamChallengesTable.endsAt, now),
        ),
      )
      .returning({ id: dreamChallengesTable.id });

    if (updated) {
      logger.info(
        {
          challengeId: challenge.id,
          winningTeamId: winningTeam?.id ?? null,
          drawStatus,
        },
        "Weekly DreamTeam challenge finalized",
      );
    }
  }
}

export async function getDreamTeamDashboard() {
  await finalizeExpiredChallenges();
  const now = new Date();
  const [challenge] = await db
    .select()
    .from(dreamChallengesTable)
    .orderBy(desc(dreamChallengesTable.startsAt))
    .limit(1);
  const current =
    challenge && challenge.status === "ACTIVE" && challenge.endsAt > now
      ? challenge
      : (challenge ?? null);
  const leaderboard = await buildLeaderboard(current);
  const secondsRemaining =
    current?.status === "ACTIVE"
      ? Math.max(0, Math.floor((current.endsAt.getTime() - now.getTime()) / 1000))
      : 0;

  return {
    challenge: current ? challengeToDto(current) : null,
    secondsRemaining,
    leaderboard,
    botConnected: isVoiceBotConnected(),
    updatedAt: new Date().toISOString(),
  };
}

export async function getMembersForChallenge(challenge: DreamChallenge | null) {
  const users = await db
    .select({
      discordId: dreamUsersTable.discordId,
      username: dreamUsersTable.username,
      avatarUrl: dreamUsersTable.avatarUrl,
      role: dreamUsersTable.role,
      teamId: dreamUsersTable.teamId,
      teamName: dreamTeamsTable.name,
      createdAt: dreamUsersTable.createdAt,
    })
    .from(dreamUsersTable)
    .leftJoin(dreamTeamsTable, eq(dreamTeamsTable.id, dreamUsersTable.teamId))
    .orderBy(asc(dreamUsersTable.username));
  const stats = challenge ? await getMemberStats(challenge) : [];
  const byUser = new Map(
    stats.map((stat) => [
      `${stat.teamId}:${stat.discordId}`,
      stat,
    ]),
  );

  return users.map((user) => {
    const stat = user.teamId
      ? byUser.get(`${user.teamId}:${user.discordId}`)
      : undefined;
    return {
      discordId: user.discordId,
      username: user.username,
      avatarUrl: user.avatarUrl,
      role: user.role,
      teamId: user.teamId,
      teamName: user.teamName,
      voiceHours: Math.round(((stat?.voiceSeconds ?? 0) / 3600) * 100) / 100,
      isInVoice: challenge?.status === "ACTIVE" ? (stat?.isInVoice ?? false) : false,
      createdAt: user.createdAt.toISOString(),
    };
  });
}

export async function getLatestChallenge(): Promise<DreamChallenge | null> {
  await finalizeExpiredChallenges();
  const [challenge] = await db
    .select()
    .from(dreamChallengesTable)
    .orderBy(desc(dreamChallengesTable.startsAt))
    .limit(1);
  return challenge ?? null;
}
