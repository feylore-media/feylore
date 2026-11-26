CREATE TABLE "metadata_field_provenance" (
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"field" text NOT NULL,
	"source_key" text NOT NULL,
	"source_category" text NOT NULL,
	"origin" text NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metadata_field_provenance_pkey" PRIMARY KEY("subject_type","subject_id","field")
);
--> statement-breakpoint
ALTER TABLE "metadata_field_provenance" ADD CONSTRAINT "metadata_field_provenance_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "metadata_policies" ADD COLUMN "provider_source_order" jsonb;
--> statement-breakpoint
ALTER TABLE "metadata_policies" ADD COLUMN "import_source_order" jsonb;
--> statement-breakpoint
UPDATE "metadata_policies"
SET
	"provider_source_order" = COALESCE(
		(
			SELECT jsonb_agg(elem ORDER BY ord)
			FROM (
				SELECT elem, ordinality AS ord
				FROM jsonb_array_elements_text("source_order") WITH ORDINALITY AS t(elem, ordinality)
				WHERE elem NOT LIKE 'embedded.%' AND elem <> 'media.process'
			) AS provider_elems
		),
		'[]'::jsonb
	),
	"import_source_order" = COALESCE(
		(
			SELECT jsonb_agg(elem ORDER BY ord)
			FROM (
				SELECT elem, ordinality AS ord
				FROM jsonb_array_elements_text("source_order") WITH ORDINALITY AS t(elem, ordinality)
				WHERE elem LIKE 'embedded.%' OR elem = 'media.process'
			) AS import_elems
		),
		'[]'::jsonb
	);
--> statement-breakpoint
UPDATE "metadata_policies"
SET
	"provider_source_order" = '[]'::jsonb
WHERE "provider_source_order" IS NULL;
--> statement-breakpoint
UPDATE "metadata_policies"
SET
	"import_source_order" = '[]'::jsonb
WHERE "import_source_order" IS NULL;
--> statement-breakpoint
ALTER TABLE "metadata_policies" ALTER COLUMN "provider_source_order" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "metadata_policies" ALTER COLUMN "import_source_order" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "metadata_policies" DROP COLUMN "source_order";
