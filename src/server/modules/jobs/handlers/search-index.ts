import type { JobService } from "../service.js";
import type { BooksService } from "../../books/service.js";
import type { AudiobooksService } from "../../audiobooks/service.js";
import type { PodcastsService } from "../../podcasts/service.js";
import type { MusicService } from "../../music/service.js";
import type { MoviesService } from "../../movies/service.js";
import type { TvService } from "../../tv/service.js";

export interface SearchIndexPayload {
  entityType?: string;
  feyloreJobId: string;
}

export async function runSearchIndex(
  jobService: JobService,
  books: BooksService,
  audiobooks: AudiobooksService,
  podcasts: PodcastsService,
  music: MusicService,
  movies: MoviesService,
  tv: TvService,
  payload: SearchIndexPayload,
) {
  const { entityType, feyloreJobId } = payload;
  const signal = jobService.registerCancellation(feyloreJobId);

  try {
    await jobService.updateStatus(feyloreJobId, "running");

    if (entityType === "audiobook") {
      const audiobookIds = await audiobooks.listAllAudiobookIds();
      let indexed = 0;
      for (const audiobookId of audiobookIds) {
        if (jobService.isCancelled(signal)) {
          await jobService.updateStatus(feyloreJobId, "cancelled");
          return;
        }
        await audiobooks.indexAudiobook(audiobookId);
        indexed++;
      }
      await jobService.updateStatus(feyloreJobId, "completed", {
        logExcerpt: `Indexed ${indexed} audiobooks`,
      });
      return;
    }

    if (entityType === "podcast") {
      const showIds = await podcasts.listAllShowIds();
      let indexed = 0;
      for (const showId of showIds) {
        if (jobService.isCancelled(signal)) {
          await jobService.updateStatus(feyloreJobId, "cancelled");
          return;
        }
        await podcasts.indexShow(showId);
        indexed++;
      }
      await jobService.updateStatus(feyloreJobId, "completed", {
        logExcerpt: `Indexed ${indexed} podcast shows`,
      });
      return;
    }

    if (entityType === "album") {
      const albumIds = await music.listAllAlbumIds();
      let indexed = 0;
      for (const albumId of albumIds) {
        if (jobService.isCancelled(signal)) {
          await jobService.updateStatus(feyloreJobId, "cancelled");
          return;
        }
        await music.indexAlbum(albumId);
        indexed++;
      }
      await jobService.updateStatus(feyloreJobId, "completed", {
        logExcerpt: `Indexed ${indexed} albums`,
      });
      return;
    }

    if (entityType === "track") {
      const trackIds = await music.listAllTrackIds();
      let indexed = 0;
      for (const trackId of trackIds) {
        if (jobService.isCancelled(signal)) {
          await jobService.updateStatus(feyloreJobId, "cancelled");
          return;
        }
        await music.indexTrack(trackId);
        indexed++;
      }
      await jobService.updateStatus(feyloreJobId, "completed", {
        logExcerpt: `Indexed ${indexed} tracks`,
      });
      return;
    }

    if (entityType === "artist") {
      const artistIds = await music.listAllArtistIds();
      let indexed = 0;
      for (const artistId of artistIds) {
        if (jobService.isCancelled(signal)) {
          await jobService.updateStatus(feyloreJobId, "cancelled");
          return;
        }
        await music.indexArtist(artistId);
        indexed++;
      }
      await jobService.updateStatus(feyloreJobId, "completed", {
        logExcerpt: `Indexed ${indexed} artists`,
      });
      return;
    }

    if (entityType === "movie") {
      const movieIds = await movies.listAllMovieIds();
      let indexed = 0;
      for (const movieId of movieIds) {
        if (jobService.isCancelled(signal)) {
          await jobService.updateStatus(feyloreJobId, "cancelled");
          return;
        }
        await movies.indexMovie(movieId);
        indexed++;
      }
      await jobService.updateStatus(feyloreJobId, "completed", {
        logExcerpt: `Indexed ${indexed} movies`,
      });
      return;
    }

    if (entityType === "show") {
      const showIds = await tv.listAllShowIds();
      let indexed = 0;
      for (const showId of showIds) {
        if (jobService.isCancelled(signal)) {
          await jobService.updateStatus(feyloreJobId, "cancelled");
          return;
        }
        await tv.indexShow(showId);
        indexed++;
      }
      await jobService.updateStatus(feyloreJobId, "completed", {
        logExcerpt: `Indexed ${indexed} TV shows`,
      });
      return;
    }

    if (entityType === "tv_episode") {
      const episodeIds = await tv.listAllEpisodeIds();
      let indexed = 0;
      for (const episodeId of episodeIds) {
        if (jobService.isCancelled(signal)) {
          await jobService.updateStatus(feyloreJobId, "cancelled");
          return;
        }
        await tv.indexEpisode(episodeId);
        indexed++;
      }
      await jobService.updateStatus(feyloreJobId, "completed", {
        logExcerpt: `Indexed ${indexed} TV episodes`,
      });
      return;
    }

    const knownTypes = new Set([
      "book",
      "audiobook",
      "podcast",
      "album",
      "track",
      "artist",
      "movie",
      "show",
      "tv_episode",
    ]);
    if (entityType && !knownTypes.has(entityType)) {
      await jobService.updateStatus(feyloreJobId, "completed", {
        logExcerpt: `No indexer for entity type: ${entityType}`,
      });
      return;
    }

    const bookIds = await books.listAllBookIds();
    let indexed = 0;

    for (const bookId of bookIds) {
      if (jobService.isCancelled(signal)) {
        await jobService.updateStatus(feyloreJobId, "cancelled");
        return;
      }
      await books.indexBook(bookId);
      indexed++;
    }

    const audiobookIds = await audiobooks.listAllAudiobookIds();
    for (const audiobookId of audiobookIds) {
      if (jobService.isCancelled(signal)) {
        await jobService.updateStatus(feyloreJobId, "cancelled");
        return;
      }
      await audiobooks.indexAudiobook(audiobookId);
      indexed++;
    }

    const albumIds = await music.listAllAlbumIds();
    for (const albumId of albumIds) {
      if (jobService.isCancelled(signal)) {
        await jobService.updateStatus(feyloreJobId, "cancelled");
        return;
      }
      await music.indexAlbum(albumId);
      indexed++;
    }

    const trackIds = await music.listAllTrackIds();
    for (const trackId of trackIds) {
      if (jobService.isCancelled(signal)) {
        await jobService.updateStatus(feyloreJobId, "cancelled");
        return;
      }
      await music.indexTrack(trackId);
      indexed++;
    }

    const artistIds = await music.listAllArtistIds();
    for (const artistId of artistIds) {
      if (jobService.isCancelled(signal)) {
        await jobService.updateStatus(feyloreJobId, "cancelled");
        return;
      }
      await music.indexArtist(artistId);
      indexed++;
    }

    const movieIds = await movies.listAllMovieIds();
    for (const movieId of movieIds) {
      if (jobService.isCancelled(signal)) {
        await jobService.updateStatus(feyloreJobId, "cancelled");
        return;
      }
      await movies.indexMovie(movieId);
      indexed++;
    }

    const showIds = await tv.listAllShowIds();
    for (const showId of showIds) {
      if (jobService.isCancelled(signal)) {
        await jobService.updateStatus(feyloreJobId, "cancelled");
        return;
      }
      await tv.indexShow(showId);
      indexed++;
    }

    const episodeIds = await tv.listAllEpisodeIds();
    for (const episodeId of episodeIds) {
      if (jobService.isCancelled(signal)) {
        await jobService.updateStatus(feyloreJobId, "cancelled");
        return;
      }
      await tv.indexEpisode(episodeId);
      indexed++;
    }

    await jobService.updateStatus(feyloreJobId, "completed", {
      logExcerpt: `Indexed ${indexed} works`,
    });
  } catch (err) {
    if (jobService.isCancelled(signal)) {
      await jobService.updateStatus(feyloreJobId, "cancelled");
    } else {
      await jobService.updateStatus(feyloreJobId, "failed", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  } finally {
    jobService.clearCancellation(feyloreJobId);
  }
}
