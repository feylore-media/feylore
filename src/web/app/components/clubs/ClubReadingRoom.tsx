import type { ReadingLocator } from "@shared/books";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { Button, TextField } from "../../../components/primitives";
import type { MediaLocation } from "@shared/media-location";
import styles from "./clubs.module.css";
type Index = {
  read: { id: string; title: string; status: string } | null;
  progressLabel: string | null;
  groups: {
    key: string;
    label: string;
    locked: boolean;
    topics: {
      id: string;
      title: string | null;
      author: string;
      unread: boolean;
      replyCount: number;
      pinned: boolean;
      closed: boolean;
    }[];
  }[];
  passages: {
    id: string;
    label: string;
    text: string | null;
    locked: boolean;
    authorUserId: string;
    authorDisplayName?: string;
    canUnshare: boolean;
  }[];
  nextCursor: string | null;
  nextPassageCursor?: string | null;
};
export function ClubReadingRoom({
  clubId,
  readId,
  isMember,
}: {
  clubId: string;
  readId?: string;
  isMember: boolean;
}) {
  const { t } = useTranslation("clubs");
  const [data, setData] = useState<Index | null>(null),
    [error, setError] = useState(false),
    [unread, setUnread] = useState(false),
    [creating, setCreating] = useState(false),
    [sharing, setSharing] = useState(false),
    [quote, setQuote] = useState<string | undefined>(),
    [busy, setBusy] = useState(false);
  const path = `/clubs/${clubId}/topics/index?unread=${unread}${readId ? "&clubReadId=" + readId : ""}`;
  const load = () =>
    api<{ data: Index }>(path)
      .then((r) => {
        setData(r.data);
        setError(false);
      })
      .catch(() => setError(true));
  useEffect(() => {
    let live = true;
    setData(null);
    void api<{ data: Index }>(path)
      .then((r) => {
        if (live) {
          setData(r.data);
          setError(false);
        }
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [path]);
  const more = async () => {
    if (!data?.nextCursor) return;
    setBusy(true);
    try {
      const r = await api<{ data: Index }>(path + "&cursor=" + data.nextCursor);
      setData((previous) =>
        previous
          ? {
              ...previous,
              nextCursor: r.data.nextCursor,
              groups: [...previous.groups, ...r.data.groups],
            }
          : r.data,
      );
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const morePassages = async () => {
    if (!data?.nextPassageCursor) return;
    setBusy(true);
    try {
      const r = await api<{ data: Index }>(
        path + "&quoteCursor=" + data.nextPassageCursor,
      );
      setData((previous) =>
        previous
          ? {
              ...previous,
              passages: [...previous.passages, ...r.data.passages],
              nextPassageCursor: r.data.nextPassageCursor,
            }
          : r.data,
      );
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  if (error && !data)
    return (
      <p role="alert">
        {t("readLoadError")}{" "}
        <Button onClick={() => void load()}>{t("readRetry")}</Button>
      </p>
    );
  if (!data) return <p role="status">{t("readLoading")}</p>;
  const grouped = new Map<
    string,
    {
      label: string;
      topics: Index["groups"][number]["topics"];
      passages: Index["passages"];
    }
  >();
  for (const group of data.groups) {
    const previous = grouped.get(group.label) ?? {
      label: group.label,
      topics: [],
      passages: [],
    };
    previous.topics.push(
      ...group.topics.filter(
        (topic) => !previous.topics.some((old) => old.id === topic.id),
      ),
    );
    grouped.set(group.label, previous);
  }
  if (!unread)
    for (const passage of data.passages) {
      const group = grouped.get(passage.label) ?? {
        label: passage.label,
        topics: [],
        passages: [],
      };
      group.passages.push(passage);
      grouped.set(passage.label, group);
    }
  const groups = [...grouped.values()].sort((a, b) =>
    a.label === "General"
      ? -1
      : b.label === "General"
        ? 1
        : a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
  return (
    <div className={styles.clubOverview}>
      <header>
        <h2>{t("tabDiscussions")}</h2>
        {data.read && (
          <p>
            <Link to={`/clubs/${clubId}/reads/${data.read.id}`}>
              {data.read.title}
            </Link>
          </p>
        )}
        {data.progressLabel && (
          <p>
            {data.progressLabel} - {t("roomYouAreHere")}
          </p>
        )}
      </header>
      <nav aria-label={t("roomFilters")} className={styles.clubTabNav}>
        {[false, true].map((value) => (
          <button
            key={String(value)}
            aria-pressed={unread === value}
            className={styles.clubTabButton}
            onClick={() => setUnread(value)}
          >
            {t(value ? "roomUnread" : "roomAll")}
          </button>
        ))}
      </nav>
      {isMember && (!data.read || data.read.status === "active") && (
        <Button
          style={{ alignSelf: "flex-start" }}
          onClick={() => {
            setQuote(undefined);
            setCreating(true);
          }}
        >
          {t("roomStart")}
        </Button>
      )}
      {isMember && data.read?.status === "active" && (
        <Button
          style={{ alignSelf: "flex-start" }}
          onClick={() => setSharing(true)}
        >
          {t("roomManualShare")}
        </Button>
      )}
      {sharing && (
        <RoomComposer
          clubId={clubId}
          readId={data.read?.id}
          sharePassage
          onCancel={() => setSharing(false)}
          onSaved={() => {
            setSharing(false);
            void load();
          }}
        />
      )}
      {creating && (
        <RoomComposer
          clubId={clubId}
          readId={data.read?.status === "active" ? data.read.id : undefined}
          sharedQuoteId={quote}
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
      {!groups.length && <p>{t("roomEmpty")}</p>}
      {groups.map((group) => (
        <section key={group.label}>
          <h3>{group.label}</h3>
          {group.topics.length > 0 && (
            <p>
              {t("roomCounts", {
                count: group.topics.length,
                unread: group.topics.filter((topic) => topic.unread).length,
              })}
            </p>
          )}
          {group.topics.map((topic) => (
            <div key={topic.id} className={styles.roomTopic}>
              <Link to={`/clubs/${clubId}/topics/${topic.id}`}>
                {topic.title ?? t("roomLocked")}
              </Link>
              <span>
                {topic.unread && t("roomUnread")}
                {" | "}
                {topic.author}
                {" | "}
                {t("roomReplies", { count: topic.replyCount })}
                {topic.pinned && " | " + t("pinned")}
                {topic.closed && " | " + t("closed")}
              </span>
            </div>
          ))}
          {group.passages.map((passage) => (
            <div key={passage.id} className={styles.roomTopic}>
              <p>
                {passage.authorDisplayName} - {t("roomSharedPassage")}
              </p>
              <blockquote>
                {passage.locked ? t("roomPassageLocked") : passage.text}
              </blockquote>
              {isMember &&
                !passage.locked &&
                data.read?.status === "active" && (
                  <Button
                    onClick={() => {
                      setQuote(passage.id);
                      setCreating(true);
                    }}
                  >
                    {t("roomStart")}
                  </Button>
                )}
              {passage.canUnshare && (
                <Button
                  onClick={() => {
                    void api(`/clubs/${clubId}/quotes/${passage.id}`, {
                      method: "DELETE",
                    })
                      .then(load)
                      .catch(() => setError(true));
                  }}
                >
                  {t("roomUnshare")}
                </Button>
              )}
            </div>
          ))}
        </section>
      ))}
      {data.nextCursor && (
        <Button disabled={busy} onClick={() => void more()}>
          {t("roomMore")}
        </Button>
      )}
      {!unread && data.nextPassageCursor && (
        <Button disabled={busy} onClick={() => void morePassages()}>
          {t("roomMorePassages")}
        </Button>
      )}
      {error && <p role="alert">{t("readLoadError")}</p>}
    </div>
  );
}
export function RoomComposer({
  clubId,
  readId,
  sharedQuoteId,
  sourceAnnotationId,
  sharePassage,
  readerLocator,
  location,
  onSaved,
  onCancel,
}: {
  clubId: string;
  readId?: string;
  sharedQuoteId?: string;
  sourceAnnotationId?: string;
  sharePassage?: boolean;
  readerLocator?: ReadingLocator;
  location?: MediaLocation;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("clubs");
  const [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [kind, setKind] = useState(sharePassage ? "beginning" : "general"),
    [position, setPosition] = useState("0"),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const boundary =
      location ??
      (kind === "progress"
        ? { kind: "chapter", progression: Number(position) / 100 }
        : kind === "page"
          ? { kind: "page", position: Number(position) }
          : kind === "beginning"
            ? { kind: "front_matter" }
            : { kind: "final" });
    try {
      await api(`/clubs/${clubId}/${sharePassage ? "quotes" : "topics"}`, {
        method: "POST",
        body: JSON.stringify({
          kind: "discussion",
          title,
          body,
          text: sharePassage ? body : undefined,
          clubReadId:
            kind === "general" &&
            !location &&
            !sharedQuoteId &&
            !sourceAnnotationId
              ? undefined
              : readId,
          mediaLocation:
            kind === "spoilerfree" ? { kind: "general" } : boundary,
          sharedQuoteId,
          sourceAnnotationId,
          readerLocator,
          ...(kind === "general" &&
          !location &&
          !sharedQuoteId &&
          !sourceAnnotationId
            ? { mediaLocation: undefined }
            : {}),
        }),
      });
      onSaved();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void save(e)} className={styles.clubOverview}>
      {!sharePassage && (
        <TextField
          id="room-title"
          label={t("roomTitle")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={300}
        />
      )}
      {readId && !sharedQuoteId && !sourceAnnotationId && !location && (
        <>
          <label>
            {t("roomLocation")}
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {!sharePassage && (
                <option value="general">{t("roomGeneral")}</option>
              )}
              <option value="spoilerfree">{t("roomSpoilerFree")}</option>
              <option value="beginning">{t("roomBeginning")}</option>
              <option value="progress">{t("roomPercentage")}</option>
              <option value="page">{t("roomPage")}</option>
              <option value="final">{t("roomFinal")}</option>
            </select>
          </label>
          {(kind === "progress" || kind === "page") && (
            <TextField
              id="room-position"
              type="number"
              label={t(kind === "page" ? "roomPage" : "roomPercentage")}
              min={kind === "page" ? 1 : 0}
              max={kind === "progress" ? 100 : undefined}
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              required
            />
          )}
        </>
      )}
      <label>
        {t(sharePassage ? "roomPassageText" : "roomBody")}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          maxLength={sharePassage ? 5000 : 10000}
        />
      </label>
      {error && <p role="alert">{t("roomSaveError")}</p>}
      <div>
        <Button type="submit" disabled={busy}>
          {t(sharePassage ? "roomShare" : "roomStart")}
        </Button>
        <Button type="button" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
