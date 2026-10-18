import { test } from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { ChannelType, PermissionFlagsBits, PermissionsBitField, Collection, OverwriteType } = require("discord.js");
const directory = fileURLToPath(new URL(".", import.meta.url));

async function load(file, mocks = {}) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(file, import.meta.url))],
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
    plugins: [{
      name: "test-boundaries",
      setup(builder) {
        for (const [pattern, contents] of Object.entries(mocks)) {
          builder.onResolve({ filter: new RegExp(pattern) }, () => ({ path: pattern, namespace: "mock" }));
        }
        builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
      },
    }],
  });
  const module = new Module(`${directory}/compiled.cjs`);
  module.paths = Module._nodeModulePaths(directory);
  module._compile(result.outputFiles[0].text, `${directory}/compiled.cjs`);
  return module.exports;
}

test("public voice detection follows @everyone view/connect, excludes AFK, stage and private channels", async () => {
  const { isPublicVoiceChannel } = await load("../src/lib/publicVoice.ts");
  const guild = { afkChannelId: "afk", roles: { everyone: { id: "everyone" } } };
  const channel = {
    id: "voice", type: ChannelType.GuildVoice, guild,
    permissionsFor: () => new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]),
  };
  assert.equal(isPublicVoiceChannel(channel), true);
  assert.equal(isPublicVoiceChannel({ ...channel, permissionsFor: () => new PermissionsBitField([PermissionFlagsBits.ViewChannel]) }), false);
  assert.equal(isPublicVoiceChannel({ ...channel, permissionsFor: () => new PermissionsBitField([PermissionFlagsBits.Connect]) }), false);
  assert.equal(isPublicVoiceChannel({ ...channel, id: "afk" }), false);
  assert.equal(isPublicVoiceChannel({ ...channel, type: ChannelType.GuildStageVoice }), false);
  assert.equal(isPublicVoiceChannel(null), false);
});

test("recruitment creates one private channel, delivers all answers, and recovers without duplicates", async () => {
  const { deliverCaptainApplication } = await load("../src/lib/recruitment.ts", {
    "\\./voiceBot$": "export function getDiscordBot() { return globalThis.__recruitmentTestBot; }",
    "middlewares/dreamteam-auth$": "export function configuredAdminIds() { return new Set(['admin-id']); }",
  });
  let creates = 0, sends = 0, createOptions, sendOptions;
  const messages = new Collection();
  const channels = new Collection();
  const channel = {
    id: "channel-id", type: ChannelType.GuildText, topic: "misaki-captain:123456789012345678",
    permissionsFor: () => new PermissionsBitField(),
    messages: { fetch: async () => messages },
    send: async options => {
      sends++; sendOptions = options;
      const message = { id: "message-id", author: { id: "bot-id" }, embeds: options.embeds };
      messages.set(message.id, message);
      return message;
    },
  };
  const guild = {
    id: "guild-id", roles: { everyone: { id: "guild-id" } },
    channels: {
      fetch: async () => channels,
      create: async options => { creates++; createOptions = options; channels.set(channel.id, channel); return channel; },
    },
  };
  globalThis.__recruitmentTestBot = {
    isReady: () => true, user: { id: "bot-id" },
    fetchInvite: async url => { assert.equal(url, "https://discord.gg/CNKn4X4jJ"); return { guild }; },
    guilds: { fetch: async () => guild },
  };
  const answers = {
    discordUsername: "Étoile Discord", discordId: "123456789012345678", age: 21,
    availability: "Semaine et week-end", motivation: "Motivation test",
    staffManagement: "Encadrer le staff", experience: "Expérience test",
    voiceHours: 15, misakiRoles: "Équipier",
  };
  try {
    const first = await deliverCaptainApplication(answers.discordId, answers);
    const second = await deliverCaptainApplication(answers.discordId, answers);
    assert.deepEqual(first, second);
    assert.equal(creates, 1); assert.equal(sends, 1);
    assert.equal(createOptions.name, "etoile-discord");
    assert.ok(createOptions.permissionOverwrites.some(o => o.id === guild.id && o.deny.includes(PermissionFlagsBits.ViewChannel)));
    assert.ok(createOptions.permissionOverwrites.some(o => o.id === answers.discordId && o.type === OverwriteType.Member));
    assert.equal(sendOptions.embeds[0].fields.length, 9);
    assert.deepEqual(sendOptions.allowedMentions, { parse: [] });
    // Interrupted after creating channel but before delivering message: reuse it.
    messages.clear();
    await deliverCaptainApplication(answers.discordId, answers);
    assert.equal(creates, 1); assert.equal(sends, 2);
    channel.permissionsFor = () => new PermissionsBitField([PermissionFlagsBits.ViewChannel]);
    await assert.rejects(deliverCaptainApplication(answers.discordId, answers), /must be private/);
    globalThis.__recruitmentTestBot = undefined;
    await assert.rejects(deliverCaptainApplication(answers.discordId, answers), /not connected/);
  } finally {
    delete globalThis.__recruitmentTestBot;
  }
});
