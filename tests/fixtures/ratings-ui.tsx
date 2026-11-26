import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import books from "../../src/web/locales/en/books.json";
import { AuthProvider } from "../../src/web/app/auth-context";
import { BookReviewPage } from "../../src/web/app/pages/books/review/BookReviewPage";
import {
  ratingSystemSettingsSchema,
  type BookReview,
  type BookReviewDraftInput,
} from "../../src/shared/ratings";
import "../../src/web/styles/tokens.css";
import "../../src/web/styles/themes/feylore.css";

const state = {
  review: null as BookReview | null,
  failSave: false,
  failPost: false,
  saves: 0,
  posts: 0,
  finalizations: 0,
};
Object.assign(window, { ratingsTest: state });
window.fetch = async (input, init) => {
  const url = String(input);
  const response = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  if (url.endsWith("/auth/me"))
    return response({
      data: { user: { id: "tester", permissions: ["books.write"] } },
    });
  if (url.endsWith("/config"))
    return response({
      data: {
        settings: ratingSystemSettingsSchema.parse({}),
        coreDimensions: [
          {
            id: "b97c7035-253a-4309-9b58-ff215019d7c6",
            key: "enjoyment",
            name: "Enjoyment",
            description: "How much did you enjoy the reading experience?",
            scope: "core",
            enabled: true,
            contributesToRating: true,
            weight: 1,
            displayOrder: 0,
            required: false,
          },
        ],
        genreDefinitions: [
          {
            genreTermId: "7071427e-66aa-4564-ab4b-a86705161f76",
            genreName: "Fantasy",
            selectedGenreTermId: "0ef7426a-b851-424a-be2d-a84c4e132816",
            selectedGenreName: "Romantasy",
            parentGenreName: null,
            mediaType: "books",
            inheritanceMode: "custom",
            inheritedFrom: "Fantasy",
            enabled: true,
            displayOrder: 0,
            dimensions: [
              {
                id: "bfdd4390-e110-4ad7-ae61-b632778c44c2",
                key: "worldbuilding",
                name: "Worldbuilding",
                description:
                  "How vivid and internally consistent was the world?",
                scope: "genre",
                enabled: true,
                contributesToRating: true,
                weight: 1,
                displayOrder: 0,
                required: false,
              },
            ],
          },
        ],
        externalProviders: [
          {
            key: "fixture",
            label: "Test provider",
            enabled: true,
            userAuthorized: true,
          },
        ],
      },
    });
  if (init?.method === "PUT" && !url.endsWith("/finalize")) {
    state.saves++;
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (state.failSave)
      return response({ error: { message: "Test save failure" } }, 503);
    const draft = JSON.parse(String(init.body)) as BookReviewDraftInput;
    state.review = {
      status: "draft",
      finalRating: null,
      recommendation: null,
      summary: null,
      review: null,
      coreValues: {},
      genreValues: {},
      trajectory: [],
      reviewEdited: false,
      completedAt: null,
      externalPosts: {},
      ...state.review,
      ...draft,
      suggestedRating: draft.coreValues?.enjoyment ?? null,
    };
    state.review.status = "draft";
    return response({ data: { review: state.review } });
  }
  if (url.endsWith("/finalize")) {
    if (state.failSave)
      return response({ error: { message: "Test save failure" } }, 503);
    state.finalizations++;
    state.review ??= {
      status: "completed",
      coreValues: {},
      genreValues: {},
      trajectory: [],
      finalRating: null,
      suggestedRating: null,
      recommendation: null,
      summary: null,
      review: null,
      reviewEdited: false,
      completedAt: null,
      externalPosts: {},
    };
    Object.assign(state.review!, JSON.parse(String(init?.body)), {
      status: "completed",
    });
    return response({ data: { review: state.review } });
  }
  if (init?.method === "POST") {
    state.posts++;
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (state.failPost)
      return response({ error: { message: "Test post failure" } }, 503);
    state.review!.externalPosts.fixture = {
      status: "posted",
      externalPostId: "fixture",
      postedAt: null,
      lastError: null,
    };
    return response({ data: { review: state.review } });
  }
  if (init?.method === "DELETE") state.review = null;
  return response({ data: { review: state.review } });
};

await i18n.use(initReactI18next).init({
  lng: "en",
  resources: { en: { books } },
  interpolation: { escapeValue: false },
});
history.replaceState(null, "", "/books/fixture");
createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <BrowserRouter>
      <main style={{ maxWidth: "60rem", margin: "3rem auto", padding: "1rem" }}>
        <h1>The Library Book</h1>
        <Link id="book-review-opener" to="/books/fixture/review">
          Rate &amp; Review
        </Link>
        <Routes>
          <Route path="/books/:slug/review" element={<BookReviewPage />} />
          <Route
            path="/books/:slug"
            element={<p>A book in your personal library.</p>}
          />
        </Routes>
      </main>
    </BrowserRouter>
  </AuthProvider>,
);
