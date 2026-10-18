import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import {
  db,
  dreamAuthSessionsTable,
  dreamUsersTable,
  type DreamSiteRole,
} from "@workspace/db";

export type DreamteamUser = {
  discordId: string;
  username: string;
  avatarUrl: string | null;
  role: DreamSiteRole;
};

declare global {
  namespace Express {
    interface Request {
      dreamUser?: DreamteamUser;
    }
  }
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function configuredAdminIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_DISCORD_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^[0-9]{17,20}$/.test(value)),
  );
}

export async function dreamteamAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.dreamteam_session;
  if (!token || typeof token !== "string" || token.length > 128) {
    next();
    return;
  }

  try {
    const [session] = await db
      .select({
        discordId: dreamUsersTable.discordId,
        username: dreamUsersTable.username,
        avatarUrl: dreamUsersTable.avatarUrl,
        role: dreamUsersTable.role,
      })
      .from(dreamAuthSessionsTable)
      .innerJoin(
        dreamUsersTable,
        eq(dreamUsersTable.discordId, dreamAuthSessionsTable.discordId),
      )
      .where(
        and(
          eq(dreamAuthSessionsTable.tokenHash, hashSessionToken(token)),
          gt(dreamAuthSessionsTable.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (session) {
      const role: DreamSiteRole = configuredAdminIds().has(session.discordId)
        ? "ADMIN_PLUS"
        : (session.role as DreamSiteRole);
      req.dreamUser = {
        discordId: session.discordId,
        username: session.username,
        avatarUrl: session.avatarUrl,
        role,
      };
    }
  } catch (error) {
    req.log.error(
      { message: error instanceof Error ? error.message : "unknown error" },
      "Could not load DreamTeam session",
    );
  }

  next();
}

export function requireDreamteamUser(
  req: Request,
  res: Response,
): DreamteamUser | null {
  if (!req.dreamUser) {
    res.status(401).json({ error: "Connecte-toi avec Discord pour continuer." });
    return null;
  }
  return req.dreamUser;
}

export function requireAdminPlus(
  req: Request,
  res: Response,
): DreamteamUser | null {
  const user = requireDreamteamUser(req, res);
  if (!user) return null;
  if (user.role !== "ADMIN_PLUS") {
    res.status(403).json({ error: "Accès réservé aux Admin+." });
    return null;
  }
  return user;
}
