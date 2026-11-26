import type { IngestDomainProcessor, DetectionResult } from "./domain-processor.js";

export interface DetectionHints {
  libraryContentType?: string | null;
  contentTypeHint?: string | null;
}

const CONFIDENCE_RANK: Record<DetectionResult["confidence"], number> = {
  high: 3,
  low: 2,
  none: 0,
};

function contentTypeMatchesHint(
  result: DetectionResult,
  hint: string,
): boolean {
  return result.contentType === hint || result.domain === hint;
}

export class IngestDomainRouter {
  constructor(private readonly processors: IngestDomainProcessor[]) {}

  detect(
    filename: string,
    mediaType?: string | null,
    hints?: DetectionHints,
  ): DetectionResult {
    const hintType =
      hints?.libraryContentType ?? hints?.contentTypeHint ?? null;

    const results: DetectionResult[] = [];
    for (const processor of this.processors) {
      const result = processor.detect(filename, mediaType, hints);
      if (processor.canHandle(result)) {
        results.push(result);
      }
    }

    if (results.length === 0) {
      return {
        domain: null,
        contentType: null,
        format: null,
        confidence: "none",
      };
    }

    if (hintType) {
      const typedMatches = results.filter((result) =>
        contentTypeMatchesHint(result, hintType),
      );
      if (typedMatches.length > 0) {
        return typedMatches.sort(
          (a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence],
        )[0]!;
      }
    }

    return results.sort(
      (a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence],
    )[0]!;
  }

  resolveProcessor(detection: DetectionResult): IngestDomainProcessor | null {
    for (const processor of this.processors) {
      if (processor.canHandle(detection)) {
        return processor;
      }
    }
    return null;
  }
}
