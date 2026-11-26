import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ClubContext, ClubWork } from "@shared/clubs";
import { api } from "../../api";
import { Button, TextField } from "../../../components/primitives";

interface ClubScheduleFormProps {
  clubId: string;
  context: ClubContext;
  works: ClubWork[];
  onCreated: () => void;
}

export function ClubScheduleForm({
  clubId,
  context,
  works,
  onCreated,
}: ClubScheduleFormProps) {
  const { t } = useTranslation("clubs");
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<"once" | "weekly">("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(5);
  const [startsAt, setStartsAt] = useState("");
  const [consumptionKind, setConsumptionKind] = useState<
    "chapter" | "episode" | "custom"
  >(context === "video" ? "episode" : "chapter");
  const [consumptionStart, setConsumptionStart] = useState(1);
  const [customLabel, setCustomLabel] = useState("");
  const [clubWorkId, setClubWorkId] = useState("");
  const [clubReadId, setClubReadId] = useState<string | null>(null);
  const [eventKind, setEventKind] = useState<"checkin" | "final_discussion">(
    "checkin",
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void api<{ data: { id: string } | null }>(`/clubs/${clubId}/reads/current`)
      .then((response) => {
        if (active) setClubReadId(response.data?.id ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [clubId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startsAt) return;

    const consumption =
      consumptionKind === "custom"
        ? { kind: "custom" as const, label: customLabel.trim() || title.trim() }
        : consumptionKind === "episode"
          ? {
              kind: "episode" as const,
              start: consumptionStart,
              count: 1,
              increment: 1,
            }
          : {
              kind: "chapter" as const,
              start: consumptionStart,
              count: 1,
              increment: 1,
            };

    setSubmitting(true);
    try {
      await api(`/clubs/${clubId}/schedules`, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          eventKind,
          frequency,
          dayOfWeek: frequency === "weekly" ? dayOfWeek : undefined,
          startsAt: new Date(startsAt).toISOString(),
          consumption,
          clubWorkId:
            eventKind === "final_discussion" ? null : clubWorkId || null,
          clubReadId: clubReadId || null,
          topicTiming: "at_scheduled_time",
        }),
      });
      setTitle("");
      setStartsAt("");
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      style={{ marginBottom: "var(--space-4)" }}
    >
      <h3 style={{ fontSize: "0.95rem", marginBottom: "var(--space-2)" }}>
        {t("createSchedule")}
      </h3>
      <div
        style={{ display: "grid", gap: "var(--space-2)", maxWidth: "28rem" }}
      >
        <TextField
          label={t("scheduleTitle")}
          id="schedule-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("scheduleTitle")}
          required
        />
        <label>
          {t("scheduleFrequency")}
          <select
            value={frequency}
            disabled={eventKind === "final_discussion"}
            onChange={(e) => setFrequency(e.target.value as "once" | "weekly")}
          >
            <option value="weekly">{t("frequencyWeekly")}</option>
            <option value="once">{t("frequencyOnce")}</option>
          </select>
        </label>
        {clubReadId && (
          <label>
            {t("scheduleEventKind")}
            <select
              value={eventKind}
              onChange={(e) => {
                const next = e.target.value as "checkin" | "final_discussion";
                setEventKind(next);
                if (next === "final_discussion") {
                  setFrequency("once");
                  setConsumptionKind("custom");
                }
              }}
            >
              <option value="checkin">{t("scheduleCheckIn")}</option>
              <option value="final_discussion">
                {t("scheduleFinalDiscussion")}
              </option>
            </select>
          </label>
        )}
        {frequency === "weekly" && (
          <label>
            {t("dayOfWeek")}
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
            >
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <option key={d} value={d}>
                  {t(`weekday${d}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {t("startsAt")}
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </label>
        {works.length > 0 && (
          <label>
            {t("linkedWork")}
            <select
              value={clubWorkId}
              onChange={(e) => setClubWorkId(e.target.value)}
            >
              <option value="">{t("noLinkedWork")}</option>
              {works.map((work) => (
                <option key={work.id} value={work.id}>
                  {work.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {t("consumptionTarget")}
          <select
            value={consumptionKind}
            onChange={(e) =>
              setConsumptionKind(
                e.target.value as "chapter" | "episode" | "custom",
              )
            }
          >
            {context !== "video" && (
              <option value="chapter">{t("consumptionChapter")}</option>
            )}
            {context !== "book" && (
              <option value="episode">{t("consumptionEpisode")}</option>
            )}
            <option value="custom">{t("consumptionCustom")}</option>
          </select>
        </label>
        {consumptionKind === "custom" ? (
          <TextField
            label={t("consumptionCustomLabel")}
            id="consumption-custom-label"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder={t("consumptionCustomLabel")}
          />
        ) : (
          <label>
            {t("consumptionStart")}
            <input
              type="number"
              min={1}
              value={consumptionStart}
              onChange={(e) => setConsumptionStart(Number(e.target.value))}
            />
          </label>
        )}
        <Button type="submit" variant="primary" disabled={submitting}>
          {t("createSchedule")}
        </Button>
      </div>
    </form>
  );
}
