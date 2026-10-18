import { test } from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { MessageFlags, Collection } = require("discord.js");

async function loadCommand() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../src/lib/joinTeamCommand.ts", import.meta.url))],
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
    plugins: [{ name: "boundaries", setup(builder) {
      builder.onResolve({ filter: /\/teamMembership$/ }, () => ({ path: "membership", namespace: "mock" }));
      builder.onResolve({ filter: /\/logger$/ }, () => ({ path: "logger", namespace: "mock" }));
      builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ loader: "js", contents: args.path === "logger"
        ? "export const logger={info(){},error(){}};"
        : `export class MembershipError extends Error {}
           export async function joinTeamByCode(identity,code){
             globalThis.__joinInput={identity,code};
             if(code==="INVALID")throw new MembershipError("Code invalide");
             return {name:"Fixture Sakura"};
           }` }));
    } }],
  });
  const directory = fileURLToPath(new URL(".", import.meta.url));
  const module = new Module(`${directory}/compiled.cjs`);
  module.paths = Module._nodeModulePaths(directory);
  module._compile(result.outputFiles[0].text, `${directory}/compiled.cjs`);
  return module.exports;
}

test("/jointeam trusts the signed Discord identity, replies privately and reports code errors", async () => {
  const { handleJoinTeamInteraction, joinTeamCommandDefinition } = await loadCommand();
  assert.equal(joinTeamCommandDefinition.toJSON().options[0].name, "code");
  assert.equal(joinTeamCommandDefinition.toJSON().options[0].required, true);
  async function run(guildId = "main", code = "VALID-CODE") {
    const seen = {};
    const interaction = {
      guildId, commandName: "jointeam", deferred: false,
      isChatInputCommand: () => true,
      user: { id: "fixture-id", globalName: "Fixture", username: "fixture", displayAvatarURL: () => "https://example.com/avatar.png" },
      options: { getString: () => code },
      deferReply: async value => { seen.defer = value; interaction.deferred = true; },
      editReply: async value => { seen.edit = value; },
      reply: async value => { seen.reply = value; },
    };
    await handleJoinTeamInteraction(interaction, "main");
    return seen;
  }
  try {
    const ok = await run();
    assert.equal(ok.defer.flags, MessageFlags.Ephemeral);
    assert.equal(globalThis.__joinInput.identity.discordId, "fixture-id");
    assert.equal(globalThis.__joinInput.code, "VALID-CODE");
    assert.match(ok.edit.content, /Fixture Sakura/);
    assert.ok(!ok.edit.content.includes("VALID-CODE"));
    assert.deepEqual(ok.edit.allowedMentions, { parse: [] });
    assert.match((await run("main", "INVALID")).edit.content, /Code invalide/);
    assert.equal((await run("recruitment")).reply.flags, MessageFlags.Ephemeral);
  } finally { delete globalThis.__joinInput; }
});

test("/jointeam registration does not replace unrelated commands", async () => {
  const { registerJoinTeamCommand } = await loadCommand();
  const commands = new Collection([["other-id", { id: "other-id", name: "team", type: 1 }]]);
  let created;
  const client = { guilds: { fetch: async () => ({ commands: {
    fetch: async () => commands, create: async definition => { created = definition; },
  } }) } };
  await registerJoinTeamCommand(client, "main");
  assert.equal(created.name, "jointeam");
  assert.ok(commands.has("other-id"));
});
