import type { HomeRecommendation } from "@shared/home";

interface HomeRecommendationsSlotProps {
  recommendations: HomeRecommendation[];
}

/** Renders nothing until RecommendationProvider supplies data. */
export function HomeRecommendationsSlot({
  recommendations,
}: HomeRecommendationsSlotProps) {
  if (recommendations.length === 0) return null;
  return null;
}
