import { ClubSelectionExperienceService } from "./modules/clubs/selection-experience.js";
import { ClubExperienceService } from "./modules/clubs/experience.js";
import { ClubUpcomingService } from "./modules/clubs/upcoming.js";
import { CalendarService } from "./modules/calendar/service.js";
import { ClubPresenceService } from "./modules/clubs/presence.js";
import { ClubSelectionService } from "./modules/clubs/selection.js";
import { ClubReadsService } from "./modules/clubs/reads.js";
import type { AppConfig } from "./config.js";
import type { Database } from "./db/client.js";
import { StatsFactRecorder } from "./modules/stats/facts.js";
import { StatsService } from "./modules/stats/service.js";
import { AuthService } from "./modules/auth/service.js";
import { AuthPolicyService } from "./modules/auth/auth-policy.js";
import { OidcService } from "./modules/auth/oidc/service.js";
import { AuthorizationService } from "./modules/authorization/service.js";
import { StorageService } from "./modules/storage/adapter.js";
import { FileService, FileReferenceRegistry } from "./modules/files/service.js";
import { MetadataProviderRegistry } from "./modules/metadata/registry.js";
import { MetadataService } from "./modules/metadata/service.js";
import { MetadataPolicyService } from "./modules/metadata/policy.js";
import { MetadataProvenanceService } from "./modules/metadata/provenance.js";
import { MetadataCanonicalService } from "./modules/metadata/canonical.js";
import { CustomFieldService } from "./modules/metadata/custom-fields.js";
import { MetadataFormattingService } from "./modules/metadata/formatting.js";
import { bootstrapMetadataProviders } from "./modules/metadata/bootstrap.js";
import { getConfigEncryptionSecret } from "./security/secrets.js";
import { RatingConfigService } from "./modules/ratings/config-service.js";
import { ReviewService } from "./modules/ratings/review-service.js";
import {
  ExternalPostingService,
  hardcoverExternalPostingAdapter,
  registerExternalPostingAdapter,
} from "./modules/ratings/external-posting.js";
import { JobService } from "./modules/jobs/service.js";
import { PostgresSearchIndex } from "./modules/search/index.js";
import { ShelfService } from "./modules/shelves/service.js";
import { ClubService } from "./modules/clubs/service.js";
import { ClubDiscussionService } from "./modules/clubs/discussion.js";
import { ClubWorksService } from "./modules/clubs/works.js";
import { ClubScheduleService } from "./modules/clubs/schedules.js";
import { ClubCheckInService } from "./modules/clubs/check-ins.js";
import { ClubDiscussionAnchorsService } from "./modules/clubs/discussion-anchors.js";
import { ClubPollDiscoveryService } from "./modules/clubs/poll-discovery.js";
import { ClubPollsService } from "./modules/clubs/polls.js";
import { ClubQuotesService } from "./modules/clubs/quotes.js";
import { ClubOverviewService } from "./modules/clubs/overview.js";
import { DownloadService, DeviceService } from "./modules/downloads/service.js";
import { AuditService } from "./modules/audit/service.js";
import { RepresentationService } from "./modules/representations/service.js";
import { LibraryMembershipService } from "./modules/library-membership/service.js";
import { EpubPublicationService } from "./modules/books/epub-publication.js";
import { BooksService } from "./modules/books/service.js";
import { PhysicalHoldingService } from "./modules/books/physical-holdings.js";
import { AudiobooksService } from "./modules/audiobooks/service.js";
import { MusicService } from "./modules/music/service.js";
import { MoviesService } from "./modules/movies/service.js";
import { TvService } from "./modules/tv/service.js";
import { PodcastsService } from "./modules/podcasts/service.js";
import { UserStateService } from "./modules/user-state/service.js";
import { RelationshipService } from "./modules/relationships/service.js";
import { SettingsService } from "./modules/settings/service.js";
import { SystemSettingsService } from "./modules/settings/system-service.js";
import { MetadataPersistenceService } from "./modules/settings/metadata-persistence-service.js";
import { MetadataPersistenceSyncService } from "./modules/metadata/metadata-persistence-sync.js";
import { ApplicationConfigService } from "./modules/settings/application-config-service.js";
import { CoverPipeline } from "./modules/metadata/cover.js";
import { LibraryService } from "./modules/libraries/service.js";
import { IngestService } from "./modules/ingest/service.js";
import { ActivityService } from "./modules/activity/service.js";
import { PlaybackService } from "./modules/playback/service.js";
import { ReadingProgressService } from "./modules/reading-progress/service.js";
import { ReadingActivityService } from "./modules/reading-activity/service.js";
import { ReadingSessionService } from "./modules/reading-sessions/service.js";
import { getReadingSessionPolicy } from "./modules/reading-sessions/policy.js";
import { createAudiobooksMediaProcessor } from "./modules/playback/processors/audiobooks.js";
import { createPodcastsMediaProcessor } from "./modules/playback/processors/podcasts.js";
import { createMusicMediaProcessor } from "./modules/playback/processors/music.js";
import { createMoviesMediaProcessor } from "./modules/playback/processors/movies.js";
import { createTvMediaProcessor } from "./modules/playback/processors/tv.js";
import { registerMediaProcessor } from "./modules/playback/processors/registry.js";
import { HomeService } from "./modules/home/service.js";
import { GoalService } from "./modules/goals/service.js";
import { ChallengeService } from "./modules/challenges/service.js";
import { ProfileService } from "./modules/users/profile-service.js";
import { ProfilePlatformService } from "./modules/profiles/service.js";
import { UserAdminService } from "./modules/users/admin-service.js";
import { RoleAdminService } from "./modules/authorization/role-admin-service.js";
import { MailService } from "./modules/mail/service.js";
import { PasswordResetService } from "./modules/auth/password-reset.js";
import { ProcessingPolicyService } from "./modules/processing/policy-service.js";
import { ProcessingPolicyResolver } from "./modules/processing/policy-resolver.js";
import { PeopleService } from "./modules/people/service.js";
import { PersonCanonicalService } from "./modules/people/person-canonical.js";
import { PresenceService } from "./modules/presence/service.js";
import { DomainEventBus } from "./modules/notifications/events.js";
import {
  NotificationService,
  registerNotificationSource,
} from "./modules/notifications/service.js";
import { NotificationSourceRegistry } from "./modules/notifications/sources.js";
import { PgBossEmailChannel } from "./modules/notifications/channels.js";
import { SystemAnnouncementSource } from "./modules/notifications/sources/system-announcement.js";
import { ClubMentionSource } from "./modules/notifications/sources/club-mention.js";
import { AchievementEarnedSource } from "./modules/notifications/sources/achievement-earned.js";
import { ChallengeInviteSource } from "./modules/notifications/sources/challenge-invite.js";
import {
  ChallengeCompletedSource,
  ChallengeEndingSoonSource,
  ChallengeMilestoneSource,
  ChallengeStartedSource,
} from "./modules/notifications/sources/challenge-lifecycle.js";
import { AchievementService } from "./modules/achievements/service.js";
import {
  createChallengeAchievementGuard,
  createGoalAchievementGuard,
  createSystemAchievementGuard,
} from "./modules/achievements/source-guards.js";

