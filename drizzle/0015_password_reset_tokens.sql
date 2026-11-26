CREATE TABLE "password_reset_tokens" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "password_reset_tokens_token_hash_idx" ON "password_reset_tokens" ("token_hash");
CREATE INDEX "password_reset_tokens_expires_idx" ON "password_reset_tokens" ("expires_at");
