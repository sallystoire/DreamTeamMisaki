import { randomBytes, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { misakiGuildId } from "../lib/discordConfig";
import { eq } from "drizzle-orm";
import {
  db,
  dreamAuthSessionsTable,
  dreamUsersTable,
} from "@workspace/db";
import {
  configuredAdminIds,
  hashSessionToken,
} from "../middlewares/dreamteam-auth";
import { syncMemberVoiceState } from "../lib/voiceBot";

const router: IRouter = Router();
const SESSION_COOKIE = "dreamteam_session";
const STATE_COOKIE = "dreamteam_oauth_state";
const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_DURATION_MS = 10 * 60 * 1000;

type DiscordProfile = {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
};

type DiscordGuild = { id: string };

function cookieOptions(req: Request, maxAge: number) {
  return {
    httpOnly: true,
    secure: req.secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function redirectUri(): string | null {
  const configured = process.env.DISCORD_REDIRECT_URI?.trim();
  if (configured) return configured;
  const developmentDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (developmentDomain) {
    const host = developmentDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return `https://${host}/api/auth/discord/callback`;
  }
  return null;
}

function clearAuthCookies(
  req: Request,
  res: Response,
): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions(req, 0));
  res.clearCookie(STATE_COOKIE, cookieOptions(req, 0));
}

router.get("/auth/discord/login", (req, res): void => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const callbackUrl = redirectUri();
  if (!clientId || !callbackUrl) {
    res.status(503).json({
      error:
        "La connexion Discord n’est pas configurée. Il manque l’identifiant de l’application ou son URL de retour.",
    });
    return;
  }

  const state = randomBytes(32).toString("base64url");
  res.cookie(STATE_COOKIE, state, cookieOptions(req, OAUTH_STATE_DURATION_MS));
  const authorizationUrl = new URL("https://discord.com/oauth2/authorize");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("redirect_uri", callbackUrl);
  authorizationUrl.searchParams.set("scope", "identify guilds");
  authorizationUrl.searchParams.set("state", state);
  res.redirect(authorizationUrl.toString());
});

router.get("/auth/discord/callback", async (req, res): Promise<void> => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const returnedState =
    typeof req.query.state === "string" ? req.query.state : null;
  const storedState = req.cookies?.[STATE_COOKIE];
  const callbackUrl = redirectUri();
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const guildId = misakiGuildId();

  res.clearCookie(STATE_COOKIE, cookieOptions(req, 0));
  if (
    !code ||
    !returnedState ||
    typeof storedState !== "string" ||
    returnedState.length !== storedState.length ||
    !timingSafeEqual(Buffer.from(returnedState), Buffer.from(storedState))
  ) {
    res.redirect("/?auth=cancelled");
    return;
  }
  if (!callbackUrl || !clientId || !clientSecret || !guildId) {
    res.status(503).json({
      error:
        "La connexion Discord est incomplète. Vérifie les paramètres de l’application et du serveur.",
    });
    return;
  }

  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUrl,
      }),
    });
    if (!tokenResponse.ok) {
      req.log.warn({ status: tokenResponse.status }, "Discord OAuth token exchange failed");
      res.redirect("/?auth=failed");
      return;
    }

    const tokenPayload = (await tokenResponse.json()) as {
      access_token?: string;
      token_type?: string;
    };
    if (!tokenPayload.access_token) {
      res.redirect("/?auth=failed");
      return;
    }

    const discordHeaders = {
      Authorization: `${tokenPayload.token_type ?? "Bearer"} ${tokenPayload.access_token}`,
    };
    const [profileResponse, guildsResponse] = await Promise.all([
      fetch("https://discord.com/api/users/@me", { headers: discordHeaders }),
      fetch("https://discord.com/api/users/@me/guilds", {
        headers: discordHeaders,
      }),
    ]);
    if (!profileResponse.ok || !guildsResponse.ok) {
      req.log.warn(
        {
          profileStatus: profileResponse.status,
          guildsStatus: guildsResponse.status,
        },
        "Discord profile lookup failed",
      );
      res.redirect("/?auth=failed");
      return;
    }

    const profile = (await profileResponse.json()) as DiscordProfile;
    const guilds = (await guildsResponse.json()) as DiscordGuild[];
    if (!/^[0-9]{17,20}$/.test(profile.id)) {
      res.redirect("/?auth=failed");
      return;
    }
    if (!guilds.some((guild) => guild.id === guildId)) {
      res.redirect("/?auth=server-required");
      return;
    }

    const now = new Date();
    const existing = await db
      .select({ role: dreamUsersTable.role })
      .from(dreamUsersTable)
      .where(eq(dreamUsersTable.discordId, profile.id))
      .limit(1);
    const isConfiguredAdmin = configuredAdminIds().has(profile.id);
    const role = isConfiguredAdmin
      ? "ADMIN_PLUS"
      : (existing[0]?.role ?? "MEMBER");
    const avatarUrl = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${profile.avatar.startsWith("a_") ? "gif" : "png"}?size=128`
      : null;
    const username = profile.global_name?.trim() || profile.username;

    await db
      .insert(dreamUsersTable)
      .values({
        discordId: profile.id,
        username,
        avatarUrl,
        role,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: dreamUsersTable.discordId,
        set: {
          username,
          avatarUrl,
          updatedAt: now,
          ...(isConfiguredAdmin ? { role: "ADMIN_PLUS" } : {}),
        },
      });

    const rawSessionToken = randomBytes(32).toString("hex");
    await db.insert(dreamAuthSessionsTable).values({
      tokenHash: hashSessionToken(rawSessionToken),
      discordId: profile.id,
      expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
    });
    res.cookie(
      SESSION_COOKIE,
      rawSessionToken,
      cookieOptions(req, SESSION_DURATION_MS),
    );
    void syncMemberVoiceState(profile.id).catch((error: unknown) => {
      req.log.warn(
        { message: error instanceof Error ? error.message : "unknown error" },
        "Could not sync voice state after Discord sign-in",
      );
    });
    res.redirect("/");
  } catch (error) {
    req.log.error(
      { message: error instanceof Error ? error.message : "unknown error" },
      "Discord sign-in failed",
    );
    res.redirect("/?auth=failed");
  }
});

router.get("/auth/user", (req, res): void => {
  if (!req.dreamUser) {
    res.json({ user: null });
    return;
  }
  res.json({
    user: {
      id: req.dreamUser.discordId,
      discordId: req.dreamUser.discordId,
      username: req.dreamUser.username,
      displayName: req.dreamUser.username,
      avatarUrl: req.dreamUser.avatarUrl,
      role: req.dreamUser.role,
    },
  });
});

router.get("/auth/logout", async (req, res): Promise<void> => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string") {
    await db
      .delete(dreamAuthSessionsTable)
      .where(eq(dreamAuthSessionsTable.tokenHash, hashSessionToken(token)));
  }
  clearAuthCookies(req, res);
  res.redirect("/");
});

export default router;
