CREATE TABLE IF NOT EXISTS "club_quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"club_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"work_subject_type" text NOT NULL,
	"work_subject_id" text NOT NULL,
	"text" text NOT NULL,
	"source_annotation_id" uuid,
	"locator_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_quotes" ADD CONSTRAINT "club_quotes_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_quotes" ADD CONSTRAINT "club_quotes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_quotes" ADD CONSTRAINT "club_quotes_source_annotation_id_user_annotations_id_fk" FOREIGN KEY ("source_annotation_id") REFERENCES "public"."user_annotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_quotes_club_created_idx" ON "club_quotes" USING btree ("club_id","created_at" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "club_quotes_club_annotation_unique" ON "club_quotes" USING btree ("club_id","source_annotation_id") WHERE "source_annotation_id" IS NOT NULL;