export interface AppContext {
  config: AppConfig;
  db: Database;
  auth: AuthService;
  authPolicy: AuthPolicyService;
  oidc?: OidcService;
  authz: AuthorizationService;
  storage: StorageService;
  files: FileService;
  fileRegistry: FileReferenceRegistry;
  metadataRegistry: MetadataProviderRegistry;
  metadata: MetadataService;
  metadataPolicy: MetadataPolicyService;
  metadataProvenance: MetadataProvenanceService;
  metadataCanonical: MetadataCanonicalService;
  customFields: CustomFieldService;
  metadataFormatting: MetadataFormattingService;
  systemSettings: SystemSettingsService;
  metadataPersistence: MetadataPersistenceService;
  metadataPersistenceSync: MetadataPersistenceSyncService;
  applicationConfig: ApplicationConfigService;
  jobs: JobService;
  search: PostgresSearchIndex;
  shelves: ShelfService;
  goals: GoalService;
  challenges: ChallengeService;
  achievements: AchievementService;
  clubs: ClubService;
  clubDiscussion: ClubDiscussionService;
  clubWorks: ClubWorksService;
  clubReads: ClubReadsService;
  clubExperience: ClubExperienceService;
  clubUpcoming: ClubUpcomingService;
  calendar: CalendarService;
  clubPresence: ClubPresenceService;
  clubSelection: ClubSelectionService;
  clubSelectionExperience: ClubSelectionExperienceService;
  clubSchedules: ClubScheduleService;
  clubCheckIns: ClubCheckInService;
  clubDiscussionAnchors: ClubDiscussionAnchorsService;
  clubPolls: ClubPollsService;
  clubQuotes: ClubQuotesService;
  clubOverview: ClubOverviewService;
  downloads: DownloadService;
  devices: DeviceService;
  audit: AuditService;
  representations: RepresentationService;
  libraryMembership: LibraryMembershipService;
  physicalHoldings: PhysicalHoldingService;
  books: BooksService;
  audiobooks: AudiobooksService;
  music: MusicService;
  movies: MoviesService;
  tv: TvService;
  podcasts: PodcastsService;
  userState: UserStateService;
  relationships: RelationshipService;
  epubPublication: EpubPublicationService;
  settings: SettingsService;
  coverPipeline: CoverPipeline;
  libraries: LibraryService;
  ingest: IngestService;
  activity: ActivityService;
  playback: PlaybackService;
  readingProgress: ReadingProgressService;
  readingActivity: ReadingActivityService;
  readingSessions: ReadingSessionService;
  home: HomeService;
  profiles: ProfileService;
  profilePlatform: ProfilePlatformService;
  userAdmin: UserAdminService;
  roleAdmin: RoleAdminService;
  mail: MailService;
  passwordReset: PasswordResetService;
  processing: ProcessingPolicyService;
  processingPolicyResolver: ProcessingPolicyResolver;
  people: PeopleService;
  personCanonical: PersonCanonicalService;
  presence: PresenceService;
  ratingsConfig: RatingConfigService;
  reviews: ReviewService;
  externalPosting: ExternalPostingService;
  domainEvents: DomainEventBus;
  notifications: NotificationService;
  stats: StatsService;
  statsRecorder: StatsFactRecorder;
}

