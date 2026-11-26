import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type {
  BingoBoardView,
  ChallengeHub,
  ChallengeInvite,
  ChallengeRecord,
  ChallengeSocialSummary,
  QuestGraphView,
} from "@shared/challenges";
import type { GoalProgress } from "@shared/goal-evaluation";
import type { ClubListItem } from "@shared/clubs";
import { api } from "../api";
import { Button } from "../../components/primitives";
import { ErrorState, LoadingState } from "../../components/states";
import { BingoBoardGrid } from "./BingoBoard";
import { BingoBoardEditor } from "./BingoBoardEditor";
import { QuestMap } from "./QuestMap";
import { QuestMapEditor } from "./QuestMapEditor";
import {
  bingoDraftToBoardInput,
  bingoModeForDomains,
  flattenBingoConditions,
  freshSquare,
  type BingoDraft,
} from "./bingo-utils";
import {
  defaultQuestDraft,
  flattenQuestConditions,
  questDraftToGraphInput,
  questModeForDomains,
  type QuestDraft,
} from "./quest-utils";
import { ChallengeCard, ChallengeMiniVisual } from "./ChallengeCards";
import {
  challengeSummary,
  displayDate,
  objectiveSummary,
} from "./challenge-helpers";
import styles from "./goals.module.css";

type ChallengeDetail = ChallengeRecord & {
  viewerProgress: GoalProgress | null;
  viewerParticipation: ChallengeRecord["viewerParticipation"];
  bingo?: BingoBoardView | null;
  quest?: QuestGraphView | null;
  canManage: boolean;
  canJoin: boolean;
  canLeave: boolean;
};

type Participant = {
  userId: string;
  username?: string | null;
  displayName?: string | null;
  state: "joined" | "left" | "completed";
  joinedAt: string;
  completedAt: string | null;
  summary?: ChallengeSocialSummary | null;
};

type Mode = "read" | "listen" | "watch" | "tv" | "podcast" | "music" | "any";

const MODE_DOMAINS: Record<Mode, string[]> = {
  read: ["books"],
  listen: ["audiobooks"],
  watch: ["movies"],
  tv: ["tv"],
  podcast: ["podcasts"],
  music: ["music"],
  any: ["books", "audiobooks", "movies", "tv", "podcasts", "music"],
};

const MODE_METRIC: Record<Mode, string> = {
  read: "works",
  listen: "works",
  watch: "movies",
  tv: "episodes",
  podcast: "episodes",
  music: "albums",
  any: "works",
};

export function GoalsChallengesTabs({
  active,
}: {
  active: "goals" | "challenges";
}) {
  const { t } = useTranslation("challenges");
  return (
    <nav className={styles.section} aria-label="Goals and challenges">
      <Link to="/goals" aria-current={active === "goals" ? "page" : undefined}>
        <Button variant={active === "goals" ? "primary" : undefined}>
          {t("goalsTab")}
        </Button>
      </Link>{" "}
      <Link
        to="/challenges"
        aria-current={active === "challenges" ? "page" : undefined}
      >
        <Button variant={active === "challenges" ? "primary" : undefined}>
          {t("challengesTab")}
        </Button>
      </Link>
    </nav>
  );
}

type HubResponse = {
  hub: ChallengeHub;
  invites: ChallengeInvite[];
};

