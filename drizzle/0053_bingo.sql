CREATE TABLE IF NOT EXISTS "bingo_boards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"challenge_id" uuid NOT NULL UNIQUE,
	"size" integer NOT NULL,
	"victory" text DEFAULT 'line' NOT NULL,
	"victory_lines" integer,
	"style_key" text DEFAULT 'default' NOT NULL,
	"presentation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bingo_boards_size" CHECK ("bingo_boards"."size" IN (3, 4, 5)),
	CONSTRAINT "bingo_boards_victory" CHECK ("bingo_boards"."victory" IN ('line', 'n_lines', 'blackout'))
);--> statement-breakpoint
ALTER TABLE "bingo_boards" ADD CONSTRAINT "bingo_boards_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bingo_boards_challenge_idx" ON "bingo_boards" ("challenge_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bingo_squares" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"objective_id" uuid,
	"free_space" boolean DEFAULT false NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bingo_squares_position" CHECK ("bingo_squares"."position" >= 0 AND "bingo_squares"."position" < 25)
);--> statement-breakpoint
ALTER TABLE "bingo_squares" ADD CONSTRAINT "bingo_squares_board_id_bingo_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "bingo_boards"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "bingo_squares" ADD CONSTRAINT "bingo_squares_objective_id_challenge_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "challenge_objectives"("id") ON DELETE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bingo_squares_board_position_unique" ON "bingo_squares" ("board_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bingo_squares_board_objective_unique" ON "bingo_squares" ("board_id","objective_id") WHERE "objective_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bingo_squares_board_idx" ON "bingo_squares" ("board_id");
