CREATE TYPE "public"."book_rating_scope" AS ENUM('core', 'genre');
--> statement-breakpoint
CREATE TYPE "public"."book_rating_recommendation" AS ENUM('yes', 'no');
--> statement-breakpoint
CREATE TYPE "public"."book_review_status" AS ENUM('draft', 'completed');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "book_rating_genre_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"genre_term_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"display_order" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "book_rating_genre_definitions_genre_term_id_unique" UNIQUE("genre_term_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "book_rating_dimensions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"scope" "public"."book_rating_scope" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"display_order" bigint DEFAULT 0 NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"contributes_to_rating" boolean DEFAULT true NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"genre_definition_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "book_rating_dimensions_scope_def_check" CHECK (("scope" = 'core' AND "genre_definition_id" IS NULL) OR ("scope" = 'genre' AND "genre_definition_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "book_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" varchar(6) NOT NULL,
	"status" "public"."book_review_status" DEFAULT 'draft' NOT NULL,
	"recommendation" "public"."book_rating_recommendation",
	"suggested_rating" double precision,
	"final_rating" double precision,
	"core_values" jsonb,
	"genre_values" jsonb,
	"trajectory" jsonb,
	"summary" text,
	"review" text,
	"review_edited" boolean DEFAULT false NOT NULL,
	"external_posts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_external_post_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_key" text NOT NULL,
	"token_encrypted" text NOT NULL,
	"status" text DEFAULT 'authorized' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "book_rating_genre_definitions" ADD CONSTRAINT "book_rating_genre_definitions_genre_term_id_metadata_vocabulary_terms_id_fk" FOREIGN KEY ("genre_term_id") REFERENCES "public"."metadata_vocabulary_terms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "book_rating_dimensions" ADD CONSTRAINT "book_rating_dimensions_genre_definition_id_book_rating_genre_definitions_id_fk" FOREIGN KEY ("genre_definition_id") REFERENCES "public"."book_rating_genre_definitions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "book_reviews" ADD CONSTRAINT "book_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "book_reviews" ADD CONSTRAINT "book_reviews_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_external_post_credentials" ADD CONSTRAINT "user_external_post_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_rating_genre_definitions_term_idx" ON "book_rating_genre_definitions" USING btree ("genre_term_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "book_rating_dimension_key_unique" ON "book_rating_dimensions" USING btree ("scope","key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_rating_dimensions_genre_def_idx" ON "book_rating_dimensions" USING btree ("genre_definition_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "book_reviews_user_book_unique" ON "book_reviews" USING btree ("user_id","book_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_reviews_book_idx" ON "book_reviews" USING btree ("book_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_reviews_user_idx" ON "book_reviews" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_external_post_credentials_user_provider_unique" ON "user_external_post_credentials" USING btree ("user_id","provider_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_external_post_credentials_provider_idx" ON "user_external_post_credentials" USING btree ("provider_key");