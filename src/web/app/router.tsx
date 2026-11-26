import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
} from "react-router";
import { AuthProvider } from "./auth-context";
import {
  AdminSectionRoute,
  RequireAdminAccess,
  RequireAuth,
  RequireMetadataAccess,
} from "./route-guards";
import { ThemeSync } from "../theme/ThemeSync";
import { InstanceLocaleSync } from "./InstanceLocaleSync";
import { AppShell } from "./shell";
import { ShelfDnDProvider } from "../components/shelves/ShelfDnDProvider";
import { LoadingState, PlaceholderPage } from "../components/states";
import { HomePage } from "./pages/HomePage";
import { DownloadsPage } from "./pages/DownloadsPage";
import { LoginPage, ResetPasswordPage, SetupPage } from "./pages/AuthPages";
import { ShelvesPage } from "./pages/ShelvesPage";
import { ShelfDetailPage } from "./pages/ShelfDetailPage";
import { ShelfEditorPage } from "./pages/ShelfEditorPage";
import {
  SettingsLayout,
  SettingsAppearancePage,
  SettingsAccountPage,
  SettingsLanguagePage,
  SettingsPrivacyPage,
  SettingsDevicesPage,
} from "./pages/SettingsPages";
import { SettingsReaderPage } from "./pages/SettingsReaderPage";
import { SettingsMetadataPage } from "./pages/SettingsMetadataPage";
import { SettingsNotificationsPage } from "./pages/SettingsNotificationsPage";
import { AddContentPage } from "./pages/AddContentPage";
import { IngestActivityPage } from "./pages/IngestActivityPage";
import { ActivityPage } from "./pages/ActivityPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { GoalsPage, GoalBuilderPage, GoalDetailPage } from "./pages/GoalPages";
import {
  ChallengesPage,
  ChallengeBuilderPage,
  ChallengeDetailPage,
} from "./pages/ChallengePages";
import { CalendarPage } from "./pages/CalendarPage";
import { ClubsPage } from "./pages/ClubsPage";
import { ClubDetailPage } from "./pages/ClubDetailPage";
import { ClubTopicDetailPage } from "./pages/ClubTopicDetailPage";
import { SearchPage } from "./pages/SearchPage";
import { BooksLayout } from "./pages/books/BooksLayout";
import { BooksHomePage } from "./pages/books/BooksHomePage";
import { BooksBrowsePage } from "./pages/books/BooksBrowsePage";
import { BooksAuthorsPage } from "./pages/books/BooksAuthorsPage";
import { BooksSeriesPage } from "./pages/books/BooksSeriesPage";
import { BookDetailLayout } from "./pages/books/detail/BookDetailLayout";
import { BookOverviewPage } from "./pages/books/detail/BookOverviewPage";
import { BookMetadataPage } from "./pages/books/detail/BookMetadataPage";
import { BookDNAPage } from "./pages/books/detail/BookDNAPage";
import { BookHistoryPage } from "./pages/books/detail/BookHistoryPage";
import { BookMetadataEditPage } from "./pages/books/detail/BookMetadataEditPage";
import { BookReviewPage } from "./pages/books/review/BookReviewPage";
import { BookJournalPage } from "./pages/books/BookJournalPage";
import { BookEditPage } from "./pages/books/BookEditPage";
import { AudiobooksLayout } from "./pages/audiobooks/AudiobooksLayout";
import { AudiobooksHomePage } from "./pages/audiobooks/AudiobooksHomePage";
import { AudiobooksBrowsePage } from "./pages/audiobooks/AudiobooksBrowsePage";
import { AudiobooksAuthorsPage } from "./pages/audiobooks/AudiobooksAuthorsPage";
import { AudiobooksNarratorsPage } from "./pages/audiobooks/AudiobooksNarratorsPage";
import { AudiobooksSeriesPage } from "./pages/audiobooks/AudiobooksSeriesPage";
import { AudiobookDetailPage } from "./pages/audiobooks/AudiobookDetailPage";
import { PodcastsHomePage } from "./pages/podcasts/PodcastsHomePage";
import { PodcastDiscoverPage } from "./pages/podcasts/PodcastShowPage";
import { PodcastShowRoutePage } from "./pages/podcasts/PodcastShowRoutePage";
import { PodcastEpisodePage } from "./pages/podcasts/PodcastEpisodePage";
import { AudiobookEditPage } from "./pages/audiobooks/AudiobookEditPage";
import { MusicLayout } from "./pages/music/MusicLayout";
import { MusicHomePage } from "./pages/music/MusicHomePage";
import { MusicBrowsePage } from "./pages/music/MusicBrowsePage";
import { MusicArtistsPage } from "./pages/music/MusicArtistsPage";
import { MusicGenresPage } from "./pages/music/MusicGenresPage";
import { PlaylistsPage } from "./pages/music/PlaylistsPage";
import { AlbumDetailPage } from "./pages/music/AlbumDetailPage";
import { ArtistDetailPage } from "./pages/music/ArtistDetailPage";
import { PlaylistDetailPage } from "./pages/music/PlaylistDetailPage";
import { MoviesLayout } from "./pages/movies/MoviesLayout";
import { MoviesHomePage } from "./pages/movies/MoviesHomePage";
import { MoviesBrowsePage } from "./pages/movies/MoviesBrowsePage";
import { MoviesGenresPage } from "./pages/movies/MoviesGenresPage";
import { MovieCollectionsPage } from "./pages/movies/MovieCollectionsPage";
import { MovieCollectionDetailPage } from "./pages/movies/MovieCollectionDetailPage";
import { MovieDetailPage } from "./pages/movies/MovieDetailPage";
import { MoviePersonPage } from "./pages/movies/MoviePersonPage";
import { TvLayout } from "./pages/tv/TvLayout";
import { TvHomePage } from "./pages/tv/TvHomePage";
import { TvBrowsePage } from "./pages/tv/TvBrowsePage";
import { TvShowPage } from "./pages/tv/TvShowPage";
import { TvSeasonPage } from "./pages/tv/TvSeasonPage";
import { TvEpisodePage } from "./pages/tv/TvEpisodePage";
import { TvLivePage } from "./pages/tv/TvLivePage";
import { TvLiveChannelPage } from "./pages/tv/TvLiveChannelPage";
import { PeopleEntityPage } from "./pages/people/PeopleEntityPage";
import { PeopleEditPage } from "./pages/people/PeopleEditPage";
import { ContextualPeoplePage } from "./pages/people/ContextualPeoplePage";
import {
  AdminLayout,
  AdminDashboardPage,
  AdminStatusPage,
  AdminConversionPage,
  AdminDestinationPlaceholder,
} from "./pages/AdminPages";
import { UserProfilePage } from "./pages/UserProfilePage";
import { StatsPage, StatsRedirect } from "./pages/stats/StatsPage";
import { SettingsProfilePage } from "./pages/SettingsProfilePage";
import { fetchSetupRequired } from "./api";
import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { PlaybackLabPage } from "./pages/dev/PlaybackLabPage";

