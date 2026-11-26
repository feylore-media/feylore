CREATE TYPE "public"."library_content_type" AS ENUM('book');--> statement-breakpoint
CREATE TYPE "public"."organization_policy_mode" AS ENUM('in_place', 'managed');--> statement-breakpoint
CREATE TYPE "public"."ingest_source_kind" AS ENUM('filesystem', 'upload');--> statement-breakpoint
CREATE TYPE "public"."ingest_pipeline_status" AS ENUM('discovered', 'queued', 'analyzing', 'identifying', 'metadata_resolved', 'normalizing', 'organizing', 'completed');--> statement-breakpoint
CREATE TYPE "public"."ingest_terminal_state" AS ENUM('failed', 'needs_attention', 'duplicate', 'unsupported');--> statement-breakpoint
CREATE TYPE "public"."ingest_file_lifecycle" AS ENUM('incoming', 'discovered', 'claimed', 'processing', 'destination_prepared', 'destination_verified', 'source_retired');--> statement-breakpoint
ALTER TABLE "libraries" ADD COLUMN "content_type" "library_content_type" DEFAULT 'book';--> statement-breakpoint
ALTER TABLE "libraries" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "libraries" ADD COLUMN "storage_location_id" uuid;--> statement-breakpoint
ALTER TABLE "libraries" ADD COLUMN "organization_policy" jsonb DEFAULT '{"mode":"managed","template":"{author}/{series}/{title}"}'::jsonb;--> statement-breakpoint
ALTER TABLE "libraries" ADD COLUMN "normalization_policy" jsonb DEFAULT '{"epub":{"enabled":true,"target":"epub-3.3"}}'::jsonb;--> statement-breakpoint
ALTER TABLE "libraries" ADD COLUMN "supported_formats" text[] DEFAULT ARRAY['epub','pdf','mobi','azw3','cbz']::text[];--> statement-breakpoint
ALTER TABLE "libraries" ADD COLUMN "stats_cached" jsonb;--> statement-breakpoint
ALTER TABLE "libraries" ADD CONSTRAINT "libraries_storage_location_id_storage_locations_id_fk" FOREIGN KEY ("storage_location_id") REFERENCES "public"."storage_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "ingest_roots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"storage_location_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"recursive" boolean DEFAULT true NOT NULL,
	"content_type_hint" text,
	"default_library_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "ingest_roots" ADD CONSTRAINT "ingest_roots_storage_location_id_storage_locations_id_fk" FOREIGN KEY ("storage_location_id") REFERENCES "public"."storage_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_roots" ADD CONSTRAINT "ingest_roots_default_library_id_libraries_id_fk" FOREIGN KEY ("default_library_id") REFERENCES "public"."libraries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "ingest_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" "ingest_pipeline_status" DEFAULT 'discovered' NOT NULL,
	"terminal_state" "ingest_terminal_state",
	"file_lifecycle" "ingest_file_lifecycle" DEFAULT 'incoming' NOT NULL,
	"source_kind" "ingest_source_kind" NOT NULL,
	"source_identity" text NOT NULL,
	"source_path" text NOT NULL,
	"source_storage_location_id" uuid NOT NULL,
	"source_checksum" text,
	"source_size" bigint,
	"source_mtime" timestamp with time zone,
	"source_ingest_root_id" uuid,
	"original_filename" text NOT NULL,
	"detected_content_type" text,
	"detected_domain" text,
	"target_library_id" uuid,
	"destination_relative_path" text,
	"duplicate_of_work_type" text,
	"duplicate_of_work_id" text,
	"work_type" text,
	"work_id" text,
	"file_id" uuid,
	"claimed_at" timestamp with time zone,
	"claimed_by_worker" text,
	"error" text,
	"warnings" jsonb DEFAULT '[]'::jsonb,
	"stage_log" jsonb DEFAULT '[]'::jsonb,
	"progress" integer DEFAULT 0 NOT NULL,
	"submitted_by_user_id" uuid,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "ingest_items" ADD CONSTRAINT "ingest_items_source_storage_location_id_storage_locations_id_fk" FOREIGN KEY ("source_storage_location_id") REFERENCES "public"."storage_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_items" ADD CONSTRAINT "ingest_items_source_ingest_root_id_ingest_roots_id_fk" FOREIGN KEY ("source_ingest_root_id") REFERENCES "public"."ingest_roots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_items" ADD CONSTRAINT "ingest_items_target_library_id_libraries_id_fk" FOREIGN KEY ("target_library_id") REFERENCES "public"."libraries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_items" ADD CONSTRAINT "ingest_items_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_items" ADD CONSTRAINT "ingest_items_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingest_items_source_identity_unique" ON "ingest_items" USING btree ("source_identity");--> statement-breakpoint
CREATE INDEX "ingest_items_status_idx" ON "ingest_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ingest_items_terminal_idx" ON "ingest_items" USING btree ("terminal_state");--> statement-breakpoint
CREATE INDEX "ingest_items_created_idx" ON "ingest_items" USING btree ("created_at");
