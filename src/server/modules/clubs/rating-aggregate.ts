export interface ParticipantReview {
  userId: string;
  finalRating: number | null;
  recommendation: "yes" | "no" | null;
  coreValues: Record<string, number> | null;
  genreValues?: Record<string, Record<string, number>> | null;
  trajectory: { progress: number; rating: number }[] | null;
}

export interface ParticipantStar {
  userId: string;
  rating: number;
}

/** Reviews and fallback stars must already be restricted to read participants. */
export function aggregateParticipantRatings(
  reviews: ParticipantReview[],
  stars: ParticipantStar[],
) {
  const reviewed = new Set(
    reviews.filter((row) => row.finalRating !== null).map((row) => row.userId),
  );
  const values = reviews
    .map((row) => row.finalRating)
    .filter((value): value is number => value !== null)
    .concat(
      stars.filter((row) => !reviewed.has(row.userId)).map((row) => row.rating),
    );
  const sums = new Map<string, number[]>();
  for (const row of reviews)
    for (const [key, value] of Object.entries(row.coreValues ?? {})) {
      const samples = sums.get(key) ?? [];
      samples.push(value);
      sums.set(key, samples);
    }
  const coreValues = Object.fromEntries(
    [...sums]
      .filter(([, samples]) => samples.length >= 2)
      .map(([key, samples]) => [
        key,
        samples.reduce((a, b) => a + b, 0) / samples.length,
      ]),
  );
  const genreSums = new Map<string, Map<string, number[]>>();
  for (const row of reviews)
    for (const [termId, dimensions] of Object.entries(row.genreValues ?? {})) {
      const term = genreSums.get(termId) ?? new Map<string, number[]>();
      for (const [key, value] of Object.entries(dimensions)) {
        const samples = term.get(key) ?? [];
        samples.push(value);
        term.set(key, samples);
      }
      genreSums.set(termId, term);
    }
  const genreValues = Object.fromEntries(
    [...genreSums]
      .map(([termId, dimensions]) => [
        termId,
        Object.fromEntries(
          [...dimensions]
            .filter(([, samples]) => samples.length >= 2)
            .map(([key, samples]) => [
              key,
              samples.reduce((a, b) => a + b, 0) / samples.length,
            ]),
        ),
      ])
      .filter(([, values]) => Object.keys(values).length > 0),
  );
  const positions = [
    ...new Set(
      reviews.flatMap((row) =>
        (row.trajectory ?? []).map((point) => point.progress),
      ),
    ),
  ].sort((a, b) => a - b);
  const trajectory = positions.flatMap((position) => {
    const samples = reviews.flatMap((row) => {
      const points = [...(row.trajectory ?? [])].sort(
        (a, b) => a.progress - b.progress,
      );
      const lower = points.filter((point) => point.progress <= position).at(-1);
      const upper = points.find((point) => point.progress >= position);
      if (!lower || !upper) return [];
      return lower.progress === upper.progress
        ? [lower.rating]
        : [
            lower.rating +
              ((upper.rating - lower.rating) * (position - lower.progress)) /
                (upper.progress - lower.progress),
          ];
    });
    return samples.length >= 2
      ? [
          {
            progress: position,
            rating: samples.reduce((a, b) => a + b, 0) / samples.length,
          },
        ]
      : [];
  });
  return {
    values,
    averageRating: values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null,
    ratingCount: values.length,
    recommendations: reviews.some((row) => row.recommendation !== null)
      ? reviews.filter((row) => row.recommendation === "yes").length
      : null,
    recommendationCount: reviews.filter((row) => row.recommendation !== null)
      .length,
    coreValues,
    genreValues,
    trajectory,
  };
}
