CREATE TYPE "public"."download_status" AS ENUM('queued', 'in_progress', 'available', 'failed', 'removed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."shelf_kind" AS ENUM('basic', 'rules');--> statement-breakpoint
CREATE TYPE "public"."shelf_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TYPE "public"."storage_kind" AS ENUM('managed', 'external', 'read_only');--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"type" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"ip_address" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_authors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" varchar(6) NOT NULL,
	"name" text NOT NULL,
	"sort_order" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_genres" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" varchar(6) NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_series" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_series_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"series_id" uuid NOT NULL,
	"book_id" varchar(6) NOT NULL,
	"position" bigint
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" varchar(6) PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"slug_status" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"cover_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_slug_unique" UNIQUE("slug"),
	CONSTRAINT "books_id_format" CHECK ("books"."id" ~ '^[a-z0-9]{6}$'),
	CONSTRAINT "books_slug_status_check" CHECK ("books"."slug_status" IN ('pending', 'canonical'))
);
--> statement-breakpoint
CREATE TABLE "creative_work_expressions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_type" text NOT NULL,
	"work_id" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_work_manifestations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"expression_id" uuid NOT NULL,
	"label" text,
	"external_id_type" text,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_work_relationships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"relationship_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"user_agent" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "downloads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid,
	"file_id" uuid NOT NULL,
	"status" "download_status" DEFAULT 'queued' NOT NULL,
	"bytes_total" bigint,
	"bytes_downloaded" bigint DEFAULT 0,
	"prepare_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_overrides" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"set_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_technical_metadata" (
	"id" uuid PRIMARY KEY NOT NULL,
	"file_id" uuid NOT NULL,
	"extractor" text NOT NULL,
	"payload" jsonb NOT NULL,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"storage_location_id" uuid NOT NULL,
	"relative_path" text NOT NULL,
	"size" bigint DEFAULT 0 NOT NULL,
	"media_type" text,
	"checksum" text,
	"mtime" timestamp with time zone,
	"missing_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrations_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"boss_job_id" text,
	"type" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"progress" bigint,
	"error" text,
	"log_excerpt" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "libraries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"intended_domain" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_memberships" (
	"user_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_storage_locations" (
	"library_id" uuid NOT NULL,
	"storage_location_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metadata_custom_fields" (
	"id" uuid PRIMARY KEY NOT NULL,
	"field_key" text NOT NULL,
	"display_name" text NOT NULL,
	"field_type" text NOT NULL,
	"media_modules" jsonb NOT NULL,
	"options" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metadata_custom_fields_field_key_unique" UNIQUE("field_key")
);
--> statement-breakpoint
CREATE TABLE "metadata_matching_rules" (
	"media_module" text PRIMARY KEY NOT NULL,
	"rules" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metadata_policies" (
	"media_module" text NOT NULL,
	"field_id" text NOT NULL,
	"source_order" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metadata_policies_media_module_field_id_pk" PRIMARY KEY("media_module","field_id")
);
--> statement-breakpoint
CREATE TABLE "metadata_providers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"contract_version" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metadata_providers_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "metadata_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_key" text NOT NULL,
	"external_id" text,
	"subject_type" text,
	"subject_id" text,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"description" text,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "representation_files" (
	"representation_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"role" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "representations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"manifestation_id" uuid,
	"format" text NOT NULL,
	"domain_module" text NOT NULL,
	"unavailable_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "search_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"tsv" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"device_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "shelf_grants" (
	"shelf_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shelf_items" (
	"shelf_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shelves" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "shelf_kind" DEFAULT 'basic' NOT NULL,
	"visibility" "shelf_visibility" DEFAULT 'private' NOT NULL,
	"rules" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "storage_kind" DEFAULT 'managed' NOT NULL,
	"root_path" text NOT NULL,
	"watch_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_annotations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"representation_id" uuid,
	"locator_json" jsonb NOT NULL,
	"highlight_text" text,
	"note" text,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_bookmarks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"representation_id" uuid,
	"label" text,
	"locator_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_favorites" (
	"user_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"progress_sync_enabled" boolean DEFAULT true NOT NULL,
	"library_view" text DEFAULT 'grid',
	"library_sort" text DEFAULT 'title',
	"privacy_activity" text DEFAULT 'private',
	"settings_json" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "user_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"locator_json" jsonb NOT NULL,
	"representation_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ratings" (
	"user_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"rating" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_authors" ADD CONSTRAINT "book_authors_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_genres" ADD CONSTRAINT "book_genres_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_series_members" ADD CONSTRAINT "book_series_members_series_id_book_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."book_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_series_members" ADD CONSTRAINT "book_series_members_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_work_manifestations" ADD CONSTRAINT "creative_work_manifestations_expression_id_creative_work_expressions_id_fk" FOREIGN KEY ("expression_id") REFERENCES "public"."creative_work_expressions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_overrides" ADD CONSTRAINT "field_overrides_set_by_user_id_users_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_technical_metadata" ADD CONSTRAINT "file_technical_metadata_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_storage_location_id_storage_locations_id_fk" FOREIGN KEY ("storage_location_id") REFERENCES "public"."storage_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_memberships" ADD CONSTRAINT "library_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_storage_locations" ADD CONSTRAINT "library_storage_locations_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_storage_locations" ADD CONSTRAINT "library_storage_locations_storage_location_id_storage_locations_id_fk" FOREIGN KEY ("storage_location_id") REFERENCES "public"."storage_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "representation_files" ADD CONSTRAINT "representation_files_representation_id_representations_id_fk" FOREIGN KEY ("representation_id") REFERENCES "public"."representations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "representation_files" ADD CONSTRAINT "representation_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "representations" ADD CONSTRAINT "representations_manifestation_id_creative_work_manifestations_id_fk" FOREIGN KEY ("manifestation_id") REFERENCES "public"."creative_work_manifestations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_grants" ADD CONSTRAINT "shelf_grants_shelf_id_shelves_id_fk" FOREIGN KEY ("shelf_id") REFERENCES "public"."shelves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_grants" ADD CONSTRAINT "shelf_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_items" ADD CONSTRAINT "shelf_items_shelf_id_shelves_id_fk" FOREIGN KEY ("shelf_id") REFERENCES "public"."shelves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_annotations" ADD CONSTRAINT "user_annotations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_annotations" ADD CONSTRAINT "user_annotations_representation_id_representations_id_fk" FOREIGN KEY ("representation_id") REFERENCES "public"."representations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bookmarks" ADD CONSTRAINT "user_bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bookmarks" ADD CONSTRAINT "user_bookmarks_representation_id_representations_id_fk" FOREIGN KEY ("representation_id") REFERENCES "public"."representations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_history" ADD CONSTRAINT "user_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_representation_id_representations_id_fk" FOREIGN KEY ("representation_id") REFERENCES "public"."representations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "book_authors_book_idx" ON "book_authors" USING btree ("book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "book_genre_unique" ON "book_genres" USING btree ("book_id","name");--> statement-breakpoint
CREATE INDEX "book_genres_book_idx" ON "book_genres" USING btree ("book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "book_series_member_unique" ON "book_series_members" USING btree ("series_id","book_id");--> statement-breakpoint
CREATE INDEX "book_series_members_book_idx" ON "book_series_members" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "expressions_work_idx" ON "creative_work_expressions" USING btree ("work_type","work_id");--> statement-breakpoint
CREATE INDEX "manifestations_expression_idx" ON "creative_work_manifestations" USING btree ("expression_id");--> statement-breakpoint
CREATE INDEX "manifestations_external_idx" ON "creative_work_manifestations" USING btree ("external_id_type","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_work_rel_unique" ON "creative_work_relationships" USING btree ("source_type","source_id","target_type","target_id","relationship_type");--> statement-breakpoint
CREATE INDEX "creative_work_rel_source_idx" ON "creative_work_relationships" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "creative_work_rel_target_idx" ON "creative_work_relationships" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "override_unique" ON "field_overrides" USING btree ("subject_type","subject_id","field");--> statement-breakpoint
CREATE UNIQUE INDEX "file_location_path_unique" ON "files" USING btree ("storage_location_id","relative_path");--> statement-breakpoint
CREATE INDEX "files_checksum_idx" ON "files" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "files_missing_idx" ON "files" USING btree ("missing_at");--> statement-breakpoint
CREATE UNIQUE INDEX "library_membership_unique" ON "library_memberships" USING btree ("user_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "library_memberships_target_idx" ON "library_memberships" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_storage_unique" ON "library_storage_locations" USING btree ("library_id","storage_location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "representation_file_unique" ON "representation_files" USING btree ("representation_id","file_id");--> statement-breakpoint
CREATE INDEX "representation_files_file_idx" ON "representation_files" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "representations_manifestation_idx" ON "representations" USING btree ("manifestation_id");--> statement-breakpoint
CREATE INDEX "representations_domain_idx" ON "representations" USING btree ("domain_module");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permission_unique" ON "role_permissions" USING btree ("role_id","permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "search_doc_unique" ON "search_documents" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shelf_grant_unique" ON "shelf_grants" USING btree ("shelf_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shelf_item_unique" ON "shelf_items" USING btree ("shelf_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "user_annotations_user_idx" ON "user_annotations" USING btree ("user_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "user_bookmarks_user_idx" ON "user_bookmarks" USING btree ("user_id","subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_favorite_unique" ON "user_favorites" USING btree ("user_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "user_history_user_idx" ON "user_history" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "user_history_subject_idx" ON "user_history" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_progress_unique" ON "user_progress" USING btree ("user_id","subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_rating_unique" ON "user_ratings" USING btree ("user_id","subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_role_unique" ON "user_roles" USING btree ("user_id","role_id");