export function createContext(config: AppConfig, db: Database): AppContext {
  const authz = new AuthorizationService(db);
  const devices = new DeviceService(db);
  const auth = new AuthService(db, config.SESSION_SECRET, authz, devices);
  const authPolicy = new AuthPolicyService(config.auth, config.oidc);
  const mail = new MailService(config.smtp);
  const passwordReset = new PasswordResetService(
    db,
    config.SESSION_SECRET,
    config.APP_URL,
    auth,
    authPolicy,
    mail,
  );
  const oidc = config.oidc
    ? new OidcService(db, config.oidc, auth, authz)
    : undefined;
  const storage = new StorageService();
  const fileRegistry = new FileReferenceRegistry();
  const files = new FileService(db, storage, fileRegistry);
  const metadataRegistry = new MetadataProviderRegistry();
  bootstrapMetadataProviders(metadataRegistry);
  const encryptionSecret = getConfigEncryptionSecret(config.SESSION_SECRET);
  const metadata = new MetadataService(db, metadataRegistry, encryptionSecret);
  const metadataPolicy = new MetadataPolicyService(db, metadataRegistry);
  const customFields = new CustomFieldService(db);
  const metadataFormatting = new MetadataFormattingService(db);
  const metadataProvenance = new MetadataProvenanceService(db);
  const systemSettings = new SystemSettingsService(db);
  const metadataPersistence = new MetadataPersistenceService(db);
  const applicationConfig = new ApplicationConfigService(db, files);
  const processing = new ProcessingPolicyService(db, systemSettings);
  const processingPolicyResolver = new ProcessingPolicyResolver(processing);
  const jobs = new JobService(db, config.DATABASE_URL);
  const search = new PostgresSearchIndex(db);
  const downloads = new DownloadService(db);
  const profiles = new ProfileService(db, files);
  const profilePlatform = new ProfilePlatformService(db);
  const stats = new StatsService(db, profiles);
  const userAdmin = new UserAdminService(
    db,
    authz,
    profiles,
    applicationConfig,
  );
  const roleAdmin = new RoleAdminService(db);
  const audit = new AuditService(db);
  const representations = new RepresentationService(db);
  const libraryMembership = new LibraryMembershipService(db);
  const physicalHoldings = new PhysicalHoldingService(db);
  const statsRecorder = new StatsFactRecorder(db);
  const userState = new UserStateService(db, statsRecorder);
  const relationships = new RelationshipService(db);
  const people = new PeopleService(db);
  const personCanonical = new PersonCanonicalService(
    metadata,
    metadataProvenance,
    people,
  );
  const books = new BooksService(
    db,
    representations,
    libraryMembership,
    files,
    metadata,
    metadataPolicy,
    metadataProvenance,
    customFields,
    userState,
    relationships,
    search,
    people,
  );
  const metadataPersistenceSync = new MetadataPersistenceSyncService(
    db,
    files,
    storage,
    books,
    metadataPersistence,
    jobs,
  );
  const metadataCanonical = new MetadataCanonicalService(
    metadata,
    metadataProvenance,
    books,
    (bookId) => metadataPersistenceSync.enqueueBookSync(bookId),
  );
  const audiobooks = new AudiobooksService(
    db,
    representations,
    libraryMembership,
    files,
    metadata,
    userState,
    relationships,
    search,
    people,
  );
  const music = new MusicService(
    db,
    representations,
    libraryMembership,
    files,
    metadata,
    userState,
    search,
    people,
  );
  const movies = new MoviesService(
    db,
    representations,
    libraryMembership,
    files,
    metadata,
    userState,
    search,
  );
  const tv = new TvService(
    db,
    representations,
    libraryMembership,
    files,
    metadata,
    userState,
    search,
  );
  const podcasts = new PodcastsService(db, representations, files, search);
  const shelves = new ShelfService(
    db,
    books,
    movies,
    libraryMembership,
    userState,
  );
  const goals = new GoalService(db);
  const challenges = new ChallengeService(db, systemSettings);
  const domainEvents = new DomainEventBus();
  const notificationSourceRegistry = new NotificationSourceRegistry();
  const notifications = new NotificationService(
    db,
    notificationSourceRegistry,
    new PgBossEmailChannel(db, jobs, () => mail.isConfigured()),
  );
  registerNotificationSource(
    domainEvents,
    notificationSourceRegistry,
    notifications,
    new SystemAnnouncementSource(),
  );
  registerNotificationSource(
    domainEvents,
    notificationSourceRegistry,
    notifications,
    new ClubMentionSource(db),
  );
  registerNotificationSource(
    domainEvents,
    notificationSourceRegistry,
    notifications,
    new AchievementEarnedSource(),
  );
  registerNotificationSource(
    domainEvents,
    notificationSourceRegistry,
    notifications,
    new ChallengeInviteSource(),
  );
  registerNotificationSource(
    domainEvents,
    notificationSourceRegistry,
    notifications,
    new ChallengeStartedSource(db),
  );
  registerNotificationSource(
    domainEvents,
    notificationSourceRegistry,
    notifications,
    new ChallengeEndingSoonSource(db),
  );
  registerNotificationSource(
    domainEvents,
    notificationSourceRegistry,
    notifications,
    new ChallengeMilestoneSource(db),
  );
  registerNotificationSource(
    domainEvents,
    notificationSourceRegistry,
    notifications,
    new ChallengeCompletedSource(),
  );
  const clubs = new ClubService(db);
  challenges.setClubService(clubs);
  const clubDiscussion = new ClubDiscussionService(db, clubs, userState, tv);
  clubDiscussion.setDomainEvents(domainEvents);
  const clubWorks = new ClubWorksService(
    db,
    clubs,
    books,
    movies,
    tv,
    userState,
  );
  clubs.setClubWorksService(clubWorks);
  const clubReads = new ClubReadsService(db, clubs, clubWorks);
  const clubSelection = new ClubSelectionService(db, clubs, clubWorks, shelves);
  const clubSelectionExperience = new ClubSelectionExperienceService(
    db,
    clubs,
    books,
    search,
  );
  const clubSchedules = new ClubScheduleService(
    db,
    clubs,
    clubWorks,
    clubDiscussion,
  );
  const clubCheckIns = new ClubCheckInService(db, clubs, clubSchedules);
  const clubPollDiscovery = new ClubPollDiscoveryService(db);
  const clubPolls = new ClubPollsService(
    db,
    clubs,
    clubWorks,
    clubPollDiscovery,
  );
  const clubQuotes = new ClubQuotesService(db, clubs, clubWorks, userState);
  const clubDiscussionAnchors = new ClubDiscussionAnchorsService(
    db,
    clubs,
    clubCheckIns,
    clubDiscussion,
  );
  const clubOverview = new ClubOverviewService(
    clubs,
    clubCheckIns,
    clubWorks,
    clubDiscussionAnchors,
    clubPolls,
    clubQuotes,
    userState,
  );
  const epubPublication = new EpubPublicationService(files);
  const settings = new SettingsService(db);
  const coverPipeline = new CoverPipeline(db, files, representations);

  representations.registerDetachHandler(fileRegistry);

  books.setPhysicalHoldingService(physicalHoldings);
  books.setJobService(jobs);
  audiobooks.setJobService(jobs);
  music.setJobService(jobs);
  movies.setJobService(jobs);
  tv.setJobService(jobs);
  podcasts.setJobService(jobs);
  podcasts.setCoverPipeline(coverPipeline);

  registerMediaProcessor(createAudiobooksMediaProcessor(files));
  registerMediaProcessor(createPodcastsMediaProcessor(files));
  registerMediaProcessor(createMusicMediaProcessor(files));
  registerMediaProcessor(createMoviesMediaProcessor(files));
  registerMediaProcessor(createTvMediaProcessor(files));

  const libraries = new LibraryService(db, files);
  const activity = new ActivityService(db);
  goals.setActivityService(activity);

  const achievements = new AchievementService(db, systemSettings);
  achievements.registerSourceGuard("system", createSystemAchievementGuard());
  achievements.registerSourceGuard("goal", createGoalAchievementGuard(db));
  achievements.registerSourceGuard(
    "challenge",
    createChallengeAchievementGuard(db),
  );
  achievements.setActivityService(activity);
  achievements.setDomainEvents(domainEvents);
  goals.setAchievementService(achievements);
  challenges.setActivityService(activity);
  challenges.setAchievementService(achievements);
  challenges.setDomainEvents(domainEvents);

  const playback = new PlaybackService(
    db,
    libraryMembership,
    representations,
    files,
    userState,
    activity,
    statsRecorder,
  );

  const readingSessionPolicy = getReadingSessionPolicy(config);
  const readingProgress = new ReadingProgressService(
    db,
    libraryMembership,
    representations,
    statsRecorder,
  );
  const readingSessions = new ReadingSessionService(db, readingSessionPolicy);
  const readingActivity = new ReadingActivityService(
    db,
    readingProgress,
    readingSessions,
    readingSessionPolicy,
    statsRecorder,
  );
  books.setReadingProgressService(readingProgress);
  clubWorks.setReadingProgressService(readingProgress);

  const home = new HomeService(
    db,
    books,
    audiobooks,
    music,
    movies,
    activity,
    shelves,
    libraryMembership,
    tv,
  );

  const ingest = new IngestService(
    db,
    config,
    jobs,
    files,
    books,
    audiobooks,
    music,
    movies,
    tv,
    metadata,
    metadataPolicy,
    metadataCanonical,
    metadataRegistry,
    coverPipeline,
    libraries,
    representations,
    processingPolicyResolver,
    metadataFormatting,
  );

  const ratingsConfig = new RatingConfigService(db);
  const clubUpcoming = new ClubUpcomingService(db, clubs);
  const calendar = new CalendarService(db, clubUpcoming);
  const clubExperience = new ClubExperienceService(
    db,
    clubs,
    books,
    readingProgress,
    userState,
    ratingsConfig,
    clubSelection,
    clubUpcoming,
  );
  const clubPresence = new ClubPresenceService(db, clubs, ratingsConfig);
  clubOverview.setExperienceService(clubExperience);
  clubDiscussion.setPrimaryProgress(readingProgress);
  clubDiscussion.setBooks(books);
  clubQuotes.setPrimaryProgress(readingProgress);
  const reviews = new ReviewService(db, ratingsConfig);
  const presence = new PresenceService(db, profiles);
  const externalPosting = new ExternalPostingService(
    db,
    ratingsConfig,
    encryptionSecret,
  );
  registerExternalPostingAdapter(hardcoverExternalPostingAdapter);

  return {
    config,
    db,
    auth,
    authPolicy,
    oidc,
    authz,
    storage,
    files,
    fileRegistry,
    metadataRegistry,
    metadata,
    metadataPolicy,
    metadataProvenance,
    metadataCanonical,
    customFields,
    metadataFormatting,
    systemSettings,
    metadataPersistence,
    metadataPersistenceSync,
    applicationConfig,
    jobs,
    search,
    shelves,
    goals,
    challenges,
    achievements,
    clubs,
    clubDiscussion,
    clubWorks,
    clubReads,
    clubExperience,
    clubUpcoming,
    calendar,
    clubPresence,
    clubSelection,
    clubSelectionExperience,
    clubSchedules,
    clubCheckIns,
    clubDiscussionAnchors,
    clubPolls,
    clubQuotes,
    clubOverview,
    downloads,
    devices,
    audit,
    representations,
    libraryMembership,
    physicalHoldings,
    books,
    audiobooks,
    music,
    movies,
    tv,
    podcasts,
    userState,
    relationships,
    epubPublication,
    settings,
    coverPipeline,
    libraries,
    ingest,
    activity,
    playback,
    readingProgress,
    readingActivity,
    readingSessions,
    home,
    profiles,
    profilePlatform,
    userAdmin,
    roleAdmin,
    mail,
    passwordReset,
    processing,
    processingPolicyResolver,
    people,
    personCanonical,
    presence,
    ratingsConfig,
    reviews,
    externalPosting,
    domainEvents,
    notifications,
    stats,
    statsRecorder,
  };
}
