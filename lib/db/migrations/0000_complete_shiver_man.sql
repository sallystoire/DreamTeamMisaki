CREATE TABLE "dream_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_discord_id" varchar(20) NOT NULL,
	"action" varchar(48) NOT NULL,
	"target_discord_id" varchar(20),
	"target_team_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dream_auth_sessions" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"discord_id" varchar(20) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dream_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(80) NOT NULL,
	"reward" varchar(120) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"draw_status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"winning_team_id" uuid,
	"winning_team_name" varchar(32),
	"winner_discord_id" varchar(20),
	"winner_username" text,
	"winner_avatar_url" text,
	"created_by_discord_id" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dream_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(32) NOT NULL,
	"captain_discord_id" varchar(20) NOT NULL,
	"join_code" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dream_users" (
	"discord_id" varchar(20) PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"avatar_url" text,
	"site_role" varchar(20) DEFAULT 'MEMBER' NOT NULL,
	"team_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dream_voice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_id" varchar(20) NOT NULL,
	"team_id" uuid,
	"channel_id" varchar(20) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "captain_applications" (
	"discord_id" varchar(20) PRIMARY KEY NOT NULL,
	"answers" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"channel_id" text,
	"guild_id" text,
	"message_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dream_auth_sessions" ADD CONSTRAINT "dream_auth_sessions_discord_id_dream_users_discord_id_fk" FOREIGN KEY ("discord_id") REFERENCES "public"."dream_users"("discord_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dream_users" ADD CONSTRAINT "dream_users_team_id_dream_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."dream_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dream_voice_sessions" ADD CONSTRAINT "dream_voice_sessions_discord_id_dream_users_discord_id_fk" FOREIGN KEY ("discord_id") REFERENCES "public"."dream_users"("discord_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dream_voice_sessions" ADD CONSTRAINT "dream_voice_sessions_team_id_dream_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."dream_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captain_applications" ADD CONSTRAINT "captain_applications_discord_id_dream_users_discord_id_fk" FOREIGN KEY ("discord_id") REFERENCES "public"."dream_users"("discord_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dream_audit_created_idx" ON "dream_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "dream_auth_sessions_expiry_idx" ON "dream_auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "dream_challenges_status_ends_idx" ON "dream_challenges" USING btree ("status","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dream_challenges_one_active_idx" ON "dream_challenges" USING btree ("status") WHERE "dream_challenges"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "dream_teams_captain_unique" ON "dream_teams" USING btree ("captain_discord_id") WHERE "dream_teams"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "dream_teams_join_code_unique" ON "dream_teams" USING btree ("join_code");--> statement-breakpoint
CREATE INDEX "dream_users_team_idx" ON "dream_users" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "dream_voice_sessions_team_start_idx" ON "dream_voice_sessions" USING btree ("team_id","started_at");--> statement-breakpoint
CREATE INDEX "dream_voice_sessions_user_start_idx" ON "dream_voice_sessions" USING btree ("discord_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dream_voice_sessions_one_open_per_user" ON "dream_voice_sessions" USING btree ("discord_id") WHERE "dream_voice_sessions"."ended_at" is null;