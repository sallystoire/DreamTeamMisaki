import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const express = require("express");
const cookieParser = require("cookie-parser");

async function withOAuth(env, run) {
  const mocks = {
    "@workspace/db": "export const db={};export const dreamAuthSessionsTable={};export const dreamUsersTable={};",
    "../middlewares/dreamteam-auth": 'export const configuredAdminIds=()=>new Set();export const hashSessionToken=x=>x;',
    "../lib/voiceBot": "export const syncMemberVoiceState=async()=>{};",
  };
  const output = await build({
    entryPoints: [fileURLToPath(new URL("../src/routes/auth.ts", import.meta.url))],
    bundle: true, write: false, format: "cjs", platform: "node", packages: "external",
    define: { "process.env": JSON.stringify(env) },
    plugins: [{ name: "boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }],
  });
  const directory = fileURLToPath(new URL(".", import.meta.url));
  const compiled = new Module(`${directory}/oauth-route-fixture.cjs`);
  compiled.paths = Module._nodeModulePaths(directory);
  compiled._compile(output.outputFiles[0].text, `${directory}/oauth-route-fixture.cjs`);
  const app = express();
  app.set("trust proxy", 1);
  app.use(cookieParser());
  app.use("/api", compiled.exports.default);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const fixtureEnv = {
  NODE_ENV: "production",
  RAILWAY_PUBLIC_DOMAIN: "dreamteammisaki.up.railway.app",
  DISCORD_CLIENT_ID: "1561196644601438330",
  DISCORD_CLIENT_SECRET: "not-a-real-secret",
  DISCORD_MISAKI_GUILD_ID: "758391511338844221",
};

test("Railway Discord login redirects to the correct application and callback with a secure state cookie", async () => {
  await withOAuth(fixtureEnv, async base => {
    const response = await fetch(`${base}/api/auth/discord/login`, { redirect: "manual", headers: { "X-Forwarded-Proto": "https" } });
    assert.equal(response.status, 302);
    const redirect = new URL(response.headers.get("location"));
    assert.equal(redirect.origin, "https://discord.com");
    assert.equal(redirect.searchParams.get("client_id"), fixtureEnv.DISCORD_CLIENT_ID);
    assert.equal(redirect.searchParams.get("redirect_uri"), "https://dreamteammisaki.up.railway.app/api/auth/discord/callback");
    assert.equal(redirect.searchParams.get("scope"), "identify guilds");
    assert.ok(redirect.searchParams.get("state").length >= 32);
    assert.match(response.headers.get("set-cookie"), /HttpOnly/);
    assert.match(response.headers.get("set-cookie"), /Secure/);
    assert.match(response.headers.get("set-cookie"), /SameSite=Lax/);
    const rejected = await fetch(`${base}/api/auth/discord/callback?code=fixture&state=${encodeURIComponent("é")}`, {
      redirect: "manual", headers: { Cookie: "dreamteam_oauth_state=a" },
    });
    assert.equal(rejected.status, 302);
    assert.equal(rejected.headers.get("location"), "/?auth=cancelled");
  });
});

test("missing Railway OAuth secrets are reported by name before redirecting to Discord", async () => {
  await withOAuth({ ...fixtureEnv, DISCORD_CLIENT_SECRET: "" }, async base => {
    const response = await fetch(`${base}/api/auth/discord/login`, { redirect: "manual" });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /DISCORD_CLIENT_SECRET/);
    assert.equal(response.headers.get("location"), null);
  });
});
