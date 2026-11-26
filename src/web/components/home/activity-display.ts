import type { ActivityEventPublic } from "@shared/activity";

export function activityEventLabel(
  event: ActivityEventPublic,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const title =
    typeof event.payload?.title === "string" ? event.payload.title : "";
  const key = `type_${event.type}`;
  const translated = t(key, { title, type: event.type, defaultValue: "" });
  if (translated) return translated;
  return t("type_default", { type: event.type });
}

export function activityEventLink(event: ActivityEventPublic): string | null {
  if (event.subjectType === "book") {
    const slug =
      typeof event.payload?.slug === "string" ? event.payload.slug : null;
    if (slug) return `/books/${slug}`;
    if (event.subjectId) return `/books/${event.subjectId}`;
  }
  if (event.subjectType === "audiobook") {
    const slug =
      typeof event.payload?.slug === "string" ? event.payload.slug : null;
    if (slug) return `/audiobooks/${slug}`;
    if (event.subjectId) return `/audiobooks/${event.subjectId}`;
  }
  return null;
}
