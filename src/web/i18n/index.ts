import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "../locales/en/common.json";
import enNav from "../locales/en/nav.json";
import enAuth from "../locales/en/auth.json";
import enSettings from "../locales/en/settings.json";
import enEmpty from "../locales/en/empty.json";
import enBooks from "../locales/en/books.json";
import enAudiobooks from "../locales/en/audiobooks.json";
import enDownloads from "../locales/en/downloads.json";
import enShelves from "../locales/en/shelves.json";
import enMetadata from "../locales/en/metadata.json";
import enIngest from "../locales/en/ingest.json";
import enActivity from "../locales/en/activity.json";
import enClubs from "../locales/en/clubs.json";
import enSearch from "../locales/en/search.json";
import enAdmin from "../locales/en/admin.json";
import enPlayback from "../locales/en/playback.json";
import enHome from "../locales/en/home.json";
import enPodcasts from "../locales/en/podcasts.json";
import enMusic from "../locales/en/music.json";
import enMovies from "../locales/en/movies.json";
import enTv from "../locales/en/tv.json";
import enProfile from "../locales/en/profile.json";
import enNotifications from "../locales/en/notifications.json";
import enPeople from "../locales/en/people.json";
import enCalendar from "../locales/en/calendar.json";
import enGoals from "../locales/en/goals.json";
import enAchievements from "../locales/en/achievements.json";
import enChallenges from "../locales/en/challenges.json";
import enStats from "../locales/en/stats.json";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: ["en", "en-GB", "fr", "de"],
    ns: [
      "common",
      "nav",
      "auth",
      "settings",
      "admin",
      "empty",
      "books",
      "audiobooks",
      "podcasts",
      "music",
      "movies",
      "tv",
      "downloads",
      "shelves",
      "clubs",
      "metadata",
      "ingest",
      "activity",
      "search",
      "playback",
      "home",
      "profile",
      "notifications",
      "people",
      "calendar",
      "goals",
      "achievements",
      "challenges",
      "stats",
    ],
    defaultNS: "common",
    resources: {
      en: {
        common: en,
        nav: enNav,
        auth: enAuth,
        settings: enSettings,
        admin: enAdmin,
        empty: enEmpty,
        books: enBooks,
        audiobooks: enAudiobooks,
        podcasts: enPodcasts,
        music: enMusic,
        movies: enMovies,
        tv: enTv,
        downloads: enDownloads,
        shelves: enShelves,
        clubs: enClubs,
        metadata: enMetadata,
        ingest: enIngest,
        activity: enActivity,
        search: enSearch,
        playback: enPlayback,
        home: enHome,
        profile: enProfile,
        notifications: enNotifications,
        people: enPeople,
        calendar: enCalendar,
        goals: enGoals,
        achievements: enAchievements,
        challenges: enChallenges,
        stats: enStats,
      },
      "en-GB": {
        common: en,
        nav: enNav,
        auth: enAuth,
        settings: enSettings,
        admin: enAdmin,
        empty: enEmpty,
        books: enBooks,
        audiobooks: enAudiobooks,
        podcasts: enPodcasts,
        music: enMusic,
        movies: enMovies,
        tv: enTv,
        downloads: enDownloads,
        shelves: enShelves,
        clubs: enClubs,
        metadata: enMetadata,
        ingest: enIngest,
        activity: enActivity,
        search: enSearch,
        playback: enPlayback,
        home: enHome,
        profile: enProfile,
        notifications: enNotifications,
        people: enPeople,
        calendar: enCalendar,
        goals: enGoals,
        achievements: enAchievements,
        challenges: enChallenges,
        stats: enStats,
      },
      fr: {},
      de: {},
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
