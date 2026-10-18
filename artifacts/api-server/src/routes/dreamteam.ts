import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  and,
  desc,
  eq,
  gt,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  dreamAuditLogTable,
  dreamChallengesTable,
  dreamTeamsTable,
  dreamUsersTable,
} from "@workspace/db";
import {
  AddAdminTeamMemberBody,
  AddAdminTeamMemberParams,
  AddAdminTeamMemberResponse,
  ArchiveAdminTeamParams,
  CreateAdminChallengeBody,
  CreateAdminChallengeResponse,
  GetDreamTeamDashboardResponse,
  GetMyTeamResponse,
  JoinTeamBody,
  JoinTeamResponse,
  ListAdminChallengesResponse,
  ListAdminMembersQueryParams,
  ListAdminMembersResponse,
  ListAdminTeamsResponse,
  RemoveAdminTeamMemberParams,
  RemoveMyTeamMemberParams,
  RenameMyTeamBody,
  RenameMyTeamResponse,
  UpdateAdminTeamBody,
  UpdateAdminTeamParams,
  UpdateAdminTeamResponse,
  UpdateMemberRoleBody,
  UpdateMemberRoleParams,
  UpdateMemberRoleResponse,
} from "@workspace/api-zod";
import {
  getDreamTeamDashboard,
  getLatestChallenge,
  getMembersForChallenge,
  challengeToDto,
} from "../lib/challengeService";
import { updateActiveVoiceTeam } from "../lib/voiceBot";
import {
  requireAdminPlus,
  requireSiteAdmin,
  configuredAdminIds,
  requireDreamteamUser,
} from "../middlewares/dreamteam-auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function teamToDto(team: {
  id: string;
  name: string;
  captainDiscordId: string;
  joinCode: string;
  createdAt: Date;
}, maySeeCode: boolean) {
  return {
    id: team.id,
    name: team.name,
    captainDiscordId: team.captainDiscordId,
    joinCode: maySeeCode ? team.joinCode : null,
    createdAt: team.createdAt.toISOString(),
  };
}

async function writeAudit(
  actorDiscordId: string,
  action: string,
  options: {
    targetDiscordId?: string | null;
    targetTeamId?: string | null;
    details?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    await db.insert(dreamAuditLogTable).values({
      actorDiscordId,
      action,
      targetDiscordId: options.targetDiscordId ?? null,
      targetTeamId: options.targetTeamId ?? null,
      details: options.details ?? {},
    });
  } catch (error) {
    logger.error(
      { message: error instanceof Error ? error.message : "unknown error" },
      "DreamTeam audit entry could not be saved",
    );
    throw error;
  }
}

async function getTeamById(teamId: string) {
  const [team] = await db
    .select()
    .from(dreamTeamsTable)
    .where(and(eq(dreamTeamsTable.id, teamId), isNull(dreamTeamsTable.archivedAt)))
    .limit(1);
  return team;
}

async function getCurrentMembers(challenge: Awaited<ReturnType<typeof getLatestChallenge>>) {
  return getMembersForChallenge(challenge);
}

function randomJoinCode(): string {
  return `MISAKI-${randomBytes(3).toString("hex").toUpperCase()}`;
}

router.get("/dreamteam/dashboard", async (_req, res): Promise<void> => {
  const dashboard = await getDreamTeamDashboard();
  res.json(GetDreamTeamDashboardResponse.parse(dashboard));
});

router.get("/me/team", async (req, res): Promise<void> => {
  const user = requireDreamteamUser(req, res);
  if (!user) return;

  const [member] = await db
    .select({ teamId: dreamUsersTable.teamId })
    .from(dreamUsersTable)
    .where(eq(dreamUsersTable.discordId, user.discordId))
    .limit(1);
  const [team] = member?.teamId
    ? await db
        .select()
        .from(dreamTeamsTable)
        .where(
          and(
            eq(dreamTeamsTable.id, member.teamId),
            isNull(dreamTeamsTable.archivedAt),
          ),
        )
        .limit(1)
    : [];
  if (!team) {
    res.json(GetMyTeamResponse.parse({ team: null, members: [] }));
    return;
  }

  const challenge = await getLatestChallenge();
  const members = await getCurrentMembers(challenge);
  res.json(
    GetMyTeamResponse.parse({
      team: teamToDto(team, team.captainDiscordId === user.discordId),
      members: members.filter((candidate) => candidate.teamId === team.id),
    }),
  );
});