export function ChallengesPage() {
  const { t } = useTranslation("challenges");
  const [hub, setHub] = useState<ChallengeHub | null>(null);
  const [invites, setInvites] = useState<ChallengeInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState<string | null>(null);

  async function load() {
    try {
      const response = await api<{ data: HubResponse }>("/challenges/hub");
      setHub(response.data.hub);
      setInvites(response.data.invites);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function respond(inviteId: string, accept: boolean) {
    setBusyInvite(inviteId);
    try {
      await api(`/challenges/invites/${inviteId}/${accept ? "accept" : "decline"}`, {
        method: "POST",
      });
      await load();
    } finally {
      setBusyInvite(null);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const empty =
    !hub ||
    (hub.yours.length === 0 &&
      hub.invited.length === 0 &&
      hub.discoverable.length === 0 &&
      hub.completed.length === 0);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t("title")}</p>
          <h1>{t("title")}</h1>
        </div>
        <Link to="/challenges/new">
          <Button variant="primary">{t("newChallenge")}</Button>
        </Link>
      </header>

      <GoalsChallengesTabs active="challenges" />

      {empty && (
        <section className={styles.section}>
          <h2>{t("emptyTitle")}</h2>
          <p className={styles.lead}>{t("emptyDetail")}</p>
        </section>
      )}

      {hub && hub.yours.length > 0 && (
        <ChallengeSection title={t("hubYours")} challenges={hub.yours} />
      )}
      {hub && hub.invited.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("hubInvited")}</h2>
          <div className={styles.grid}>
            {hub.invited.map((challenge) => {
              const invite = invites.find(
                (entry) => entry.challengeId === challenge.id,
              );
              return (
                <div className={styles.card} key={challenge.id}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>{challenge.title}</h3>
                    <span className={styles.percent}>
                      {challenge.effectiveState}
                    </span>
                  </div>
                  <p className={styles.cardMeta}>
                    {challengeSummary(challenge, t)}
                  </p>
                  {invite && (
                    <p className={styles.cardMeta}>
                      {t("invitedBy", {
                        name:
                          invite.inviterDisplayName ??
                          invite.inviterUsername ??
                          "",
                      })}
                    </p>
                  )}
                  <div className={styles.inviteActions}>
                    <Link to={`/challenges/${challenge.id}`}>
                      <Button>{t("viewChallenge")}</Button>
                    </Link>
                    {invite && (
                      <>
                        <Button
                          variant="primary"
                          disabled={busyInvite === invite.id}
                          onClick={() => void respond(invite.id, true)}
                        >
                          {t("acceptInvite")}
                        </Button>
                        <Button
                          disabled={busyInvite === invite.id}
                          onClick={() => void respond(invite.id, false)}
                        >
                          {t("declineInvite")}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {hub && hub.discoverable.length > 0 && (
        <ChallengeSection
          title={t("hubDiscover")}
          challenges={hub.discoverable}
        />
      )}
      {hub && hub.completed.length > 0 && (
        <ChallengeSection
          title={t("hubCompleted")}
          challenges={hub.completed}
        />
      )}
    </div>
  );
}

export function ChallengeSection({
  title,
  challenges,
}: {
  title: string;
  challenges: ChallengeRecord[];
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.grid}>
        {challenges.map((challenge) => (
          <ChallengeCard challenge={challenge} key={challenge.id} />
        ))}
      </div>
    </section>
  );
}

function toDateInput(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function ChallengeBuilderPage() {
  const { t } = useTranslation("challenges");
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const editing = Boolean(id);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [mode, setMode] = useState<Mode>("read");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState(5);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [joinPolicy, setJoinPolicy] = useState("open");
  const [clubId, setClubId] = useState("");
  const [clubs, setClubs] = useState<ClubListItem[]>([]);
  const [achievementName, setAchievementName] = useState("");
  const [format, setFormat] = useState<"simple" | "bingo" | "quest">("simple");
  const [bingo, setBingo] = useState<BingoDraft>(() => ({
    size: 3,
    victory: "line",
    victoryLines: 2,
    styleKey: "default",
    squares: Array.from({ length: 9 }, () => freshSquare()),
  }));
  const [quest, setQuest] = useState<QuestDraft>(() => defaultQuestDraft());

  function handleBingoChange(next: BingoDraft) {
    if (next.size !== bingo.size) {
      const total = next.size * next.size;
      const squares = [...next.squares];
      while (squares.length < total) squares.push(freshSquare());
      setBingo({ ...next, squares: squares.slice(0, total) });
    } else {
      setBingo(next);
    }
  }

  useEffect(() => {
    void api<{ data: ClubListItem[] }>("/clubs")
      .then((response) => {
        const mine = response.data.filter((club) => club.isMember);
        setClubs(mine);
        // Club tab deep-link: /challenges/new?clubId=… preselects the club.
        if (!id) {
          const preselect = searchParams.get("clubId");
          if (preselect && mine.some((club) => club.id === preselect)) {
            setClubId(preselect);
            setJoinPolicy("club_members");
          }
        }
      })
      .catch(() => setClubs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!id) return;
    void api<{ data: ChallengeDetail }>(`/challenges/${id}`)
      .then((response) => {
        const detail = response.data;
        setTitle(detail.title);
        setDescription(detail.description ?? "");
        setStartsAt(toDateInput(detail.startsAt));
        setEndsAt(toDateInput(detail.endsAt));
        setVisibility(detail.visibility);
        setJoinPolicy(detail.joinPolicy);
        setClubId(detail.clubId ?? "");
        if (detail.format === "quest" && detail.questGraph) {
          const graph = detail.questGraph;
          setFormat("quest");
          setQuest({
            styleKey: graph.styleKey,
            nodes: [...graph.nodes]
              .sort((a, b) => (a.key < b.key ? -1 : 1))
              .map((node) => ({
                key: node.key,
                kind: node.kind,
                label: node.label,
                optional: node.optional,
                join: node.join,
                x: node.x,
                y: node.y,
                mode: node.objective
                  ? questModeForDomains(node.objective.domains)
                  : "read",
                target: node.objective?.target ?? 1,
                groupOperator:
                  node.objective?.rule?.type === "group"
                    ? node.objective.rule.operator
                    : "and",
                conditions: flattenQuestConditions(
                  node.objective?.rule ?? null,
                ),
              })),
            edges: graph.edges.map((edge) => ({
              from: edge.fromKey,
              to: edge.toKey,
            })),
          });
        } else if (detail.format === "bingo" && detail.bingoBoard) {
          const board = detail.bingoBoard;
          setFormat("bingo");
          setBingo({
            size: board.size,
            victory: board.victory,
            victoryLines: board.victoryLines ?? 2,
            styleKey: board.styleKey,
            squares: [...board.squares]
              .sort((a, b) => a.position - b.position)
              .map((square) => ({
                key: square.id,
                label: square.label,
                mode: square.objective
                  ? bingoModeForDomains(square.objective.domains)
                  : "read",
                target: square.objective?.target ?? 1,
                groupOperator:
                  square.objective?.rule?.type === "group"
                    ? square.objective.rule.operator
                    : "and",
                conditions: flattenBingoConditions(
                  square.objective?.rule ?? null,
                ),
                freeSpace: square.freeSpace,
              })),
          });
        } else {
          setTarget(detail.objectives[0]?.target ?? 5);
        }
        setLocked(
          detail.effectiveState === "active" ||
            detail.effectiveState === "completed" ||
            detail.effectiveState === "ended" ||
            detail.effectiveState === "cancelled",
        );
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const domains = MODE_DOMAINS[mode];
    const common = editing
      ? {
          title: title.trim(),
          description: description.trim() || null,
          visibility,
          joinPolicy,
          endsAt: endsAt
            ? new Date(`${endsAt}T00:00:00.000Z`).toISOString()
            : undefined,
        }
      : {
          title: title.trim(),
          description: description.trim() || null,
          visibility,
          joinPolicy,
          clubId: clubId || null,
          startsAt: startsAt
            ? new Date(`${startsAt}T00:00:00.000Z`).toISOString()
            : undefined,
          endsAt: endsAt
            ? new Date(`${endsAt}T00:00:00.000Z`).toISOString()
            : undefined,
          achievement: achievementName.trim()
            ? { name: achievementName.trim() }
            : null,
        };
    try {
      let body: Record<string, unknown>;
      if (format === "bingo") {
        body = {
          ...common,
          format: "bingo",
          board: bingoDraftToBoardInput(bingo),
        };
        if (editing && !locked) {
          body.startsAt = startsAt
            ? new Date(`${startsAt}T00:00:00.000Z`).toISOString()
            : undefined;
        }
      } else if (format === "quest") {
        body = {
          ...common,
          format: "quest",
          quest: questDraftToGraphInput(quest),
        };
        if (editing && !locked) {
          body.startsAt = startsAt
            ? new Date(`${startsAt}T00:00:00.000Z`).toISOString()
            : undefined;
        }
      } else {
        const objective = {
          metric: MODE_METRIC[mode],
          aggregation: { kind: "count" },
          target: Math.max(1, target),
          activity: "finish",
          basis: "completed",
          domains,
        };
        body = editing
          ? { ...common }
          : { ...common, format: "simple", objectives: [objective] };
        if (editing && !locked) {
          body.startsAt = startsAt
            ? new Date(`${startsAt}T00:00:00.000Z`).toISOString()
            : undefined;
          body.objectives = [objective];
        }
      }
      const response = await api<{ data: ChallengeRecord }>(
        editing ? `/challenges/${id}` : "/challenges",
        { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) },
      );
      void navigate(`/challenges/${response.data.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("loadError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div className={`${styles.page} ${styles.builder}`}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t("title")}</p>
          <h1>{editing ? t("editTitle") : t("createTitle")}</h1>
          {editing && (
            <p className={styles.helper}>
              {format === "bingo"
                ? t("formatBingo")
                : format === "quest"
                  ? t("formatQuest")
                  : t("formatSimple")}
            </p>
          )}
          {locked && (
            <p className={styles.helper}>
              {format === "bingo"
                ? t("boardLocked")
                : format === "quest"
                  ? t("questLocked")
                  : t("objectiveLocked")}
            </p>
          )}
        </div>
        <Link to="/challenges">
          <Button>{t("cancel")}</Button>
        </Link>
      </header>
      <form onSubmit={save}>
        {!editing && (
          <section className={styles.builderSection}>
            <h2>{t("selectFormat")}</h2>
            <div className={styles.choiceGrid}>
              {(["simple", "bingo", "quest"] as const).map((item) => (
                <button
                  className={
                    format === item ? styles.choiceSelected : styles.choice
                  }
                  key={item}
                  type="button"
                  onClick={() => setFormat(item)}
                >
                  {t(
                    item === "simple"
                      ? "formatSimple"
                      : item === "bingo"
                        ? "formatBingo"
                        : "formatQuest",
                  )}
                </button>
              ))}
            </div>
            <p className={styles.helper}>
              {format === "simple"
                ? t("simpleHint")
                : format === "bingo"
                  ? t("bingoHint")
                  : t("questHint")}
            </p>
          </section>
        )}
        {format === "simple" && (
          <section className={styles.builderSection}>
            <h2>{t("whatCounts")}</h2>
            <div className={styles.choiceGrid}>
              {(Object.keys(MODE_DOMAINS) as Mode[]).map((item) => (
                <button
                  className={
                    mode === item ? styles.choiceSelected : styles.choice
                  }
                  key={item}
                  type="button"
                  onClick={() => setMode(item)}
                  disabled={editing && locked}
                >
                  {t(item === "any" ? "anyMedia" : item)}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className={styles.builderSection}>
          <div className={styles.fieldRow}>
            <label htmlFor="challenge-title">{t("challengeTitle")}</label>
            <input
              className={styles.input}
              id="challenge-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className={styles.fieldRow}>
            <label htmlFor="challenge-description">{t("description")}</label>
            <input
              className={styles.input}
              id="challenge-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {format === "simple" && (
            <div className={styles.fieldRow}>
              <label htmlFor="challenge-target">{t("target")}</label>
              <input
                className={styles.input}
                id="challenge-target"
                type="number"
                min="1"
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                disabled={editing && locked}
              />
            </div>
          )}
          <div className={styles.fieldRow}>
            <label htmlFor="challenge-start">{t("from")}</label>
            <input
              className={styles.input}
              id="challenge-start"
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              disabled={editing && locked}
            />
            <label htmlFor="challenge-end">{t("to")}</label>
            <input
              className={styles.input}
              id="challenge-end"
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
        </section>

        {format === "bingo" && (
          <BingoBoardEditor
            value={bingo}
            onChange={handleBingoChange}
            disabled={editing && locked}
          />
        )}

        {format === "quest" && (
          <QuestMapEditor
            value={quest}
            onChange={setQuest}
            disabled={editing && locked}
          />
        )}

        <section className={styles.builderSection}>
          <div className={styles.fieldRow}>
            <label htmlFor="challenge-visibility">{t("visibility")}</label>
            <select
              className={styles.select}
              id="challenge-visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
            >
              <option value="public">{t("visibilityPublic")}</option>
              <option value="private">{t("visibilityPrivate")}</option>
            </select>
            <label htmlFor="challenge-join">{t("joinPolicy")}</label>
            <select
              className={styles.select}
              id="challenge-join"
              value={joinPolicy}
              onChange={(e) => setJoinPolicy(e.target.value)}
            >
              <option value="open">{t("joinOpen")}</option>
              <option value="invite_only">{t("joinInviteOnly")}</option>
              {clubId && (
                <option value="club_members">{t("joinClubMembers")}</option>
              )}
            </select>
          </div>
          {!editing && (
            <div className={styles.fieldRow}>
              <label htmlFor="challenge-club">{t("club")}</label>
              <select
                className={styles.select}
                id="challenge-club"
                value={clubId}
                onChange={(e) => {
                  setClubId(e.target.value);
                  if (e.target.value) setJoinPolicy("club_members");
                  else setJoinPolicy("open");
                }}
              >
                <option value="">{t("noClub")}</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!editing && (
            <div className={styles.fieldRow}>
              <label htmlFor="challenge-achievement">{t("achievement")}</label>
              <input
                className={styles.input}
                id="challenge-achievement"
                value={achievementName}
                onChange={(e) => setAchievementName(e.target.value)}
                placeholder={t("achievementName")}
              />
            </div>
          )}
        </section>

        {error && (
          <p role="alert" className={styles.helper}>
            {error}
          </p>
        )}
        <div className={styles.builderActions}>
          <Link to="/challenges">
            <Button type="button">{t("cancel")}</Button>
          </Link>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? t("loading") : t("saveChallenge")}
          </Button>
        </div>
      </form>
    </div>
  );
}

type UserSearchResult = {
  id: string;
  username: string;
  displayName?: string | null;
};

export function ChallengeDetailPage() {
  const { t } = useTranslation("challenges");
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ChallengeDetail | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [invites, setInvites] = useState<ChallengeInvite[]>([]);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteResults, setInviteResults] = useState<UserSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!id) return;
    try {
      const [detailResponse, participantsResponse] = await Promise.all([
        api<{ data: ChallengeDetail }>(`/challenges/${id}`),
        api<{ data: Participant[] }>(
          `/challenges/${id}/participants/summaries`,
        ),
      ]);
      setDetail(detailResponse.data);
      setParticipants(participantsResponse.data);
      if (detailResponse.data.canManage) {
        try {
          const invitesResponse = await api<{ data: ChallengeInvite[] }>(
            `/challenges/${id}/invites`,
          );
          setInvites(invitesResponse.data);
        } catch {
          setInvites([]);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("loadError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function join() {
    if (!id) return;
    setBusy(true);
    try {
      await api(`/challenges/${id}/join`, { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (!id) return;
    setBusy(true);
    try {
      await api(`/challenges/${id}/leave`, { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!id) return;
    setBusy(true);
    try {
      await api(`/challenges/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "cancelled" }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function searchUsers(query: string) {
    setInviteQuery(query);
    if (query.trim().length < 2) {
      setInviteResults([]);
      return;
    }
    try {
      const response = await api<{ data: UserSearchResult[] }>(
        `/users/search?q=${encodeURIComponent(query.trim())}`,
      );
      setInviteResults(response.data.slice(0, 8));
    } catch {
      setInviteResults([]);
    }
  }

  async function inviteUser(userId: string) {
    if (!id) return;
    setBusy(true);
    try {
      await api(`/challenges/${id}/invites`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      setInviteQuery("");
      setInviteResults([]);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!detail) return <LoadingState />;

  const progress = detail.viewerProgress;
  const participation = detail.viewerParticipation;

  return (
    <div className={`${styles.page} ${styles.detail}`}>
      <Link to="/challenges">{t("backToChallenges")}</Link>
      <header className={styles.detailHeader}>
        <p className={styles.eyebrow}>{t("title")}</p>
        <h1>{detail.title}</h1>
        {detail.description && (
          <p className={styles.lead}>{detail.description}</p>
        )}
        <p className={styles.detailMeta}>
          {displayDate(detail.startsAt)} – {displayDate(detail.endsAt)} ·{" "}
          {detail.effectiveState} · {detail.joinPolicy}
        </p>
        <p className={styles.detailMeta}>
          {t("participants")}: {detail.participantCount ?? 0}
          {participation?.state === "completed" && ` · ${t("completed")}`}
        </p>
        <div className={styles.builderActions}>
          {detail.canJoin && (
            <Button
              variant="primary"
              onClick={() => void join()}
              disabled={busy}
            >
              {t("join")}
            </Button>
          )}
          {detail.canLeave && (
            <Button onClick={() => void leave()} disabled={busy}>
              {t("leave")}
            </Button>
          )}
          {detail.canManage && (
            <>
              <Link to={`/challenges/${detail.id}/edit`}>
                <Button>{t("editTitle")}</Button>
              </Link>
              {(detail.effectiveState === "active" ||
                detail.effectiveState === "upcoming") && (
                <Button onClick={() => void cancel()} disabled={busy}>
                  {t("cancelChallenge")}
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      {detail.format === "bingo" ? (
        detail.bingo ? (
          <BingoBoardGrid board={detail.bingo} challengeId={detail.id} />
        ) : (
          <p className={styles.helper}>{t("loadError")}</p>
        )
      ) : detail.format === "quest" ? (
        detail.quest ? (
          <QuestMap graph={detail.quest} challengeId={detail.id} />
        ) : (
          <p className={styles.helper}>{t("loadError")}</p>
        )
      ) : (
        progress && (
          <section className={styles.detailProgress}>
            <div>
              <h2 className={styles.sectionTitle}>{t("yourProgress")}</h2>
              <div className={styles.bigProgress}>
                {progress.current}{" "}
                <span className={styles.detailMeta}>of {progress.target}</span>
              </div>
              <div
                className={styles.progressTrack}
                aria-label={`${progress.percentage}%`}
              >
                <div
                  className={styles.progressFill}
                  style={{
                    width: `${Math.max(0, Math.min(100, progress.percentage))}%`,
                  }}
                />
              </div>
              <p className={styles.detailMeta}>{progress.percentage}%</p>
              {participation?.state === "completed" && (
                <p className={styles.detailMeta}>✓ {t("completed")}</p>
              )}
            </div>
          </section>
        )
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("rules")}</h2>
        {detail.format === "bingo" && detail.bingo ? (
          <ul className={styles.ruleList}>
            {detail.bingo.squares.map((square) => (
              <li className={styles.ruleItem} key={square.id}>
                <strong>{square.label}</strong>
                <span className={styles.detailMeta}>
                  {" "}
                  · {square.state}
                  {square.objective &&
                    ` · ${objectiveSummary(square.objective)}`}
                </span>
              </li>
            ))}
          </ul>
        ) : detail.format === "quest" && detail.quest ? (
          <ul className={styles.ruleList}>
            {detail.quest.nodes.map((node) => (
              <li className={styles.ruleItem} key={node.id}>
                <strong>{node.label}</strong>
                <span className={styles.detailMeta}>
                  {" "}
                  · {node.kind}
                  {node.optional ? ` · ${t("nodeOptional")}` : ""} ·{" "}
                  {node.state}
                  {node.objective &&
                    ` · ${objectiveSummary(node.objective)}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className={styles.ruleList}>
            {detail.objectives.map((objective) => (
              <li className={styles.ruleItem} key={objective.id}>
                {objectiveSummary(objective)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {t("participants")} ({participants.length})
        </h2>
        {participants.length > 0 ? (
          <ul className={styles.ruleList}>
            {participants.map((participant) => (
              <li className={styles.ruleItem} key={participant.userId}>
                <strong>
                  {participant.displayName ??
                    participant.username ??
                    participant.userId.slice(0, 8)}
                </strong>
                <span className={styles.detailMeta}>
                  {" "}
                  · {participant.state} · {displayDate(participant.joinedAt)}
                  {participant.completedAt &&
                    ` · ${t("completed")} ${displayDate(participant.completedAt)}`}
                </span>
                {participant.summary && detail && (
                  <ParticipantSummaryLine
                    summary={participant.summary}
                    challenge={detail}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.helper}>{t("profileEmpty")}</p>
        )}
      </section>

      {detail.canManage && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("inviteTitle")}</h2>
          <p className={styles.helper}>{t("inviteHint")}</p>
          <div className={styles.fieldRow}>
            <input
              className={styles.input}
              aria-label={t("inviteSearch")}
              value={inviteQuery}
              onChange={(e) => void searchUsers(e.target.value)}
              placeholder={t("inviteSearchPlaceholder")}
            />
          </div>
          {inviteResults.length > 0 && (
            <ul className={styles.ruleList}>
              {inviteResults.map((result) => (
                <li className={styles.ruleItem} key={result.id}>
                  <strong>
                    {result.displayName ?? result.username}
                  </strong>{" "}
                  <span className={styles.detailMeta}>
                    @{result.username}
                  </span>{" "}
                  <Button
                    disabled={busy}
                    onClick={() => void inviteUser(result.id)}
                  >
                    {t("inviteAction")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {invites.length > 0 && (
            <>
              <h3 className={styles.cardMeta}>{t("pendingInvites")}</h3>
              <ul className={styles.ruleList}>
                {invites.map((invite) => (
                  <li className={styles.ruleItem} key={invite.id}>
                    <strong>
                      {invite.inviteeDisplayName ??
                        invite.inviteeUsername ??
                        invite.inviteeUserId.slice(0, 8)}
                    </strong>
                    <span className={styles.detailMeta}>
                      {" "}
                      · {invite.state} ·{" "}
                      {displayDate(invite.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function ParticipantSummaryLine({
  summary,
  challenge,
}: {
  summary: ChallengeSocialSummary;
  challenge: ChallengeDetail;
}) {
  const { t } = useTranslation("challenges");
  if (summary.format === "simple") {
    return (
      <span className={styles.detailMeta}>
        {" "}
        · {summary.current}/{summary.target}
        {summary.completed ? ` · ✓ ${t("completed")}` : ""}
      </span>
    );
  }
  return (
    <div>
      <ChallengeMiniVisual challenge={challenge} summary={summary} />
    </div>
  );
}

export function ChallengeProfileSection({ username }: { username: string }) {
  const { t } = useTranslation("challenges");
  const [data, setData] = useState<{
    active: ChallengeRecord[];
    completed: ChallengeRecord[];
  } | null>(null);

  useEffect(() => {
    let live = true;
    void api<{
      data: { active: ChallengeRecord[]; completed: ChallengeRecord[] };
    }>(`/profiles/${encodeURIComponent(username)}/challenges`)
      .then((response) => {
        if (live) setData(response.data);
      })
      .catch(() => {
        if (live) setData(null);
      });
    return () => {
      live = false;
    };
  }, [username]);

  if (!data || (data.active.length === 0 && data.completed.length === 0)) {
    return null;
  }

  return (
    <section className={styles.section} aria-label={t("profileTitle")}>
      <h2 className={styles.sectionTitle}>{t("profileTitle")}</h2>
      {data.active.length > 0 && (
        <>
          <h3 className={styles.cardMeta}>{t("profileActive")}</h3>
          <div className={styles.grid}>
            {data.active.map((challenge) => (
              <ChallengeCard challenge={challenge} key={challenge.id} />
            ))}
          </div>
        </>
      )}
      {data.completed.length > 0 && (
        <>
          <h3 className={styles.cardMeta}>{t("profileCompleted")}</h3>
          <div className={styles.grid}>
            {data.completed.map((challenge) => (
              <ChallengeCard challenge={challenge} key={challenge.id} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
