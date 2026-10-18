/** Only use configured/trusted platform domains, never an incoming Host header. */
export function discordRedirectUri(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.DISCORD_REDIRECT_URI?.trim();
  if (explicit) {
    try {
      const url = new URL(explicit);
      const localDevelopment = env.NODE_ENV !== "production" &&
        ["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol === "http:";
      if ((url.protocol !== "https:" && !localDevelopment) || url.username || url.password || url.search || url.hash ||
        url.pathname !== "/api/auth/discord/callback") return null;
      return url.toString();
    } catch { return null; }
  }
  const domain = env.RAILWAY_PUBLIC_DOMAIN?.trim() ||
    (env.NODE_ENV !== "production" ? env.REPLIT_DEV_DOMAIN?.trim() : undefined);
  if (!domain) return null;
  try {
    const base = new URL(`https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`);
    if (base.username || base.password || base.pathname !== "/" || base.search || base.hash) return null;
    return new URL("/api/auth/discord/callback", base).toString();
  } catch { return null; }
}
