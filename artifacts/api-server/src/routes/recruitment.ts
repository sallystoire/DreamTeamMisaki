import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, captainApplicationsTable } from "@workspace/db";
import { SubmitCaptainApplicationBody, GetCaptainApplicationResponse } from "@workspace/api-zod";
import { requireDreamteamUser } from "../middlewares/dreamteam-auth";
import { deliverCaptainApplication, recruitmentInvite } from "../lib/recruitment";

const router: IRouter = Router();
function statusDto(row?: typeof captainApplicationsTable.$inferSelect) {
  return GetCaptainApplicationResponse.parse({
    status: row?.status ?? "NONE", inviteUrl: recruitmentInvite,
    channelUrl: row?.status === "SENT" && row.guildId && row.channelId
      ? `https://discord.com/channels/${row.guildId}/${row.channelId}` : null,
    ...(row?.status === "FAILED" ? { answers: row.answers } : {}),
  });
}

router.get("/captain/application", async (req, res): Promise<void> => {
  const user = requireDreamteamUser(req, res);
  if (!user) return;
  const [row] = await db.select().from(captainApplicationsTable).where(eq(captainApplicationsTable.discordId, user.discordId));
  res.json(statusDto(row));
});

router.post("/captain/application", async (req, res): Promise<void> => {
  const user = requireDreamteamUser(req, res);
  if (!user) return;
  const parsed = SubmitCaptainApplicationBody.safeParse(req.body);
  if (!parsed.success || !Object.values(parsed.data).every(v => typeof v !== "string" || v.trim().length > 0)) {
    res.status(400).json({ error: "Vérifie tous les champs de la candidature (âge minimum : 13 ans)." }); return;
  }
  if (parsed.data.discordId !== user.discordId) {
    res.status(400).json({ error: "L’identifiant doit correspondre à ton compte Discord connecté." }); return;
  }
  const outcome = await db.transaction(async tx => {
    await tx.insert(captainApplicationsTable).values({ discordId: user.discordId, answers: parsed.data }).onConflictDoNothing();
    const [row] = await tx.select().from(captainApplicationsTable)
      .where(eq(captainApplicationsTable.discordId, user.discordId)).for("update");
    if (row.status === "SENT") return { code: 200, body: statusDto(row) };
    if (row.status === "FAILED" && Date.now() - row.updatedAt.getTime() < 30000) {
      return { code: 429, body: { error: "Patiente 30 secondes avant de réessayer. Ta candidature est conservée." } };
    }
    await tx.update(captainApplicationsTable).set({ answers: parsed.data, status: "PENDING", updatedAt: new Date() })
      .where(eq(captainApplicationsTable.discordId, user.discordId));
    try {
      const delivery = await deliverCaptainApplication(user.discordId, parsed.data);
      const [saved] = await tx.update(captainApplicationsTable)
        .set({ ...delivery, status: "SENT", updatedAt: new Date() })
        .where(eq(captainApplicationsTable.discordId, user.discordId)).returning();
      return { code: 200, body: statusDto(saved) };
    } catch (error) {
      req.log.error({ err: error }, "Captain application Discord delivery failed");
      await tx.update(captainApplicationsTable).set({ status: "FAILED", updatedAt: new Date() })
        .where(eq(captainApplicationsTable.discordId, user.discordId));
      return { code: 503, body: { error: "Candidature enregistrée, mais non transmise à Discord. Le bot doit être connecté au serveur recrutement et pouvoir créer des salons. Réessaie plus tard." } };
    }
  });
  res.status(outcome.code).json(outcome.body);
});

export default router;
