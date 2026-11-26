import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ClubScheduleOccurrence, ClubScheduleView } from "@shared/clubs";

interface ClubScheduleListProps {
  clubId: string;
  view: ClubScheduleView;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function OccurrenceRow({
  clubId,
  occurrence,
  highlight,
}: {
  clubId: string;
  occurrence: ClubScheduleOccurrence;
  highlight?: boolean;
}) {
  const { t } = useTranslation("clubs");
  return (
    <li
      style={{
        marginBottom: "var(--space-3)",
        fontWeight: highlight ? 600 : 400,
      }}
    >
      <div>{occurrence.title}</div>
      <div className="muted" style={{ fontSize: "0.9rem" }}>
        {occurrence.consumptionLabel} · {t("due")} {formatWhen(occurrence.scheduledAt)}
      </div>
      {occurrence.topicId && (
        <Link to={`/clubs/${clubId}/topics/${occurrence.topicId}`}>
          {t("viewDiscussion")}
        </Link>
      )}
    </li>
  );
}

export function ClubScheduleList({ clubId, view }: ClubScheduleListProps) {
  const { t } = useTranslation("clubs");

  if (!view.current && view.upcoming.length === 0 && view.past.length === 0) {
    return <p className="muted">{t("noSchedule")}</p>;
  }

  return (
    <div>
      {view.current && (
        <section style={{ marginBottom: "var(--space-4)" }}>
          <h3 style={{ fontSize: "0.95rem" }}>{t("scheduleCurrent")}</h3>
          <ul style={{ paddingLeft: "1.25rem", listStyle: "none" }}>
            <OccurrenceRow
              clubId={clubId}
              occurrence={view.current}
              highlight
            />
          </ul>
        </section>
      )}

      {view.upcoming.length > 0 && (
        <section style={{ marginBottom: "var(--space-4)" }}>
          <h3 style={{ fontSize: "0.95rem" }}>{t("scheduleUpcoming")}</h3>
          <ul style={{ paddingLeft: "1.25rem", listStyle: "none" }}>
            {view.upcoming.map((occurrence) => (
              <OccurrenceRow
                key={occurrence.id}
                clubId={clubId}
                occurrence={occurrence}
              />
            ))}
          </ul>
        </section>
      )}

      {view.past.length > 0 && (
        <section>
          <h3 style={{ fontSize: "0.95rem" }}>{t("schedulePast")}</h3>
          <ul style={{ paddingLeft: "1.25rem", listStyle: "none" }}>
            {view.past.map((occurrence) => (
              <OccurrenceRow
                key={occurrence.id}
                clubId={clubId}
                occurrence={occurrence}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