router.post("/teams/join", async (req, res): Promise<void> => {
  const user = requireDreamteamUser(req, res);
  if (!user) return;
  const body = JoinTeamBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (user.role !== "MEMBER") {
    res.status(403).json({ error: "Seuls les membres peuvent rejoindre une équipe." });
    return;
  }
  const [currentUser] = await db
    .select({ teamId: dreamUsersTable.teamId })
    .from(dreamUsersTable)
    .where(eq(dreamUsersTable.discordId, user.discordId))
    .limit(1);
  if (currentUser?.teamId) {
    res.status(400).json({ error: "Tu appartiens déjà à une équipe." });
    return;
  }

  const [team] = await db
    .select()
    .from(dreamTeamsTable)
    .where(
      and(
        eq(dreamTeamsTable.joinCode, body.data.code.trim().toUpperCase()),
        isNull(dreamTeamsTable.archivedAt),
      ),
    )
    .limit(1);
  if (!team) {
    res.status(400).json({ error: "Ce code d’équipe est invalide ou expiré." });
    return;
  }
  const [joined] = await db
    .update(dreamUsersTable)
    .set({ teamId: team.id, updatedAt: new Date() })
    .where(
      and(
        eq(dreamUsersTable.discordId, user.discordId),
        isNull(dreamUsersTable.teamId),
      ),
    )
    .returning({ discordId: dreamUsersTable.discordId });
  if (!joined) {
    res.status(400).json({ error: "Tu appartiens déjà à une équipe." });
    return;
  }
  await updateActiveVoiceTeam(user.discordId, team.id);
  await writeAudit(user.discordId, "team.join", {
    targetDiscordId: user.discordId,
    targetTeamId: team.id,
  });
  res.json(JoinTeamResponse.parse(teamToDto(team, false)));
});

router.patch("/teams/me", async (req, res): Promise<void> => {
  const user = requireDreamteamUser(req, res);
  if (!user) return;
  const body = RenameMyTeamBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (user.role !== "ADMIN" && user.role !== "ADMIN_PLUS") {
    res.status(403).json({ error: "Seuls les Admin et Admin+ peuvent renommer une équipe." });
    return;
  }
  const [team] = await db
    .update(dreamTeamsTable)
    .set({ name: body.data.name.trim() })
    .where(
      and(
        eq(dreamTeamsTable.captainDiscordId, user.discordId),
        isNull(dreamTeamsTable.archivedAt),
      ),
    )
    .returning();
  if (!team) {
    res.status(404).json({ error: "Équipe active introuvable." });
    return;
  }
  await writeAudit(user.discordId, "team.rename", {
    targetTeamId: team.id,
    details: { name: team.name },
  });
  res.json(RenameMyTeamResponse.parse(teamToDto(team, true)));
});

router.delete("/teams/me/members/:discordId", async (req, res): Promise<void> => {
  const user = requireDreamteamUser(req, res);
  if (!user) return;
  if (user.role !== "CAPTAIN") {
    res.status(403).json({ error: "Accès réservé au capitaine." });
    return;
  }
  const params = RemoveMyTeamMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [team] = await db
    .select({ id: dreamTeamsTable.id })
    .from(dreamTeamsTable)
    .where(
      and(
        eq(dreamTeamsTable.captainDiscordId, user.discordId),
        isNull(dreamTeamsTable.archivedAt),
      ),
    )
    .limit(1);
  if (!team || params.data.discordId === user.discordId) {
    res.status(404).json({ error: "Membre introuvable dans cette équipe." });
    return;
  }
  const [removed] = await db
    .update(dreamUsersTable)
    .set({ teamId: null, updatedAt: new Date() })
    .where(
      and(
        eq(dreamUsersTable.discordId, params.data.discordId),
        eq(dreamUsersTable.teamId, team.id),
      ),
    )
    .returning({ discordId: dreamUsersTable.discordId });
  if (!removed) {
    res.status(404).json({ error: "Membre introuvable dans cette équipe." });
    return;
  }
  await updateActiveVoiceTeam(removed.discordId, null);
  await writeAudit(user.discordId, "team.member.remove", {
    targetDiscordId: removed.discordId,
    targetTeamId: team.id,
  });
  res.status(204).end();
});

