CREATE TABLE "metadata_vocabulary_terms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metadata_vocabulary_terms_kind_check" CHECK ("kind" IN ('genre', 'tag'))
);
--> statement-breakpoint
ALTER TABLE "metadata_vocabulary_terms" ADD CONSTRAINT "metadata_vocabulary_terms_parent_id_metadata_vocabulary_terms_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."metadata_vocabulary_terms"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "metadata_vocabulary_terms_kind_parent_idx" ON "metadata_vocabulary_terms" USING btree ("kind","parent_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "metadata_vocabulary_terms_unique_name" ON "metadata_vocabulary_terms" USING btree ("kind",COALESCE("parent_id"::text, ''),"normalized_name");
--> statement-breakpoint
CREATE TABLE "metadata_vocabulary_aliases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"term_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metadata_vocabulary_aliases_kind_check" CHECK ("kind" IN ('genre', 'tag'))
);
--> statement-breakpoint
ALTER TABLE "metadata_vocabulary_aliases" ADD CONSTRAINT "metadata_vocabulary_aliases_term_id_metadata_vocabulary_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."metadata_vocabulary_terms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "metadata_vocabulary_aliases_kind_normalized" ON "metadata_vocabulary_aliases" USING btree ("kind","normalized_alias");
--> statement-breakpoint
CREATE INDEX "metadata_vocabulary_aliases_term_idx" ON "metadata_vocabulary_aliases" USING btree ("term_id");
--> statement-breakpoint
CREATE TABLE "metadata_formatting_suggestions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"raw_value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"suggested_term_id" uuid,
	"suggestion_type" text NOT NULL,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metadata_formatting_suggestions_kind_check" CHECK ("kind" IN ('genre', 'tag')),
	CONSTRAINT "metadata_formatting_suggestions_status_check" CHECK ("status" IN ('open', 'resolved', 'ignored')),
	CONSTRAINT "metadata_formatting_suggestions_type_check" CHECK ("suggestion_type" IN ('similar_name', 'suggest_alias', 'placement'))
);
--> statement-breakpoint
ALTER TABLE "metadata_formatting_suggestions" ADD CONSTRAINT "metadata_formatting_suggestions_suggested_term_id_metadata_vocabulary_terms_id_fk" FOREIGN KEY ("suggested_term_id") REFERENCES "public"."metadata_vocabulary_terms"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "metadata_formatting_suggestions_kind_status_idx" ON "metadata_formatting_suggestions" USING btree ("kind","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "metadata_formatting_suggestions_open_unique" ON "metadata_formatting_suggestions" USING btree ("kind","normalized_value") WHERE "status" = 'open';
