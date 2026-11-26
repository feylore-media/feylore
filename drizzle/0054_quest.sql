CREATE TABLE IF NOT EXISTS "quest_graphs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"challenge_id" uuid NOT NULL UNIQUE,
	"style_key" text DEFAULT 'default' NOT NULL,
	"presentation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quest_graphs_challenge_id_unique" UNIQUE("challenge_id")
);--> statement-breakpoint
ALTER TABLE "quest_graphs" ADD CONSTRAINT "quest_graphs_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quest_graphs_challenge_idx" ON "quest_graphs" ("challenge_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quest_nodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"graph_id" uuid NOT NULL,
	"node_key" text NOT NULL,
	"kind" text DEFAULT 'objective' NOT NULL,
	"label" text NOT NULL,
	"optional" boolean DEFAULT false NOT NULL,
	"join" text DEFAULT 'any' NOT NULL,
	"pos_x" double precision DEFAULT 0 NOT NULL,
	"pos_y" double precision DEFAULT 0 NOT NULL,
	"objective_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quest_nodes_kind" CHECK ("quest_nodes"."kind" IN ('start', 'objective', 'junction', 'finish')),
	CONSTRAINT "quest_nodes_join" CHECK ("quest_nodes"."join" IN ('any', 'all'))
);--> statement-breakpoint
ALTER TABLE "quest_nodes" ADD CONSTRAINT "quest_nodes_graph_id_quest_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "quest_graphs"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "quest_nodes" ADD CONSTRAINT "quest_nodes_objective_id_challenge_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "challenge_objectives"("id") ON DELETE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quest_nodes_graph_key_unique" ON "quest_nodes" ("graph_id","node_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quest_nodes_graph_objective_unique" ON "quest_nodes" ("graph_id","objective_id") WHERE "objective_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quest_nodes_graph_idx" ON "quest_nodes" ("graph_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quest_edges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"graph_id" uuid NOT NULL,
	"from_node_id" uuid NOT NULL,
	"to_node_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quest_edges_no_self" CHECK ("quest_edges"."from_node_id" <> "quest_edges"."to_node_id")
);--> statement-breakpoint
ALTER TABLE "quest_edges" ADD CONSTRAINT "quest_edges_graph_id_quest_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "quest_graphs"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "quest_edges" ADD CONSTRAINT "quest_edges_from_node_id_quest_nodes_id_fk" FOREIGN KEY ("from_node_id") REFERENCES "quest_nodes"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "quest_edges" ADD CONSTRAINT "quest_edges_to_node_id_quest_nodes_id_fk" FOREIGN KEY ("to_node_id") REFERENCES "quest_nodes"("id") ON DELETE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quest_edges_graph_pair_unique" ON "quest_edges" ("graph_id","from_node_id","to_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quest_edges_graph_idx" ON "quest_edges" ("graph_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quest_edges_from_idx" ON "quest_edges" ("from_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quest_edges_to_idx" ON "quest_edges" ("to_node_id");
