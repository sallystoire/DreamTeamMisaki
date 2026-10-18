import { jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { dreamUsersTable } from "./dreamteam";

export const captainApplicationsTable = pgTable("captain_applications", {
  discordId: varchar("discord_id", { length: 20 }).primaryKey()
    .references(() => dreamUsersTable.discordId, { onDelete: "cascade" }),
  answers: jsonb("answers").$type<Record<string, unknown>>().notNull(),
  status: varchar("status", { length: 20 }).notNull().default("PENDING"),
  channelId: text("channel_id"),
  guildId: text("guild_id"),
  messageId: text("message_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
