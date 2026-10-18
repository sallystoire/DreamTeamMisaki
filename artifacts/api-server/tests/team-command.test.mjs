import { test } from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { MessageFlags, Collection } = require("discord.js");
const directory = fileURLToPath(new URL(".", import.meta.url));

async function load(file, mocks) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(file, import.meta.url))], bundle: true,
    write: false, platform: "node", format: "cjs", packages: "external",
    plugins: [{ name: "boundaries", setup(builder) {
      for (const pattern of Object.keys(mocks)) {
        builder.onResolve({ filter: new RegExp(pattern) }, () => ({ path: pattern, namespace: "mock" }));
      }
      builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }],
  });
  const module = new Module(`${directory}/compiled.cjs`);
  module.paths = Module._nodeModulePaths(directory);
  module._compile(result.outputFiles[0].text, `${directory}/compiled.cjs`);
  return module.exports;
}

const mocks = {
  "^@workspace/db$": `
    export const dreamTeamsTable={id:"teams",captainDiscordId:"captain",archivedAt:"archived"};
    export const dreamUsersTable={id:"users",teamId:"team",username:"username",discordId:"discordId"};
    export const db={select:()=>({from:table=>({where:()=>({
      limit:async()=>globalThis.__teamFixture.teams,
      orderBy:async()=>globalThis.__teamFixture.members
    })})})};
  `,
  "^drizzle-orm$": "export const eq=()=>null,and=()=>null,asc=()=>null,isNull=()=>null;",
  "\\./challengeService$": "export async function getDreamTeamDashboard(){return globalThis.__teamFixture.dashboard;}",
  "\\./logger$": "export const logger={info(){},error(){}};",
};
const roster = Array.from({ length: 34 }, (_, i) => ({ discordId: String(100000000000000000n + BigInt(i)), username: `Membre ${i}` }));
const view = { id: "team-one", name: "Sakura", joinCode: "SAKURA-26", members: roster, rank: 2, totalTeams: 5, finished: false, voiceHours: 42.5 };

test("/team includes name, rank, private code and all members across pages", async () => {
  const { buildTeamReply } = await load("../src/lib/teamCommand.ts", mocks);
  const replies = [0, 1, 2].map(page => buildTeamReply(view, "owner", page));
  assert.equal(replies[0].embeds[0].data.title, "Sakura");
  assert.ok(replies[0].embeds[0].data.fields.some(field => field.value === "SAKURA-26"));
  assert.ok(replies[0].embeds[0].data.fields.some(field => field.value === "#2 / 5"));
  const combined = replies.map(reply => reply.embeds[0].data.description).join("\n");
  for (const member of roster) assert.ok(combined.includes(member.discordId));
  assert.equal(replies[0].components[0].components[0].data.disabled, true);
  assert.equal(replies[2].components[0].components[1].data.disabled, true);
  assert.deepEqual(replies[0].allowedMentions, { parse: [] });
  const empty = buildTeamReply({ ...view, rank: null, members: [] }, "owner");
  assert.equal(empty.components.length, 0);
  assert.ok(empty.embeds[0].data.fields.some(field => field.value === "Aucun défi disponible"));
});

test("/team registration preserves unrelated commands and updates only team", async () => {
  const { registerTeamCommand } = await load("../src/lib/teamCommand.ts", mocks);
  let edited, created;
  const commands = new Collection([["other-id", { id: "other-id", name: "other", type: 1 }]]);
  const guild = { commands: {
    fetch: async () => commands,
    create: async data => { created = data; },
    edit: async (id, data) => { edited = { id, data }; },
  } };
  const client = { guilds: { fetch: async () => guild } };
  await registerTeamCommand(client, "guild");
  assert.equal(created.name, "team");
  commands.set("team-id", { id: "team-id", name: "team", type: 1 });
  created = null;
  await registerTeamCommand(client, "guild");
  assert.equal(edited.id, "team-id"); assert.equal(created, null);
  assert.ok(commands.has("other-id"));
});

test("/team is ephemeral, checks captain ownership and rejects other guilds/users", async () => {
  const { handleTeamInteraction } = await load("../src/lib/teamCommand.ts", mocks);
  globalThis.__teamFixture = {
    teams: [view], members: roster,
    dashboard: { challenge: { status: "ACTIVE" }, leaderboard: [{ id: "other", voiceHours: 55 }, { id: view.id, voiceHours: 42.5 }] },
  };
  const run = async ({ guildId = "guild", button = false, owner = "captain" } = {}) => {
    const seen = {};
    const interaction = {
      guildId, user: { id: "captain" }, commandName: "team", customId: `misaki:team:${owner}:1`,
      isChatInputCommand: () => !button, isButton: () => button,
      deferReply: async payload => { seen.defer = payload; },
      deferUpdate: async () => { seen.updated = true; },
      reply: async payload => { seen.reply = payload; },
      editReply: async payload => { seen.edit = payload; },
    };
    await handleTeamInteraction(interaction, "guild");
    return seen;
  };
  try {
    const normal = await run();
    assert.equal(normal.defer.flags, MessageFlags.Ephemeral);
    assert.equal(normal.edit.embeds[0].data.title, "Sakura");
    const next = await run({ button: true });
    assert.equal(next.updated, true);
    assert.ok(next.edit.embeds[0].data.footer.text.includes("Page 2/3"));
    assert.equal((await run({ guildId: "another" })).reply.flags, MessageFlags.Ephemeral);
    assert.equal((await run({ button: true, owner: "someone-else" })).reply.flags, MessageFlags.Ephemeral);
    globalThis.__teamFixture.teams = [];
    assert.match((await run()).edit.content, /pas capitaine/);
  } finally { delete globalThis.__teamFixture; }
});

test("both bootstrap Discord IDs get Admin+ even if their stored role is MEMBER", async () => {
  const { dreamteamAuth, requireAdminPlus } = await load("../src/middlewares/dreamteam-auth.ts", {
    "^@workspace/db$": `
      export const dreamUsersTable={}; export const dreamAuthSessionsTable={};
      export const db={select:()=>({from:()=>({innerJoin:()=>({where:()=>({limit:async()=>[globalThis.__authFixture]})})})})};
    `,
    "^drizzle-orm$": "export const eq=()=>null,and=()=>null,gt=()=>null;",
  });
  try {
    for (const id of ["989611084073799731", "1486784433167012123", "123456789012345678"]) {
      globalThis.__authFixture = { discordId: id, username: "Fixture", avatarUrl: null, role: "MEMBER" };
      const req = { cookies: { dreamteam_session: "fixture-only" }, log: { error() {} } };
      let code = 200;
      const res = { status(value) { code = value; return this; }, json() {} };
      await dreamteamAuth(req, res, () => {});
      const isBootstrap = id !== "123456789012345678";
      assert.equal(req.dreamUser.role, isBootstrap ? "ADMIN_PLUS" : "MEMBER");
      assert.equal(Boolean(requireAdminPlus(req, res)), isBootstrap);
      assert.equal(code, isBootstrap ? 200 : 403);
    }
  } finally { delete globalThis.__authFixture; }
});
