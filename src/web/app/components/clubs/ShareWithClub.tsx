import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import { RoomComposer } from "./ClubReadingRoom";
import type { ReadingLocator } from "@shared/books";
export function ShareWithClub({
  workId,
  workSlug,
  sourceAnnotationId,
  locator,
  text,
}: {
  workId?: string;
  workSlug?: string;
  sourceAnnotationId?: string;
  locator: ReadingLocator;
  text?: string;
}) {
  const { t } = useTranslation("clubs");
  const [clubs, setClubs] = useState<
      { id: string; name: string; readId: string }[] | null
    >(null),
    [chosen, setChosen] = useState(""),
    [error, setError] = useState(false),
    [shared, setShared] = useState(false),
    [discussion, setDiscussion] = useState(false),
    [busy, setBusy] = useState(false);
  const choose = async () => {
    setBusy(true);
    try {
      const r = await api<{
        data: { id: string; name: string; isMember: boolean }[];
      }>("/clubs");
      const book = workId
        ? { id: workId }
        : workSlug
          ? (await api<{ data: { id: string } }>(`/books/${workSlug}`)).data
          : null;
      const items = await Promise.all(
        r.data
          .filter((c) => c.isMember)
          .map(async (c) => {
            const r = await api<{
              data: { id: string; workSubjectId: string | null } | null;
            }>(`/clubs/${c.id}/reads/current`);
            if (!r.data?.workSubjectId) return null;
            return r.data.workSubjectId === book?.id
              ? { id: c.id, name: c.name, readId: r.data.id }
              : null;
          }),
      );
      setClubs(
        items.filter(
          (c): c is { id: string; name: string; readId: string } => !!c,
        ),
      );
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const club = clubs?.find((c) => c.id === chosen);
  const location =
    locator.totalProgression !== undefined
      ? { kind: "chapter" as const, progression: locator.totalProgression }
      : { kind: "final" as const };
  const share = async () => {
    if (!club) return;
    setBusy(true);
    try {
      await api(`/clubs/${club.id}/quotes`, {
        method: "POST",
        body: JSON.stringify({
          clubReadId: club.readId,
          sourceAnnotationId,
          readerLocator: sourceAnnotationId ? undefined : locator,
          text: sourceAnnotationId ? undefined : text,
          mediaLocation: location,
        }),
      });
      setShared(true);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div onClick={(event) => event.stopPropagation()}>
      {clubs === null ? (
        <Button disabled={busy} onClick={() => void choose()}>
          {t("roomShare")}
        </Button>
      ) : (
        <>
          <label>
            {t("roomChooseClub")}
            <select
              value={chosen}
              onChange={(e) => {
                setChosen(e.target.value);
                setShared(false);
              }}
            >
              <option value="">{t("roomChooseClub")}</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {!clubs.length && <p>{t("roomNoMatchingClub")}</p>}
          {club && (
            <>
              <Button disabled={busy || shared} onClick={() => void share()}>
                {t(shared ? "roomShared" : "roomShare")}
              </Button>
              <Button onClick={() => setDiscussion(true)}>
                {t("roomStart")}
              </Button>
              {discussion && (
                <RoomComposer
                  clubId={club.id}
                  readId={club.readId}
                  sourceAnnotationId={sourceAnnotationId}
                  location={location}
                  readerLocator={sourceAnnotationId ? undefined : locator}
                  onCancel={() => setDiscussion(false)}
                  onSaved={() => setDiscussion(false)}
                />
              )}
            </>
          )}
        </>
      )}
      {error && <p role="alert">{t("readLoadError")}</p>}
    </div>
  );
}