router.get("/admin/members", async (req, res): Promise<void> => {
  const admin = requireSiteAdmin(req, res);
  if (!admin) return;
  const params = ListAdminMembersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const challenge = await getLatestChallenge();
  let members = await getMembersForChallenge(challenge);
  const search = params.data.search?.trim().toLocaleLowerCase("fr");
  if (search) {
    members = members.filter((member) =>
      `${member.username} ${member.discordId}`.toLocaleLowerCase("fr").includes(search),
    );
  }
  if (params.data.role) {
    members = members.filter((member) => member.role === params.data.role);
  }
  res.json(ListAdminMembersResponse.parse({ items: members, total: members.length }));
});

router.patch("/admin/members/:discordId/role", async (req, res): Promise<void> => {
  const admin = requireAdminPlus(req, res);
  if (!admin) return;
  const params = UpdateMemberRoleParams.safeParse(req.params);
  const body = UpdateMemberRoleBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const discordId = params.data.discordId;
  const role = body.data.role;
  if (configuredAdminIds().has(discordId) && role !== "ADMIN_PLUS") {
    res.status(400).json({ error: "Cet Admin+ initial est protégé par la configuration du serveur." });
    return;
  }
  const [target] = await db
    .select()
    .from(dreamUsersTable)
    .where(eq(dreamUsersTable.discordId, discordId))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "Membre introuvable." });
    return;
  }
  if (discordId === admin.discordId && role !== "ADMIN_PLUS") {
    res.status(400).json({ error: "Tu ne peux pas retirer ton propre accès Admin+." });
    return;
  }

  const [ownedTeam] = await db
    .select()
    .from(dreamTeamsTable)
    .where(
      and(
        eq(dreamTeamsTable.captainDiscordId, discordId),
        isNull(dreamTeamsTable.archivedAt),
      ),
    )
    .limit(1);
  if (ownedTeam && role !== "CAPTAIN") {
    res.status(400).json({
      error: "Archive l’équipe du capitaine avant de lui retirer ce rôle.",
    });
    return;
  }
  if (role === "CAPTAIN" && target.role !== "CAPTAIN" && target.teamId) {
    res.status(400).json({
      error: "Retire d’abord ce membre de son équipe actuelle.",
    });
    return;
  }

  let createdTeamId: string | null = null;
  if (role === "CAPTAIN" && target.role !== "CAPTAIN") {
    const teamName = `Team ${target.username}`.slice(0, 32);
    const created = await db.transaction(async (tx) => {
      await tx
        .update(dreamUsersTable)
        .set({ role, updatedAt: new Date() })
        .where(eq(dreamUsersTable.discordId, discordId));
      const [team] = await tx
        .insert(dreamTeamsTable)
        .values({
          name: teamName,
          captainDiscordId: discordId,
          joinCode: randomJoinCode(),
        })
        .returning();
      await tx
        .update(dreamUsersTable)
        .set({ teamId: team.id, updatedAt: new Date() })
        .where(eq(dreamUsersTable.discordId, discordId));
      return team;
    });
    createdTeamId = created.id;
    await updateActiveVoiceTeam(discordId, created.id);
  } else {
    await db
      .update(dreamUsersTable)
      .set({ role, updatedAt: new Date() })
      .where(eq(dreamUsersTable.discordId, discordId));
  }
  await writeAudit(admin.discordId, "member.role.update", {
    targetDiscordId: discordId,
    targetTeamId: createdTeamId,
    details: { role },
  });
  const challenge = await getLatestChallenge();
  const updated = (await getMembersForChallenge(challenge)).find(
    (member) => member.discordId === discordId,
  );
  if (!updated) {
    res.status(404).json({ error: "Membre introuvable après la mise à jour." });
    return;
  }
  res.json(UpdateMemberRoleResponse.parse(updated));
});

