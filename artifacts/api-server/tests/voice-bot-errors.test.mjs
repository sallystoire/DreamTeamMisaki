import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import Module from "node:module";
import { fileURLToPath } from "node:url";

test("missing database tables and emitted Discord errors do not become unhandled process errors", async () => {
  const mocks = {
    "discord.js": `import {EventEmitter} from "node:events";
      export const Events=new Proxy({}, {get:(_,key)=>String(key)});
      export const GatewayIntentBits={Guilds:1,GuildVoiceStates:2};
      export class Client extends EventEmitter {
        constructor(){super({captureRejections:true});this.user={id:"fixture-app"};this.guilds={cache:new Map([["main",{}]])};globalThis.__voiceFixture=this;}
        isReady(){return true;} login(){return Promise.resolve();}
      }`,
    "@workspace/db": `export const dreamUsersTable={};export const dreamVoiceSessionsTable={};
      export const db={update:()=>({set:()=>({where:async()=>{throw new Error('relation "dream_voice_sessions" does not exist')}})})};`,
    "./logger": `export const logger={info(){},warn(){},error:(details,message)=>{globalThis.__voiceErrors.push(message)}};`,
    "./publicVoice": "export const isPublicVoiceChannel=()=>false;",
    "./teamCommand": "export const handleTeamInteraction=async()=>{};export const registerTeamCommand=async()=>{};",
    "./joinTeamCommand": "export const handleJoinTeamInteraction=async()=>{};export const registerJoinTeamCommand=async()=>{};",
    "./discordConfig": 'export const misakiGuildId=()=>"main";',
  };
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL("../src/lib/voiceBot.ts", import.meta.url))],
    bundle: true, write: false, format: "cjs", platform: "node", packages: "external",
    define: { "process.env.DISCORD_BOT_TOKEN": '"fixture-token"', "process.env.DISCORD_CLIENT_ID": '"fixture-app"' },
    plugins: [{ name: "mocks", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }],
  });
  const directory = fileURLToPath(new URL(".", import.meta.url));
  const compiled = new Module(`${directory}/voice-fixture.cjs`);
  compiled.paths = Module._nodeModulePaths(directory);
  compiled._compile(bundled.outputFiles[0].text, `${directory}/voice-fixture.cjs`);
  globalThis.__voiceErrors = [];
  try {
    compiled.exports.startVoiceBot();
    const client = globalThis.__voiceFixture;
    client.emit("ClientReady", client);
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(globalThis.__voiceErrors.some(message => message.includes("Voice tracking could not initialize")));
    assert.equal(compiled.exports.isVoiceBotConnected(), false);
    assert.doesNotThrow(() => client.emit("Error", new Error("Fixture gateway failure")));
    assert.ok(globalThis.__voiceErrors.some(message => message.includes("HTTP server remains available")));
  } finally {
    delete globalThis.__voiceFixture;
    delete globalThis.__voiceErrors;
  }
});
