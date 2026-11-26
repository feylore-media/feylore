import { outboundFetch } from "../../server/modules/metadata/outbound-fetch.js";
import { normalizeApiKey } from "./auth.js";
import type { HardcoverSearchPlan } from "./search-strategy.js";
import type {
  HardcoverBook,
  HardcoverEdition,
  HardcoverGraphQlResponse,
  HardcoverRecords,
} from "./types.js";

const HARDCOVER_API = "https://api.hardcover.app/v1/graphql";
const USER_AGENT = "Feylore/1.0";

const BOOK_FIELDS = `
  id
  title
  subtitle
  description
  release_date
  pages
  rating
  slug
  cached_image
  cached_tags
  contributions { author { name } }
  book_series { position series { name } }
  editions {
    id
    isbn_10
    isbn_13
    pages
    release_date
    physical_format
    publisher { name }
    language { language }
  }
`;

const EDITION_FIELDS = `
  id
  isbn_10
  isbn_13
  pages
  release_date
  physical_format
  publisher { name }
  language { language }
  book {
    ${BOOK_FIELDS}
  }
`;

function parseHardcoverApiError(status: number, body: string): string {
  const fallback = `Hardcover API returned ${status}`;
  try {
    const parsed = JSON.parse(body) as {
      error?: string;
      error_description?: string;
      message?: string;
      errors?: Array<{ message?: string }>;
    };
    if (parsed.error_description) return parsed.error_description;
    if (parsed.message) return parsed.message;
    if (parsed.error) return parsed.error;
    if (parsed.errors?.[0]?.message) return parsed.errors[0].message;
  } catch {
    // non-JSON body
  }
  return fallback;
}

async function hardcoverGraphQl<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<HardcoverGraphQlResponse<T>> {
  const { status, body } = await outboundFetch(HARDCOVER_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: normalizeApiKey(apiKey),
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (status < 200 || status >= 300) {
    throw new Error(parseHardcoverApiError(status, body));
  }
  return JSON.parse(body) as HardcoverGraphQlResponse<T>;
}

function recordsFromBook(book: HardcoverBook): HardcoverRecords {
  return {
    book,
    editions: book.editions ?? [],
  };
}

async function fetchByIsbn13(
  apiKey: string,
  isbn: string,
): Promise<HardcoverRecords | null> {
  const result = await hardcoverGraphQl<{ editions?: HardcoverEdition[] }>(
    apiKey,
    `query EditionsByIsbn13($isbn: String!) {
      editions(where: { isbn_13: { _eq: $isbn } }) {
        ${EDITION_FIELDS}
      }
    }`,
    { isbn },
  );
  if (result.errors?.length) return null;
  const editions = result.data?.editions ?? [];
  if (editions.length === 0) return null;
  const book = editions[0]?.book;
  if (!book) return null;
  return { book, editions };
}

async function fetchByIsbn10(
  apiKey: string,
  isbn: string,
): Promise<HardcoverRecords | null> {
  const result = await hardcoverGraphQl<{ editions?: HardcoverEdition[] }>(
    apiKey,
    `query EditionsByIsbn10($isbn: String!) {
      editions(where: { isbn_10: { _eq: $isbn } }) {
        ${EDITION_FIELDS}
      }
    }`,
    { isbn },
  );
  if (result.errors?.length) return null;
  const editions = result.data?.editions ?? [];
  if (editions.length === 0) return null;
  const book = editions[0]?.book;
  if (!book) return null;
  return { book, editions };
}

async function fetchByTitle(
  apiKey: string,
  title: string,
): Promise<HardcoverRecords | null> {
  const result = await hardcoverGraphQl<{
    search?: { results?: Array<{ book?: HardcoverBook }> };
  }>(
    apiKey,
    `query Search($query: String!) {
      search(query: $query, query_type: "Book", per_page: 1, page: 1) {
        results {
          book {
            ${BOOK_FIELDS}
          }
        }
      }
    }`,
    { query: title },
  );
  if (result.errors?.length) return null;
  const book = result.data?.search?.results?.[0]?.book;
  if (!book) return null;
  return recordsFromBook(book);
}

export async function fetchHardcoverRecords(
  plan: HardcoverSearchPlan,
  apiKey: string,
): Promise<HardcoverRecords | null> {
  switch (plan.type) {
    case "isbn13":
      return fetchByIsbn13(apiKey, plan.isbn);
    case "isbn10":
      return fetchByIsbn10(apiKey, plan.isbn);
    case "title":
      return fetchByTitle(apiKey, plan.title);
  }
}

export async function testHardcoverConnection(
  apiKey: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await hardcoverGraphQl<{
      me?: { id?: number; username?: string } | Array<{ id?: number; username?: string }>;
      search?: { results?: Array<{ query?: string }> };
    }>(
      apiKey,
      `query TestHardcoverConnection {
        me { id username }
        search(query: "a", query_type: "Book", per_page: 1, page: 1) {
          results { query }
        }
      }`,
      {},
    );
    if (result.errors?.length) {
      return {
        ok: false,
        message: result.errors[0]?.message ?? "Auth failed",
      };
    }
    const me = result.data?.me;
    const meRecord = Array.isArray(me) ? me[0] : me;
    if (meRecord?.username) {
      return { ok: true, message: `Connected as ${meRecord.username}` };
    }
    if (result.data?.search) {
      return { ok: true, message: "Connected" };
    }
    return { ok: false, message: "Unexpected response from Hardcover" };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

/** @internal Exposed for integration tests asserting auth header normalization. */
export { hardcoverGraphQl as hardcoverGraphQlForTests };
