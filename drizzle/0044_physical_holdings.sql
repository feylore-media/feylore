CREATE TABLE IF NOT EXISTS "physical_holdings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"work_type" text DEFAULT 'book' NOT NULL,
	"work_id" varchar(6) NOT NULL,
	"manifestation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "physical_holdings_work_type_check" CHECK ("work_type" IN ('book'))
);
--> statement-breakpoint
ALTER TABLE "physical_holdings" ADD CONSTRAINT "physical_holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "physical_holdings" ADD CONSTRAINT "physical_holdings_work_id_books_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "physical_holdings" ADD CONSTRAINT "physical_holdings_manifestation_id_creative_work_manifestations_id_fk" FOREIGN KEY ("manifestation_id") REFERENCES "public"."creative_work_manifestations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "physical_holding_user_work_unique" ON "physical_holdings" USING btree ("user_id","work_type","work_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "physical_holdings_user_idx" ON "physical_holdings" USING btree ("user_id","work_type","work_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "physical_holdings_work_idx" ON "physical_holdings" USING btree ("work_type","work_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "physical_holdings_manifestation_idx" ON "physical_holdings" USING btree ("manifestation_id");
