export const bookPath = (slug: string) => `/books/${slug}`;
export const bookMetadataPath = (slug: string) => `/books/${slug}/metadata`;
export const bookJournalPath = (slug: string) => `/books/${slug}/journal`;
export const bookDnaPath = (slug: string) => `/books/${slug}/dna`;
export const bookHistoryPath = (slug: string) => `/books/${slug}/history`;
export const bookEditPath = (slug: string) => `/books/${slug}/edit`;
export const bookReviewPath = (slug: string) => `/books/${slug}/review`;
export const bookReaderPath = (slug: string) => `/read/book/${slug}`;
export const bookAuthorsPeoplePath = () => `/books/authors/people`;

export const audiobookPath = (slug: string) => `/audiobooks/${slug}`;
export const audiobookEditPath = (slug: string) => `/audiobooks/${slug}/edit`;
export const audiobookNarratorsPeoplePath = () =>
  `/audiobooks/narrators/people`;

export const albumPath = (slug: string) => `/music/albums/${slug}`;
export const artistPath = (slug: string) => `/music/artists/${slug}`;
export const playlistPath = (slug: string) => `/music/playlists/${slug}`;
export const musicArtistsPeoplePath = () => `/music/artists/people`;

export const moviePath = (slug: string) => `/movies/${slug}`;
export const movieCollectionPath = (slug: string) =>
  `/movies/collections/${slug}`;
export const moviePersonPath = (slug: string) => `/movies/people/${slug}`;
export const moviePeopleListPath = () => `/movies/people/list`;

export const tvShowPath = (slug: string) => `/tv/shows/${slug}`;
export const tvSeasonPath = (slug: string, season: number | string) =>
  `/tv/shows/${slug}/s/${season}`;
export const tvEpisodePath = (
  slug: string,
  season: number | string,
  episode: number | string,
) => `/tv/shows/${slug}/s/${season}/e/${episode}`;
export const tvLiveChannelPath = (channelId: string) => `/tv/live/${channelId}`;

export const peopleEntityPath = (slug: string) => `/people/${slug}`;
export const peopleEditPath = (slug: string) => `/people/${slug}/edit`;

export { userProfilePath, legacyUserProfilePath } from "@shared/user-identity";
