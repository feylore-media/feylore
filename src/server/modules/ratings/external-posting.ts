import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { ValidationError } from "../../../shared/errors.js";
import { decryptConfig, encryptConfig } from "../../security/secrets.js";
import { outboundFetch } from "../metadata/outbound-fetch.js";
import type {
  BookReview,
  ExternalPostState,
  ExternalProviderInfo,
  RatingSystemSettings,
} from "../../../shared/ratings.js";
import type { RatingConfigService } from "./config-service.js";

const HARDCOVER_API = "https://api.hardcover.app/v1/graphql";
const USER_AGENT = "Feylore/1.0";

export interface ExternalPostContext {
  userId: string;
  bookId: string;
  bookTitle: string;
  bookSlug: string;
}

export interface ExternalPostResult {
  externalPostId: string;
  postedAt: string;
}

export interface ExternalPostingAdapter {
  key: string;
  label: string;
  description: string;
  isConfigured(settings: RatingSystemSettings): boolean;
  post(
    context: ExternalPostContext,
    review: BookReview,
    token: string,
  ): Promise<ExternalPostResult>;
}

const adapters = new Map<string, ExternalPostingAdapter>();

export function registerExternalPostingAdapter(
  adapter: ExternalPostingAdapter,
): void {
  adapters.set(adapter.key, adapter);
}

export function getExternalPostingAdapter(
  key: string,
): ExternalPostingAdapter | undefined {
  return adapters.get(key);
}

export class ExternalPostingService {
  constructor(
    private readonly db: Database,
    private readonly config: RatingConfigService,
    private readonly encryptionSecret: string,
  ) {}

  async listProviders(userId?: string): Promise<ExternalProviderInfo[]> {
    const settings = await this.config.getSettings();
    const configuredKeys = new Set(
      settings.externalPosting.providers
        .filter((p) => p.enabled)
        .map((p) => p.key),
    );
    const providers: ExternalProviderInfo[] = [];
    for (const adapter of adapters.values()) {
      const enabled = configuredKeys.has(adapter.key);
      providers.push({
        key: adapter.key,
        enabled,
        label: adapter.label,
        description: adapter.description,
        userAuthorized:
          enabled && userId
            ? await this.isUserAuthorized(userId, adapter.key)
            : false,
      });
    }
    return providers;
  }

  async isConfigured(providerKey: string): Promise<boolean> {
    const adapter = adapters.get(providerKey);
    if (!adapter) return false;
    const settings = await this.config.getSettings();
    return adapter.isConfigured(settings);
  }

  async isUserAuthorized(
    userId: string,
    providerKey: string,
  ): Promise<boolean> {
    const credential =
      await this.db.query.userExternalPostCredentials.findFirst({
        where: and(
          eq(schema.userExternalPostCredentials.userId, userId),
          eq(schema.userExternalPostCredentials.providerKey, providerKey),
        ),
      });
    return !!credential && credential.status === "authorized";
  }

  async setCredential(
    userId: string,
    providerKey: string,
    token: string,
  ): Promise<void> {
    const adapter = adapters.get(providerKey);
    if (!adapter) {
      throw new ValidationError(
        `Unknown external posting provider: ${providerKey}`,
      );
    }
    const encrypted = encryptConfig(this.encryptionSecret, { token });
    const existing = await this.db.query.userExternalPostCredentials.findFirst({
      where: and(
        eq(schema.userExternalPostCredentials.userId, userId),
        eq(schema.userExternalPostCredentials.providerKey, providerKey),
      ),
    });
    if (existing) {
      await this.db
        .update(schema.userExternalPostCredentials)
        .set({ tokenEncrypted: encrypted, updatedAt: new Date() })
        .where(eq(schema.userExternalPostCredentials.id, existing.id));
    } else {
      await this.db.insert(schema.userExternalPostCredentials).values({
        id: randomUUID(),
        userId,
        providerKey,
        tokenEncrypted: encrypted,
      });
    }
  }

  async removeCredential(userId: string, providerKey: string): Promise<void> {
    await this.db
      .delete(schema.userExternalPostCredentials)
      .where(
        and(
          eq(schema.userExternalPostCredentials.userId, userId),
          eq(schema.userExternalPostCredentials.providerKey, providerKey),
        ),
      );
  }