router.get("/admin/teams", async (req, res): Promise<void> => {
  if (!requireSiteAdmin(req, res)) return;
  const dashboard = await getDreamTeamDashboard();
  const teams = await db.select({ id: dreamTeamsTable.id, joinCode: dreamTeamsTable.joinCode }).from(dreamTeamsTable).where(isNull(dreamTeamsTable.archivedAt));
  const codes = new Map(teams.map((team) => [team.id, team.joinCode]));
  res.json(ListAdminTeamsResponse.parse(dashboard.leaderboard.map((team) => ({ ...team, joinCode: codes.get(team.id) }))));
});

router.patch("/admin/teams/:teamId", async (req, res): Promise<void> => {
  const admin = requireSiteAdmin(req, res);
  if (!admin) return;
  const params = UpdateAdminTeamParams.safeParse(req.params);
  const body = UpdateAdminTeamBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (body.data.joinCode) {
    const [duplicate] = await db.select({ id: dreamTeamsTable.id }).from(dreamTeamsTable).where(eq(dreamTeamsTable.joinCode, body.data.joinCode.trim().toUpperCase())).limit(1);
    if (duplicate && duplicate.id !== params.data.teamId) {
      res.status(409).json({ error: "Ce code est déjà utilisé." });
      return;
    }
  }
  const [team] = await db
    .update(dreamTeamsTable)
    .set({ name: body.data.name.trim(), ...(body.data.joinCode ? { joinCode: body.data.joinCode.trim().toUpperCase() } : {}) })
    .where(
      and(
        eq(dreamTeamsTable.id, params.data.teamId),
        isNull(dreamTeamsTable.archivedAt),
      ),
    )
    .returning();
  if (!team) {
    res.status(404).json({ error: "Équipe introuvable." });
    return;
  }
  await writeAudit(admin.discordId, "team.admin.rename", {
    targetTeamId: team.id,
    details: { name: team.name },
  });
  res.json(UpdateAdminTeamResponse.parse(teamToDto(team, false)));
});

router.delete("/admin/teams/:teamId", async (req, res): Promise<void> => {
  const admin = requireSiteAdmin(req, res);
  if (!admin) return;
  const params = ArchiveAdminTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const team = await getTeamById(params.data.teamId);
  if (!team) {
    res.status(404).json({ error: "Équipe introuvable." });
    return;
  }
  const members = await db
    .select({ discordId: dreamUsersTable.discordId })
    .from(dreamUsersTable)
    .where(eq(dreamUsersTable.teamId, team.id));
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(dreamTeamsTable)
      .set({ archivedAt: now })
      .where(eq(dreamTeamsTable.id, team.id));
    await tx
      .update(dreamUsersTable)
      .set({
        teamId: null,
        role: sql`CASE WHEN ${dreamUsersTable.discordId} = ${team.captainDiscordId} THEN 'MEMBER' ELSE ${dreamUsersTable.role} END`,
        updatedAt: now,
      })
      .where(eq(dreamUsersTable.teamId, team.id));
  });
  for (const member of members) {
    await updateActiveVoiceTeam(member.discordId, null);
  }
  await writeAudit(admin.discordId, "team.archive", {
    targetTeamId: team.id,
    details: { name: team.name },
  });
  res.status(204).end();
});

