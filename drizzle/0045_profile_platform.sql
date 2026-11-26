CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"pronouns" text,
	"banner_file_id" uuid,
	"accent" text,
	"card_style" text,
	"hero_treatment" text,
	"surface_treatment" text,
	"custom_css" text,
	"guestbook_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "user_profiles_banner_file_id_files_id_fk" FOREIGN KEY ("banner_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "user_profile_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "user_profile_links_user_sort_idx" ON "user_profile_links" USING btree ("user_id","sort_order");
--> statement-breakpoint
CREATE INDEX "user_profile_links_user_idx" ON "user_profile_links" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE "user_follows" (
	"follower_user_id" uuid NOT NULL,
	"followed_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_follows_follower_user_id_users_id_fk" FOREIGN KEY ("follower_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "user_follows_followed_user_id_users_id_fk" FOREIGN KEY ("followed_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "user_follows_follower_user_id_followed_user_id_pk" PRIMARY KEY("follower_user_id","followed_user_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_follows_unique" ON "user_follows" USING btree ("follower_user_id","followed_user_id");
--> statement-breakpoint
CREATE INDEX "user_follows_follower_idx" ON "user_follows" USING btree ("follower_user_id");
--> statement-breakpoint
CREATE INDEX "user_follows_followed_idx" ON "user_follows" USING btree ("followed_user_id");
--> statement-breakpoint
CREATE TABLE "profile_obsessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"pinned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_obsessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "profile_obsessions_user_sort_idx" ON "profile_obsessions" USING btree ("user_id","sort_order");
--> statement-breakpoint
CREATE INDEX "profile_obsessions_user_idx" ON "profile_obsessions" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE "user_profile_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"artifact_type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"size" text DEFAULT 'medium' NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_artifacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "user_profile_artifacts_user_sort_idx" ON "user_profile_artifacts" USING btree ("user_id","sort_order");
--> statement-breakpoint
CREATE INDEX "user_profile_artifacts_user_idx" ON "user_profile_artifacts" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE "profile_guestbook_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_user_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "profile_guestbook_entries_profile_user_id_users_id_fk" FOREIGN KEY ("profile_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "profile_guestbook_entries_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "profile_guestbook_profile_created_idx" ON "profile_guestbook_entries" USING btree ("profile_user_id","created_at");
--> statement-breakpoint
CREATE INDEX "profile_guestbook_author_idx" ON "profile_guestbook_entries" USING btree ("author_user_id");