const BookReaderPage = lazy(() =>
  import("./pages/books/BookReaderPage").then((module) => ({
    default: module.BookReaderPage,
  })),
);

function lazyPage<T extends Record<string, unknown>>(
  loader: () => Promise<T>,
  exportName: keyof T,
) {
  return lazy(async () => ({
    default: (await loader())[exportName] as ComponentType,
  }));
}

const AdminModulesPage = lazyPage(
  () => import("./pages/admin/AdminModulesPage"),
  "AdminModulesPage",
);
const AdminProcessingPage = lazyPage(
  () => import("./pages/admin/AdminProcessingPage"),
  "AdminProcessingPage",
);
const AdminStoragePage = lazyPage(
  () => import("./pages/admin/AdminStoragePage"),
  "AdminStoragePage",
);
const AdminJobsPage = lazyPage(
  () => import("./pages/admin/AdminJobsPage"),
  "AdminJobsPage",
);
const AdminRatingsPage = lazyPage(
  () => import("./pages/admin/AdminRatingsPage"),
  "AdminRatingsPage",
);
const AdminUsersPage = lazyPage(
  () => import("./pages/admin/AdminUsersPage"),
  "AdminUsersPage",
);
const AdminRolesPage = lazyPage(
  () => import("./pages/admin/AdminRolesPage"),
  "AdminRolesPage",
);
const AdminPermissionsPage = lazyPage(
  () => import("./pages/admin/AdminPermissionsPage"),
  "AdminPermissionsPage",
);
const AdminConfigurationPage = lazyPage(
  () => import("./pages/admin/AdminConfigurationPage"),
  "AdminConfigurationPage",
);
const AdminAppearancePage = lazyPage(
  () => import("./pages/admin/AdminAppearancePage"),
  "AdminAppearancePage",
);
const MetadataProvidersLayout = lazyPage(
  () => import("./pages/admin/metadata/MetadataProvidersLayout"),
  "MetadataProvidersLayout",
);
const MetadataProvidersPage = lazyPage(
  () => import("./pages/admin/metadata/MetadataProvidersPage"),
  "MetadataProvidersPage",
);
const MetadataAggregationLayout = lazyPage(
  () => import("./pages/admin/metadata/MetadataAggregationLayout"),
  "MetadataAggregationLayout",
);
const MetadataAggregationPage = lazyPage(
  () => import("./pages/admin/metadata/MetadataAggregationPage"),
  "MetadataAggregationPage",
);
const MetadataFormattingPage = lazyPage(
  () => import("./pages/admin/metadata/MetadataFormattingPage"),
  "MetadataFormattingPage",
);

