import type {
  PodcastContinueListeningItem,
  PodcastShowListItem,
} from "@shared/podcasts";
import { api } from "../../app/api";

export async function fetchSubscribedPodcasts() {
  const res = await api<{ data: PodcastShowListItem[] }>("/podcasts");
  return res.data;
}

export async function fetchContinueListening() {
  const res = await api<{ data: PodcastContinueListeningItem[] }>(
    "/podcasts/continue-listening",
  );
  return res.data;
}

export async function fetchDiscoverPodcasts(q?: string) {
  const params = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await api<{ data: PodcastShowListItem[] }>(
    `/podcasts/discover${params}`,
  );
  return res.data;
}

export async function subscribeToFeed(feedUrl: string) {
  const res = await api<{ data: PodcastShowListItem }>("/podcasts/subscribe", {
    method: "POST",
    body: JSON.stringify({ feedUrl }),
  });
  return res.data;
}

export async function unsubscribeFromShow(slug: string) {
  await api(`/podcasts/${slug}/subscribe`, { method: "DELETE" });
}
