import { and, eq, isNull } from "drizzle-orm";
import { db, dreamAuditLogTable, dreamTeamsTable, dreamUsersTable } from "@workspace/db";
import { configuredAdminIds } from "../middlewares/dreamteam-auth";
import { updateActiveVoiceTeam } from "./voiceBot";
import { logger } from "./logger";

export class MembershipError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Shared by authenticated web requests and signed Discord interactions. */
export async function joinTeamByCode(
  identity: { discordId: string; username?: string; avatarUrl?: string | null },
  rawCode: string,
) {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,32}$/.test(code)) throw new MembershipError("Le code doit contenir entre 4 et 32 lettres, chiffres ou tirets.");
  const team = await db.transaction(async tx => {
    // Lock team before member, matching archive's update order.
    const [target] = await tx.select().from(dreamTeamsTable).where(and(
      eq(dreamTeamsTable.joinCode, code), isNull(dreamTeamsTable.archivedAt),
    )).limit(1).for("update");
    if (!target) throw new MembershipError("Ce code d’équipe est invalide ou expiré.");
    if (identity.username) {
      await tx.insert(dreamUsersTable).values({
        discordId: identity.discordId, username: identity.username,
        avatarUrl: identity.avatarUrl ?? null,
        role: configuredAdminIds().has(identity.discordId) ? "ADMIN_PLUS" : "MEMBER",
      }).onConflictDoUpdate({
        target: dreamUsersTable.discordId,
        set: { username: identity.username, avatarUrl: identity.avatarUrl ?? null, updatedAt: new Date() },
      });
    }
    const [member] = await tx.select().from(dreamUsersTable)
      .where(eq(dreamUsersTable.discordId, identity.discordId)).limit(1).for("update");
    if (!member) throw new MembershipError("Connecte-toi avec Discord pour continuer.", 401);
    if (member.teamId === target.id) return target;
    if (member.teamId) throw new MembershipError("Tu appartiens déjà à une autre équipe.", 409);
    if (member.role === "CAPTAIN") throw new MembershipError("Un capitaine ne peut pas rejoindre l’équipe d’un autre capitaine.", 403);
    await tx.update(dreamUsersTable).set({ teamId: target.id, updatedAt: new Date() })
      .where(eq(dreamUsersTable.discordId, identity.discordId));
    await tx.insert(dreamAuditLogTable).values({
      actorDiscordId: identity.discordId, action: "team.join",
      targetDiscordId: identity.discordId, targetTeamId: target.id,
    });
    return target;
  });
  try {
    await updateActiveVoiceTeam(identity.discordId, team.id);
  } catch (error) {
    // Membership has committed. Do not misreport it as an unsuccessful join.
    logger.error({ err: error }, "Team joined, but immediate voice state sync failed");
  }
  return team;
}
