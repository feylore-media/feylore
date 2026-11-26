CREATE TYPE "public"."presence_kind" AS ENUM('reading', 'listening', 'watching');--> statement-breakpoint
CREATE TYPE "public"."presence_source" AS ENUM('feylore-reader', 'feylore-player', 'integration');--> statement-breakpoint
CREATE TABLE "presence_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "presence_kind" NOT NULL,
	"work_type" text NOT NULL,
	"work_id" text NOT NULL,
	"expression_id" uuid,
	"manifestation_id" uuid,
	"representation_id" uuid,
	"source" "presence_source" NOT NULL,
	"source_instance" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_engaged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presence_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "presence_sessions_expression_id_creative_work_expressions_id_fk" FOREIGN KEY ("expression_id") REFERENCES "public"."creative_work_expressions"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "presence_sessions_manifestation_id_creative_work_manifestations_id_fk" FOREIGN KEY ("manifestation_id") REFERENCES "public"."creative_work_manifestations"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "presence_sessions_representation_id_representations_id_fk" FOREIGN KEY ("representation_id") REFERENCES "public"."representations"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "presence_sessions_kind_check" CHECK ("work_type" <> '' AND "work_id" <> '')
);
--> statement-breakpoint
CREATE INDEX "presence_sessions_user_idx" ON "presence_sessions" USING btree ("user_id","last_engaged_at");--> statement-breakpoint
CREATE INDEX "presence_sessions_user_kind_idx" ON "presence_sessions" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "presence_sessions_user_work_idx" ON "presence_sessions" USING btree ("user_id","work_type","work_id");--> statement-breakpoint
CREATE INDEX "presence_sessions_source_idx" ON "presence_sessions" USING btree ("source","source_instance");