function LegacyMetadataRedirect() {
  const { moduleId } = useParams();
  return (
    <Navigate to={`/admin/metadata/providers/${moduleId ?? ""}`} replace />
  );
}

/**
 * Compatibility-only alias. `/u/:username` never appears in Feylore UI;
 * redirect to the canonical `/users/:username` profile link.
 */
function LegacyUserProfileRedirect() {
  const { username } = useParams<{ username: string }>();
  return <Navigate to={`/users/${username ?? ""}`} replace />;
}

function Bootstrap() {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  useEffect(() => {
    void fetchSetupRequired()
      .then((r) => setSetupRequired(r.data.required))
      .catch(() => setSetupRequired(false));
  }, []);

  if (setupRequired === null) return <LoadingState />;
  if (setupRequired) return <SetupPage />;
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
      <Route
        element={
          <RequireAuth>
            <ShelfDnDProvider>
              <AppShell />
            </ShelfDnDProvider>
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="shelves" element={<ShelvesPage />} />
        <Route path="shelves/new" element={<ShelfEditorPage />} />
        <Route path="shelves/:id/edit" element={<ShelfEditorPage />} />
        <Route path="shelves/:id" element={<ShelfDetailPage />} />
        <Route path="universes" element={<PlaceholderPage />} />
        <Route path="books" element={<BooksLayout />}>
          <Route index element={<BooksHomePage />} />
          <Route path="library" element={<BooksBrowsePage />} />
          <Route path="authors" element={<BooksAuthorsPage />} />
          <Route path="series" element={<BooksSeriesPage />} />
          <Route
            path="continue"
            element={<BooksBrowsePage defaultView="continue" lockView />}
          />
          <Route
            path="recent"
            element={<BooksBrowsePage defaultView="recent" lockView />}
          />
          <Route
            path="favorites"
            element={<BooksBrowsePage defaultFavorite lockView />}
          />
          <Route path="import" element={<Navigate to="/add" replace />} />
          <Route path="new" element={<BookEditPage />} />
          <Route path=":slug/edit" element={<BookMetadataEditPage />} />
          <Route path=":slug" element={<BookDetailLayout />}>
            <Route index element={<BookOverviewPage />} />
            <Route path="metadata" element={<BookMetadataPage />} />
            <Route path="journal" element={<BookJournalPage />} />
            <Route path="dna" element={<BookDNAPage />} />
            <Route path="history" element={<BookHistoryPage />} />
            <Route path="review" element={<BookReviewPage />} />
          </Route>
          <Route
            path="authors/people"
            element={<Navigate to="/books/authors" replace />}
          />
        </Route>
        <Route
          path="read/book/:slug"
          element={
            <Suspense fallback={<LoadingState />}>
              <BookReaderPage />
            </Suspense>
          }
        />
        <Route path="audiobooks" element={<AudiobooksLayout />}>
          <Route index element={<AudiobooksHomePage />} />
          <Route path="library" element={<AudiobooksBrowsePage />} />
          <Route path="authors" element={<AudiobooksAuthorsPage />} />
          <Route path="narrators" element={<AudiobooksNarratorsPage />} />
          <Route path="series" element={<AudiobooksSeriesPage />} />
          <Route
            path="continue"
            element={<AudiobooksBrowsePage defaultView="continue" lockView />}
          />
          <Route
            path="recent"
            element={<AudiobooksBrowsePage defaultView="recent" lockView />}
          />
          <Route
            path="favorites"
            element={<AudiobooksBrowsePage defaultFavorite lockView />}
          />
          <Route path="new" element={<AudiobookEditPage />} />
          <Route path="podcasts" element={<PodcastsHomePage />} />
          <Route path="podcasts/discover" element={<PodcastDiscoverPage />} />
          <Route path="podcasts/:slug" element={<PodcastShowRoutePage />} />
          <Route
            path="podcasts/:slug/:episodeSlug"
            element={<PodcastEpisodePage />}
          />
          <Route path=":slug" element={<AudiobookDetailPage />} />
          <Route path=":slug/edit" element={<AudiobookEditPage />} />
          <Route
            path="narrators/people"
            element={<Navigate to="/audiobooks/narrators" replace />}
          />
        </Route>
        <Route path="music" element={<MusicLayout />}>
          <Route index element={<MusicHomePage />} />
          <Route path="albums" element={<MusicBrowsePage />} />
          <Route path="artists" element={<MusicArtistsPage />} />
          <Route path="genres" element={<MusicGenresPage />} />
          <Route path="playlists" element={<PlaylistsPage />} />
          <Route path="albums/:slug" element={<AlbumDetailPage />} />
          <Route path="artists/:slug" element={<ArtistDetailPage />} />
          <Route path="playlists/:slug" element={<PlaylistDetailPage />} />
          <Route
            path="artists/people"
            element={
              <ContextualPeoplePage
                endpoint="/music/artists/people"
                title="Artists"
              />
            }
          />
        </Route>
        <Route path="movies" element={<MoviesLayout />}>
          <Route index element={<MoviesHomePage />} />
          <Route path="browse" element={<MoviesBrowsePage />} />
          <Route path="genres" element={<MoviesGenresPage />} />
          <Route path="collections" element={<MovieCollectionsPage />} />
          <Route
            path="collections/:slug"
            element={<MovieCollectionDetailPage />}
          />
          <Route path="people/:slug" element={<MoviePersonPage />} />
          <Route
            path="people/list"
            element={
              <ContextualPeoplePage
                endpoint="/movies/people/list"
                title="Cast & Crew"
              />
            }
          />
          <Route
            path="continue"
            element={<MoviesBrowsePage defaultView="continue" lockView />}
          />
          <Route
            path="recent"
            element={<MoviesBrowsePage defaultView="recent" lockView />}
          />
          <Route
            path="favorites"
            element={<MoviesBrowsePage defaultFavorite lockView />}
          />
          <Route path=":slug" element={<MovieDetailPage />} />
        </Route>
        <Route path="tv" element={<TvLayout />}>
          <Route index element={<TvHomePage />} />
          <Route path="browse" element={<TvBrowsePage />} />
          <Route path="live" element={<TvLivePage />} />
          <Route path="live/:channelId" element={<TvLiveChannelPage />} />
          <Route
            path="continue"
            element={<TvBrowsePage defaultView="continue" lockView />}
          />
          <Route
            path="recent"
            element={<TvBrowsePage defaultView="recent" lockView />}
          />
          <Route
            path="favorites"
            element={<TvBrowsePage defaultFavorite lockView />}
          />
          <Route path="shows/:slug" element={<TvShowPage />} />
          <Route path="shows/:slug/s/:season" element={<TvSeasonPage />} />
          <Route
            path="shows/:slug/s/:season/e/:episode"
            element={<TvEpisodePage />}
          />
        </Route>
        <Route path="photos" element={<PlaceholderPage />} />
        <Route path="ttrpg" element={<PlaceholderPage />} />
        <Route path="add" element={<AddContentPage />} />
        <Route path="users/:username/stats/:domain" element={<StatsPage />} />
        <Route path="users/:username/stats" element={<StatsPage />} />
        <Route path="users/:username" element={<UserProfilePage />} />
        <Route path="u/:username" element={<LegacyUserProfileRedirect />} />
        <Route
          path="clubs/:id/topics/:topicId"
          element={<ClubTopicDetailPage />}
        />
        <Route
          path="clubs/:id/nominations"
          element={<ClubDetailPage view="nominations" />}
        />
        <Route
          path="clubs/:id/current-read"
          element={<ClubDetailPage view="current-read" />}
        />
        <Route
          path="clubs/:id/library"
          element={<ClubDetailPage view="library" />}
        />
        <Route
          path="clubs/:id/members"
          element={<ClubDetailPage view="members" />}
        />
        <Route
          path="clubs/:id/stats"
          element={<ClubDetailPage view="stats" />}
        />
        <Route
          path="clubs/:id/activity"
          element={<ClubDetailPage view="activity" />}
        />
        <Route
          path="clubs/:id/settings"
          element={<ClubDetailPage view="settings" />}
        />
        <Route
          path="clubs/:id/reads/:readId"
          element={<ClubDetailPage view="read" />}
        />
        <Route
          path="clubs/:id/selection-rounds/:roundId"
          element={<ClubDetailPage view="selection" />}
        />
        <Route
          path="clubs/:id/discussions"
          element={<ClubDetailPage view="discussions" />}
        />
        <Route
          path="clubs/:id/challenges"
          element={<ClubDetailPage view="challenges" />}
        />
        <Route path="clubs/:id" element={<ClubDetailPage />} />
        <Route path="clubs" element={<ClubsPage />} />
        <Route path="activity/ingest" element={<IngestActivityPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="goals/new" element={<GoalBuilderPage />} />
        <Route path="goals/:id/edit" element={<GoalBuilderPage />} />
        <Route path="goals/:id" element={<GoalDetailPage />} />
        <Route path="challenges" element={<ChallengesPage />} />
        <Route path="challenges/new" element={<ChallengeBuilderPage />} />
        <Route path="challenges/:id/edit" element={<ChallengeBuilderPage />} />
        <Route path="challenges/:id" element={<ChallengeDetailPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="downloads" element={<DownloadsPage />} />
        <Route path="stats" element={<StatsRedirect />} />
        <Route path="people/:slug/edit" element={<PeopleEditPage />} />
        <Route path="people/:slug" element={<PeopleEntityPage />} />
        <Route
          path="dev/playback"
          element={
            <RequireAdminAccess>
              <PlaybackLabPage />
            </RequireAdminAccess>
          }
        />
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="/settings/account" replace />} />
          <Route path="account" element={<SettingsAccountPage />} />
          <Route path="profile" element={<SettingsProfilePage />} />
          <Route path="appearance" element={<SettingsAppearancePage />} />
          <Route path="language" element={<SettingsLanguagePage />} />
          <Route path="privacy" element={<SettingsPrivacyPage />} />
          <Route path="notifications" element={<SettingsNotificationsPage />} />
          <Route path="devices" element={<SettingsDevicesPage />} />
          <Route path="reader" element={<SettingsReaderPage />} />
          <Route path="metadata" element={<SettingsMetadataPage />} />
        </Route>
        <Route
          path="admin"
          element={
            <RequireAdminAccess>
              <AdminLayout />
            </RequireAdminAccess>
          }
        >
          <Route index element={<AdminDashboardPage />} />
          <Route path="status" element={<AdminStatusPage />} />

          {/* Library */}
          <Route
            path="library/modules"
            element={
              <AdminSectionRoute sectionId="modules">
                <AdminModulesPage />
              </AdminSectionRoute>
            }
          />
          <Route
            path="library/storage"
            element={
              <AdminSectionRoute sectionId="storage">
                <AdminStoragePage />
              </AdminSectionRoute>
            }
          />

          <Route
            path="processing"
            element={
              <AdminSectionRoute sectionId="processing">
                <AdminProcessingPage />
              </AdminSectionRoute>
            }
          />
          <Route
            path="jobs"
            element={
              <AdminSectionRoute sectionId="jobs">
                <AdminJobsPage />
              </AdminSectionRoute>
            }
          />

          {/* Metadata */}
          <Route
            path="metadata/providers"
            element={
              <RequireMetadataAccess>
                <MetadataProvidersLayout />
              </RequireMetadataAccess>
            }
          >
            <Route path=":moduleId" element={<MetadataProvidersPage />} />
          </Route>
          <Route
            path="metadata/aggregation"
            element={
              <RequireMetadataAccess>
                <MetadataAggregationLayout />
              </RequireMetadataAccess>
            }
          >
            <Route path=":moduleId" element={<MetadataAggregationPage />} />
          </Route>
          <Route
            path="metadata/formatting"
            element={
              <AdminSectionRoute sectionId="metadata-formatting">
                <MetadataFormattingPage />
              </AdminSectionRoute>
            }
          />
          <Route
            path="metadata/ratings"
            element={
              <AdminSectionRoute sectionId="ratings">
                <AdminRatingsPage />
              </AdminSectionRoute>
            }
          />

          {/* Conversion */}
          <Route
            path="conversion"
            element={
              <AdminSectionRoute sectionId="conversion">
                <AdminConversionPage />
              </AdminSectionRoute>
            }
          />

          {/* Access */}
          <Route
            path="access/users"
            element={
              <AdminSectionRoute sectionId="users">
                <AdminUsersPage />
              </AdminSectionRoute>
            }
          />
          <Route
            path="access/roles"
            element={
              <AdminSectionRoute sectionId="roles">
                <AdminRolesPage />
              </AdminSectionRoute>
            }
          />
          <Route
            path="access/permissions"
            element={
              <AdminSectionRoute sectionId="permissions">
                <AdminPermissionsPage />
              </AdminSectionRoute>
            }
          />

          {/* Integrations */}
          <Route
            path="integrations"
            element={
              <AdminSectionRoute sectionId="integrations">
                <AdminDestinationPlaceholder destinationKey="integrations" />
              </AdminSectionRoute>
            }
          />

          {/* System */}
          <Route
            path="system/configuration"
            element={
              <AdminSectionRoute sectionId="configuration">
                <AdminConfigurationPage />
              </AdminSectionRoute>
            }
          />
          <Route
            path="system/appearance"
            element={
              <AdminSectionRoute sectionId="appearance">
                <AdminAppearancePage />
              </AdminSectionRoute>
            }
          />
          <Route
            path="system/audit"
            element={
              <AdminSectionRoute sectionId="audit">
                <AdminDestinationPlaceholder destinationKey="audit" />
              </AdminSectionRoute>
            }
          />

          {/* Legacy redirects */}
          <Route
            path="modules"
            element={<Navigate to="/admin/library/modules" replace />}
          />
          <Route
            path="users"
            element={<Navigate to="/admin/access/users" replace />}
          />
          <Route
            path="roles"
            element={<Navigate to="/admin/access/roles" replace />}
          />
          <Route
            path="permissions"
            element={<Navigate to="/admin/access/permissions" replace />}
          />
          <Route
            path="audit"
            element={<Navigate to="/admin/system/audit" replace />}
          />
          <Route
            path="metadata"
            element={<Navigate to="/admin/metadata/providers" replace />}
          />
          <Route
            path="metadata/:moduleId"
            element={<LegacyMetadataRedirect />}
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeSync />
        <InstanceLocaleSync />
        <Bootstrap />
      </AuthProvider>
    </BrowserRouter>
  );
}
