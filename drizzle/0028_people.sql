CREATE TYPE "public"."people_entity_type" AS ENUM('person', 'group', 'organization');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "people" (
	"id" varchar(6) PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"entity_type" "public"."people_entity_type" DEFAULT 'person' NOT NULL,
	"name" text NOT NULL,
	"sort_name" text NOT NULL,
	"bio" text,
	"pronouns" text,
	"personal_url" text,
	"photo_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_slug_unique" UNIQUE("slug"),
	CONSTRAINT "people_id_format" CHECK ("id" ~ '^[a-z0-9]{6}$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_credits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"people_id" varchar(6) NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"role" text NOT NULL,
	"character" text,
	"sort_order" bigint DEFAULT 0 NOT NULL,
	"credit_provenance" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_provider_identifiers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"people_id" varchar(6) NOT NULL,
	"provider" text NOT NULL,
	"identifier" text NOT NULL,
	"provenance" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_relationships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"people_id" varchar(6) NOT NULL,
	"related_people_id" varchar(6) NOT NULL,
	"relationship_type" text NOT NULL,
	"sort_order" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "person_credits" ADD CONSTRAINT "person_credits_people_id_people_id_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "person_provider_identifiers" ADD CONSTRAINT "person_provider_identifiers_people_id_people_id_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_people_id_people_id_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_related_people_id_people_id_fk" FOREIGN KEY ("related_people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_sort_name_idx" ON "people" USING btree ("sort_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_entity_type_idx" ON "people" USING btree ("entity_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_type_sort_idx" ON "people" USING btree ("entity_type","sort_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_credits_people_idx" ON "person_credits" USING btree ("people_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_credits_target_idx" ON "person_credits" USING btree ("target_type","target_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_credits_target_type_idx" ON "person_credits" USING btree ("target_type");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "person_credit_unique" ON "person_credits" USING btree ("people_id","target_type","target_id","role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_credits_target_sort_idx" ON "person_credits" USING btree ("target_type","target_id","sort_order");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "person_provider_identifier_unique" ON "person_provider_identifiers" USING btree ("provider","identifier");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_provider_people_idx" ON "person_provider_identifiers" USING btree ("people_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_rel_people_idx" ON "person_relationships" USING btree ("people_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_rel_related_idx" ON "person_relationships" USING btree ("related_people_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "person_rel_unique" ON "person_relationships" USING btree ("people_id","related_people_id","relationship_type");