import { useParams } from "react-router";
import { PodcastShowPage as ShowPage } from "./PodcastShowPage";

export function PodcastShowRoutePage() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return null;
  return <ShowPage slug={slug} />;
}
