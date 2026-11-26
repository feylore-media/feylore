DROP TABLE IF EXISTS "custom_field_values";
DROP TABLE IF EXISTS "metadata_custom_field_options";

ALTER TABLE "metadata_custom_fields" DROP CONSTRAINT IF EXISTS "metadata_custom_fields_field_key_unique";

ALTER TABLE "metadata_custom_fields" DROP COLUMN IF EXISTS "media_modules";
ALTER TABLE "metadata_custom_fields" DROP COLUMN IF EXISTS "options";

ALTER TABLE "metadata_custom_fields" ADD COLUMN IF NOT EXISTS "media_module" text;
ALTER TABLE "metadata_custom_fields" ADD COLUMN IF NOT EXISTS "entity_type" text;
ALTER TABLE "metadata_custom_fields" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "metadata_custom_fields" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;

UPDATE "metadata_custom_fields" SET "media_module" = 'books', "entity_type" = 'item' WHERE "media_module" IS NULL;

ALTER TABLE "metadata_custom_fields" ALTER COLUMN "media_module" SET NOT NULL;
ALTER TABLE "metadata_custom_fields" ALTER COLUMN "entity_type" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "metadata_custom_fields_scope_key_unique" ON "metadata_custom_fields" ("media_module","entity_type","field_key");
CREATE INDEX IF NOT EXISTS "metadata_custom_fields_scope_idx" ON "metadata_custom_fields" ("media_module","entity_type");

CREATE TABLE IF NOT EXISTS "metadata_custom_field_options" (
	"id" uuid PRIMARY KEY NOT NULL,
	"field_id" uuid NOT NULL,
	"option_key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "custom_field_values" (
	"id" uuid PRIMARY KEY NOT NULL,
	"field_id" uuid NOT NULL,
	"subject_id" text NOT NULL,
	"value" jsonb NOT NULL,
	"set_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "metadata_custom_field_options" ADD CONSTRAINT "metadata_custom_field_options_field_id_metadata_custom_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."metadata_custom_fields"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_field_id_metadata_custom_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."metadata_custom_fields"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_set_by_user_id_users_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "metadata_custom_field_options_field_key_unique" ON "metadata_custom_field_options" ("field_id","option_key");
CREATE UNIQUE INDEX IF NOT EXISTS "custom_field_values_field_subject_unique" ON "custom_field_values" ("field_id","subject_id");
CREATE INDEX IF NOT EXISTS "custom_field_values_subject_idx" ON "custom_field_values" ("subject_id");