router.post("/admin/teams/:teamId/members", async (req, res): Promise<void> => {
  const admin = requireSiteAdmin(req, res);
  if (!admin) return;
  const params = AddAdminTeamMemberParams.safeParse(req.params);
  const body = AddAdminTeamMemberBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const team = await getTeamById(params.data.teamId);
  if (!team) {
    res.status(404).json({ error: "Équipe introuvable." });
    return;
  }
  const [member] = await db
    .select()
    .from(dreamUsersTable)
    .where(eq(dreamUsersTable.discordId, body.data.discordId))
    .limit(1);
  if (!member) {
    res.status(404).json({ error: "Ce membre doit d’abord se connecter au site." });
    return;
  }
  if (member.role !== "MEMBER") {
    res.status(400).json({ error: "Un capitaine ou Admin+ ne peut pas rejoindre cette équipe." });
    return;
  }
  if (member.teamId && member.teamId !== team.id) {
    res.status(400).json({ error: "Ce membre appartient déjà à une autre équipe." });
    return;
  }
  const [added] = await db
    .update(dreamUsersTable)
    .set({ teamId: team.id, updatedAt: new Date() })
    .where(
      and(
        eq(dreamUsersTable.discordId, member.discordId),
        or(
          isNull(dreamUsersTable.teamId),
          eq(dreamUsersTable.teamId, team.id),
        ),
      ),
    )
    .returning({ discordId: dreamUsersTable.discordId });
  if (!added) {
    res.status(400).json({ error: "Ce membre a rejoint une autre équipe entre-temps." });
    return;
  }
  await updateActiveVoiceTeam(member.discordId, team.id);
  await writeAudit(admin.discordId, "team.member.add", {
    targetDiscordId: member.discordId,
    targetTeamId: team.id,
  });
  const challenge = await getLatestChallenge();
  const updated = (await getMembersForChallenge(challenge)).find(
    (candidate) => candidate.discordId === member.discordId,
  );
  if (!updated) {
    res.status(404).json({ error: "Membre introuvable après la mise à jour." });
    return;
  }
  res.json(AddAdminTeamMemberResponse.parse(updated));
});

router.delete(
  "/admin/teams/:teamId/members/:discordId",
  async (req, res): Promise<void> => {
    const admin = requireSiteAdmin(req, res);
    if (!admin) return;
    const params = RemoveAdminTeamMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [removed] = await db
      .update(dreamUsersTable)
      .set({ teamId: null, updatedAt: new Date() })
      .where(
        and(
          eq(dreamUsersTable.discordId, params.data.discordId),
          eq(dreamUsersTable.teamId, params.data.teamId),
        ),
      )
      .returning({ discordId: dreamUsersTable.discordId });
    if (!removed) {
      res.status(404).json({ error: "Membre introuvable dans cette équipe." });
      return;
    }
    await updateActiveVoiceTeam(removed.discordId, null);
    await writeAudit(admin.discordId, "team.member.remove", {
      targetDiscordId: removed.discordId,
      targetTeamId: params.data.teamId,
    });
    res.status(204).end();
  },
);

router.get("/admin/challenges", async (req, res): Promise<void> => {
  if (!requireSiteAdmin(req, res)) return;
  await getLatestChallenge();
  const rows = await db
    .select()
    .from(dreamChallengesTable)
    .orderBy(desc(dreamChallengesTable.startsAt));
  res.json(ListAdminChallengesResponse.parse(rows.map(challengeToDto)));
});

router.post("/admin/challenges", async (req, res): Promise<void> => {
  const admin = requireAdminPlus(req, res);
  if (!admin) return;
  const body = CreateAdminChallengeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  await getLatestChallenge();
  const now = new Date();
  const active = await db
    .select({ id: dreamChallengesTable.id })
    .from(dreamChallengesTable)
    .where(
      and(
        eq(dreamChallengesTable.status, "ACTIVE"),
        gt(dreamChallengesTable.endsAt, now),
      ),
    )
    .limit(1);
  if (active.length > 0) {
    res.status(400).json({
      error: "Le défi en cours doit se terminer avant d’en créer un nouveau.",
    });
    return;
  }
  const [challenge] = await db
    .insert(dreamChallengesTable)
    .values({
      title: body.data.title.trim(),
      reward: body.data.reward.trim(),
      startsAt: now,
      endsAt: new Date(now.getTime() + WEEK_MS),
      status: "ACTIVE",
      drawStatus: "PENDING",
      createdByDiscordId: admin.discordId,
    })
    .returning();
  await writeAudit(admin.discordId, "challenge.create", {
    details: {
      challengeId: challenge.id,
      title: challenge.title,
      endsAt: challenge.endsAt.toISOString(),
    },
  });
  res
    .status(201)
    .json(CreateAdminChallengeResponse.parse(challengeToDto(challenge)));
});

export default router;
