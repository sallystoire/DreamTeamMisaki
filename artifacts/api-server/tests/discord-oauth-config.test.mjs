import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import Module from "node:module";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/lib/discordOAuthConfig.ts", import.meta.url))],
  bundle: true, write: false, format: "cjs", platform: "node",
});
const compiled = new Module("oauth-config.cjs");
compiled._compile(bundle.outputFiles[0].text, "oauth-config.cjs");
const { discordRedirectUri } = compiled.exports;

test("Railway OAuth uses its public domain and never a Replit development callback in production", () => {
  assert.equal(discordRedirectUri({ NODE_ENV: "production", RAILWAY_PUBLIC_DOMAIN: "dreamteammisaki.up.railway.app", REPLIT_DEV_DOMAIN: "dev.example.com" }),
    "https://dreamteammisaki.up.railway.app/api/auth/discord/callback");
  assert.equal(discordRedirectUri({ NODE_ENV: "production", REPLIT_DEV_DOMAIN: "dev.example.com" }), null);
  assert.equal(discordRedirectUri({ NODE_ENV: "development", REPLIT_DEV_DOMAIN: "dev.example.com" }), "https://dev.example.com/api/auth/discord/callback");
});

test("explicit OAuth callbacks take precedence and malformed or insecure production values fail", () => {
  const callback = "https://example.com/api/auth/discord/callback";
  assert.equal(discordRedirectUri({ NODE_ENV: "production", DISCORD_REDIRECT_URI: ` ${callback} `, RAILWAY_PUBLIC_DOMAIN: "other.example.com" }), callback);
  for (const value of ["invalid", "http://example.com/api/auth/discord/callback", "https://example.com/wrong-path", "https://user:pass@example.com/api/auth/discord/callback", `${callback}?extra=1`]) {
    assert.equal(discordRedirectUri({ NODE_ENV: "production", DISCORD_REDIRECT_URI: value }), null);
  }
});
