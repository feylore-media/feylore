ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

CREATE TABLE "user_oidc_identities" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider_key" text DEFAULT 'default' NOT NULL,
  "issuer" text NOT NULL,
  "subject" text NOT NULL,
  "email" text,
  "display_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_login_at" timestamp with time zone
);

CREATE UNIQUE INDEX "user_oidc_identities_provider_issuer_subject_idx" ON "user_oidc_identities" ("provider_key","issuer","subject");
CREATE UNIQUE INDEX "user_oidc_identities_user_provider_idx" ON "user_oidc_identities" ("user_id","provider_key");
CREATE INDEX "user_oidc_identities_user_id_idx" ON "user_oidc_identities" ("user_id");

CREATE TABLE "oidc_auth_states" (
  "id" uuid PRIMARY KEY NOT NULL,
  "state" text NOT NULL,
  "nonce" text NOT NULL,
  "code_verifier" text NOT NULL,
  "mode" text NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE cascade,
  "return_to" text,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "oidc_auth_states_state_idx" ON "oidc_auth_states" ("state");
CREATE INDEX "oidc_auth_states_expires_idx" ON "oidc_auth_states" ("expires_at");
