import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dreamTeamsTable = pgTable(
  "dream_teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 32 }).notNull(),
    captainDiscordId: varchar("captain_discord_id", { length: 20 }).notNull(),
    joinCode: varchar("join_code", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("dream_teams_captain_unique")
      .on(table.captainDiscordId)
      .where(sql`${table.archivedAt} is null`),
    uniqueIndex("dream_teams_join_code_unique").on(table.joinCode),
  ],
);

export const dreamUsersTable = pgTable(
  "dream_users",
  {
    discordId: varchar("discord_id", { length: 20 }).primaryKey(),
    username: text("username").notNull(),
    avatarUrl: text("avatar_url"),
    role: varchar("site_role", { length: 20 }).notNull().default("MEMBER"),
    teamId: uuid("team_id").references(() => dreamTeamsTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("dream_users_team_idx").on(table.teamId)],
);

export const dreamChallengesTable = pgTable(
  "dream_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 80 }).notNull(),
    reward: varchar("reward", { length: 120 }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    drawStatus: varchar("draw_status", { length: 32 }).notNull().default("PENDING"),
    winningTeamId: uuid("winning_team_id"),
    winningTeamName: varchar("winning_team_name", { length: 32 }),
    winnerDiscordId: varchar("winner_discord_id", { length: 20 }),
    winnerUsername: text("winner_username"),
    winnerAvatarUrl: text("winner_avatar_url"),
    createdByDiscordId: varchar("created_by_discord_id", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("dream_challenges_status_ends_idx").on(table.status, table.endsAt),
    uniqueIndex("dream_challenges_one_active_idx")
      .on(table.status)
      .where(sql`${table.status} = 'ACTIVE'`),
  ],
);

export const dreamVoiceSessionsTable = pgTable(
  "dream_voice_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    discordId: varchar("discord_id", { length: 20 })
      .notNull()
      .references(() => dreamUsersTable.discordId, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => dreamTeamsTable.id, {
      onDelete: "set null",
    }),
    channelId: varchar("channel_id", { length: 20 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    index("dream_voice_sessions_team_start_idx").on(table.teamId, table.startedAt),
    index("dream_voice_sessions_user_start_idx").on(table.discordId, table.startedAt),
    uniqueIndex("dream_voice_sessions_one_open_per_user")
      .on(table.discordId)
      .where(sql`${table.endedAt} is null`),
  ],
);

export const dreamAuthSessionsTable = pgTable(
  "dream_auth_sessions",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    discordId: varchar("discord_id", { length: 20 })
      .notNull()
      .references(() => dreamUsersTable.discordId, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("dream_auth_sessions_expiry_idx").on(table.expiresAt)],
);

export const dreamAuditLogTable = pgTable(
  "dream_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorDiscordId: varchar("actor_discord_id", { length: 20 }).notNull(),
    action: varchar("action", { length: 48 }).notNull(),
    targetDiscordId: varchar("target_discord_id", { length: 20 }),
    targetTeamId: uuid("target_team_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("dream_audit_created_idx").on(table.createdAt)],
);

export const insertDreamUserSchema = createInsertSchema(dreamUsersTable);
export const insertDreamTeamSchema = createInsertSchema(dreamTeamsTable);
export const insertDreamChallengeSchema = createInsertSchema(dreamChallengesTable);
export const insertDreamVoiceSessionSchema = createInsertSchema(dreamVoiceSessionsTable);
export const insertDreamAuthSessionSchema = createInsertSchema(dreamAuthSessionsTable);
export const insertDreamAuditLogSchema = createInsertSchema(dreamAuditLogTable);

export type DreamUser = typeof dreamUsersTable.$inferSelect;
export type DreamTeam = typeof dreamTeamsTable.$inferSelect;
export type DreamChallenge = typeof dreamChallengesTable.$inferSelect;
export type DreamVoiceSession = typeof dreamVoiceSessionsTable.$inferSelect;
export type DreamAuthSession = typeof dreamAuthSessionsTable.$inferSelect;
export type DreamAuditLog = typeof dreamAuditLogTable.$inferSelect;
export type DreamSiteRole = "MEMBER" | "CAPTAIN" | "ADMIN" | "ADMIN_PLUS";