  private async resolveToken(
    userId: string,
    providerKey: string,
  ): Promise<string> {
    const credential =
      await this.db.query.userExternalPostCredentials.findFirst({
        where: and(
          eq(schema.userExternalPostCredentials.userId, userId),
          eq(schema.userExternalPostCredentials.providerKey, providerKey),
        ),
      });
    if (!credential || credential.status !== "authorized") {
      throw new ValidationError(
        `External posting is not authorized for ${providerKey}`,
      );
    }
    const config = decryptConfig(
      this.encryptionSecret,
      credential.tokenEncrypted,
    );
    const token = typeof config.token === "string" ? config.token : null;
    if (!token) {
      throw new ValidationError(
        `Stored credential for ${providerKey} is invalid`,
      );
    }
    return token;
  }

  async hasCredential(providerKey: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: schema.userExternalPostCredentials.id })
      .from(schema.userExternalPostCredentials)
      .where(
        and(
          eq(schema.userExternalPostCredentials.providerKey, providerKey),
          eq(schema.userExternalPostCredentials.status, "authorized"),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async post(
    context: ExternalPostContext,
    providerKey: string,
    review: BookReview,
  ): Promise<{ state: ExternalPostState; postedAt: string }> {
    const adapter = adapters.get(providerKey);
    if (!adapter) {
      throw new ValidationError(
        `Unknown external posting provider: ${providerKey}`,
      );
    }
    if (!(await this.isConfigured(providerKey))) {
      throw new ValidationError(
        `External posting to ${adapter.label} is not enabled`,
      );
    }
    if (!(await this.isUserAuthorized(context.userId, providerKey))) {
      throw new ValidationError(
        `External posting to ${adapter.label} is not authorized for this user`,
      );
    }
    const token = await this.resolveToken(context.userId, providerKey);
    const result = await adapter.post(context, review, token);
    return {
      state: {
        status: "posted",
        externalPostId: result.externalPostId,
        postedAt: result.postedAt,
        lastError: null,
      },
      postedAt: result.postedAt,
    };
  }
}

export const hardcoverExternalPostingAdapter: ExternalPostingAdapter = {
  key: "hardcover",
  label: "Hardcover",
  description:
    "Publish your final rating and review to your Hardcover profile.",
  isConfigured(settings: RatingSystemSettings): boolean {
    return settings.externalPosting.providers.some(
      (p) => p.key === "hardcover" && p.enabled,
    );
  },
  async post(
    context: ExternalPostContext,
    review: BookReview,
    token: string,
  ): Promise<ExternalPostResult> {
    if (review.finalRating === null) {
      throw new ValidationError(
        "Final rating is required before posting to Hardcover",
      );
    }
    const bookId = await resolveHardcoverBookId(token, context.bookTitle);
    if (!bookId) {
      throw new ValidationError(
        `Could not find "${context.bookTitle}" on Hardcover to attach the review`,
      );
    }
    const rating = Math.round(review.finalRating * 2) / 2;
    const comment = review.review?.trim() || review.summary?.trim() || "";
    const mutation = `mutation PostBookReview($bookId: Int!, $rating: Float!, $comment: String) {
      insert_book_reviews(
        objects: [{ book_id: $bookId, rating: $rating, comment: $comment }]
      ) {
        returning {
          id
        }
      }
    }`;
    const { status, body } = await outboundFetch(HARDCOVER_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          bookId,
          rating,
          comment: comment || null,
        },
      }),
    });
    if (status < 200 || status >= 300 || !body) {
      throw new ValidationError(`Hardcover API returned ${status}`);
    }
    const data = JSON.parse(body) as {
      errors?: Array<{ message?: string }>;
      data?: {
        insert_book_reviews?: { returning?: Array<{ id?: string | number }> };
      };
    };
    if (data.errors?.[0]?.message) {
      throw new ValidationError(data.errors[0].message);
    }
    const created = data.data?.insert_book_reviews?.returning?.[0];
    if (!created?.id) {
      throw new ValidationError("Hardcover did not confirm the posted review");
    }
    return {
      externalPostId: String(created.id),
      postedAt: new Date().toISOString(),
    };
  },
};

async function resolveHardcoverBookId(
  token: string,
  title: string,
): Promise<number | null> {
  const query = `query SearchBook($q: String!) {
    search(query: $q, query_type: "Book", per_page: 1, page: 1) {
      results {
        book { id }
      }
    }
  }`;
  const { status, body } = await outboundFetch(HARDCOVER_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ query, variables: { q: title } }),
  });
  if (status < 200 || status >= 300 || !body) return null;
  const data = JSON.parse(body) as {
    errors?: Array<{ message?: string }>;
    data?: {
      search?: { results?: Array<{ book?: { id?: string | number } }> };
    };
  };
  const id = data.data?.search?.results?.[0]?.book?.id;
  return typeof id === "number" ? id : id ? Number(id) : null;
}
