import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, dreamTeamsTable, dreamUsersTable, dreamChallengesTable, dreamAuditLogTable } from "@workspace/db";
import {
  CreateAdminTeamBody, CreateAdminTeamResponse,
  UpdateAdminChallengeRewardParams, UpdateAdminChallengeRewardBody,
  UpdateAdminChallengeRewardResponse, ClearAdminChallengeRewardParams,
  ClearAdminChallengeRewardResponse,
} from "@workspace/api-zod";
import { requireAdminPlus, configuredAdminIds } from "../middlewares/dreamteam-auth";
import { challengeToDto } from "../lib/challengeService";
import { MembershipError } from "../lib/teamMembership";
import { updateActiveVoiceTeam } from "../lib/voiceBot";

const router: IRouter = Router();

router.post("/admin/teams", async (req, res): Promise<void> => {
  const admin = requireAdminPlus(req, res);
  if (!admin) return;
  const parsed = CreateAdminTeamBody.safeParse(req.body);
  if (!parsed.success || parsed.data.name.trim().length < 2) {
    res.status(400).json({ error: "Indique un nom d’équipe de 2 à 32 caractères et un capitaine valide." }); return;
  }
  const captainId = parsed.data.captainDiscordId ?? admin.discordId;
  try {
    const team = await db.transaction(async tx => {
      const [captain] = await tx.select().from(dreamUsersTable)
        .where(eq(dreamUsersTable.discordId, captainId)).limit(1).for("update");
      if (!captain) throw new MembershipError("Le capitaine doit d’abord se connecter au site.", 404);
      if (captain.teamId) throw new MembershipError("Ce capitaine appartient déjà à une équipe.", 409);
      const [created] = await tx.insert(dreamTeamsTable).values({
        name: parsed.data.name.trim(), captainDiscordId: captainId,
        joinCode: parsed.data.joinCode?.trim().toUpperCase() ?? `MISAKI-${randomBytes(5).toString("hex").toUpperCase()}`,
      }).returning();
      const role = configuredAdminIds().has(captainId) ? "ADMIN_PLUS"
        : ["ADMIN_PLUS", "ADMIN"].includes(captain.role) ? captain.role : "CAPTAIN";
      await tx.update(dreamUsersTable).set({ teamId: created.id, role, updatedAt: new Date() })
        .where(eq(dreamUsersTable.discordId, captainId));
      await tx.insert(dreamAuditLogTable).values({
        actorDiscordId: admin.discordId, action: "team.create", targetDiscordId: captainId,
        targetTeamId: created.id, details: { name: created.name },
      });
      return created;
    });
    try { await updateActiveVoiceTeam(captainId, team.id); }
    catch (error) { req.log.error({ err: error }, "Team created but voice sync failed"); }
    res.status(201).json(CreateAdminTeamResponse.parse({ ...team, createdAt: team.createdAt.toISOString() }));
  } catch (error) {
    if (error instanceof MembershipError) { res.status(error.status).json({ error: error.message }); return; }
    const code = (error as { code?: string; cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
    if (code === "23505") {
      res.status(409).json({ error: "Ce code est déjà utilisé ou ce capitaine possède déjà une équipe." }); return;
    }
    throw error;
  }
});

async function saveReward(challengeId: string, reward: string, actorDiscordId: string) {
  return db.transaction(async tx => {
    const [previous] = await tx.select().from(dreamChallengesTable)
      .where(eq(dreamChallengesTable.id, challengeId)).limit(1).for("update");
    if (!previous) return null;
    const [updated] = await tx.update(dreamChallengesTable).set({ reward })
      .where(eq(dreamChallengesTable.id, challengeId)).returning();
    await tx.insert(dreamAuditLogTable).values({
      actorDiscordId, action: reward ? "challenge.reward.update" : "challenge.reward.clear",
      details: { challengeId, previousReward: previous.reward, reward },
    });
    return updated;
  });
}

router.patch("/admin/challenges/:challengeId/reward", async (req, res): Promise<void> => {
  const admin = requireAdminPlus(req, res);
  if (!admin) return;
  const params = UpdateAdminChallengeRewardParams.safeParse(req.params);
  const body = UpdateAdminChallengeRewardBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Récompense invalide (120 caractères maximum)." }); return; }
  const challenge = await saveReward(params.data.challengeId, body.data.reward.trim(), admin.discordId);
  if (!challenge) { res.status(404).json({ error: "Défi introuvable." }); return; }
  res.json(UpdateAdminChallengeRewardResponse.parse(challengeToDto(challenge)));
});

router.delete("/admin/challenges/:challengeId/reward", async (req, res): Promise<void> => {
  const admin = requireAdminPlus(req, res);
  if (!admin) return;
  const params = ClearAdminChallengeRewardParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Défi invalide." }); return; }
  const challenge = await saveReward(params.data.challengeId, "", admin.discordId);
  if (!challenge) { res.status(404).json({ error: "Défi introuvable." }); return; }
  res.json(ClearAdminChallengeRewardResponse.parse(challengeToDto(challenge)));
});

export default router;
