import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api";
import {
  formatProfileDisplayIdentity,
  type ProfileAchievementView,
  type ProfileCosmetics,
  type ViewerProfileView,
} from "@shared/profile-platform";
import { formatUserHandle } from "@shared/user-identity";
import { UserAvatar, UserIdentity } from "../users";
import { ARTIFACT_REGISTRY } from "./artifactRegistry";
import { AchievementIcon } from "../achievements/AchievementIcon";
import { ChallengeProfileSection } from "../../app/pages/ChallengePages";
import { PresenceLine } from "./PresenceLine";
import { ProfileName } from "./ProfileName";
import styles from "./profile.module.css";

const MARKS: Record<string, string> = {
  hardcover: "H",
  goodreads: "G",
  storygraph: "S",
  letterboxd: "L",
  bluesky: "B",
  instagram: "I",
  spotify: "Sp",
};

/** Only known-safe accent values reach the stylesheet. */
function safeAccent(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
  if (/^[a-zA-Z][a-zA-Z-]{2,24}$/.test(trimmed)) return trimmed;
  return null;
}

function ProviderIcon({ provider }: { provider: string }) {
  // Letter marks keep social links compact; the accessible name carries
  // the recognizable service identity. Icon enhances presentation only.
  return <span aria-hidden>{MARKS[provider] ?? "↗"}</span>;
}

type FollowPerson = {
  username: string;
  displayName: string;
  avatarUrl?: string;
};

export function ProfileView({ username }: { username: string }) {
  const { t } = useTranslation("profile");
  const [profile, setProfile] = useState<ViewerProfileView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);
  const [followDialog, setFollowDialog] = useState<
    "followers" | "following" | null
  >(null);
  const [followList, setFollowList] = useState<FollowPerson[]>([]);
  const [activeTab, setActiveTab] = useState<
    "stats" | "guestbook" | "goals" | null
  >(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    setProfile(null);
    void api<{ data: ViewerProfileView }>(
      `/profiles/${encodeURIComponent(username)}/full`,
    )
      .then((res) => {
        if (live) setProfile(res.data);
      })
      .catch((err) => {
        if (!live) return;
        setProfile(null);
        setError(
          err instanceof Error
            ? err.message
            : t("loadError", { defaultValue: "Profile not found." }),
        );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [username, t]);

  const normalizedArtifacts = profile
    ? profile.artifacts
        .map((artifact) => {
          const normalized =
            artifact.artifactType === "shelf-preview"
              ? "shelf"
              : artifact.artifactType;
          const def =
            ARTIFACT_REGISTRY[normalized as keyof typeof ARTIFACT_REGISTRY];
          if (!def) return null;
          const body = def.render({
            data: artifact.data,
            config: artifact.config,
            owner: {
              username: profile.username,
              displayName: profile.displayName,
            },
          });
          if (!body) return null;
          return {
            artifact: { ...artifact, artifactType: normalized },
            def,
            body,
          };
        })
        .filter((entry) => entry !== null)
    : [];

  const hasContent =
    normalizedArtifacts.length > 0 ||
    (profile
      ? profile.obsessions.length > 0 ||
        profile.goals.length > 0 ||
        profile.recentAchievements.length > 0
      : false);
  const showStatsTab = normalizedArtifacts.some(
    ({ artifact }) => artifact.artifactType === "stats",
  );
  const showGuestbookTab = profile
    ? profile.guestbookEnabled || profile.isOwner
    : false;
  const showGoalsTab = profile ? profile.goals.length > 0 : false;
  const statsArtifact = normalizedArtifacts.find(
    ({ artifact }) => artifact.artifactType === "stats",
  );

  useEffect(() => {
    if (!showStatsTab && !showGuestbookTab) {
      setActiveTab(null);
      return;
    }
    if (activeTab === "stats" && showStatsTab) return;
    if (activeTab === "guestbook" && showGuestbookTab) return;
    if (activeTab === "goals" && showGoalsTab) return;
    setActiveTab(showStatsTab ? "stats" : showGoalsTab ? "goals" : "guestbook");
  }, [activeTab, showGoalsTab, showGuestbookTab, showStatsTab]);

  async function toggleFollow() {
    if (!profile || followBusy) return;
    setFollowBusy(true);
    try {
      const method = profile.isFollowing ? "DELETE" : "POST";
      const res = await api<{
        data: { isFollowing: boolean; followers: number; following: number };
      }>(`/profiles/${encodeURIComponent(profile.username)}/follow`, {
        method,
      });
      setProfile({
        ...profile,
        isFollowing: res.data.isFollowing,
        counts: {
          followers: res.data.followers,
          following: res.data.following,
        },
      });
    } catch {
      // Follow failures leave existing state untouched; the button remains.
    } finally {
      setFollowBusy(false);
    }
  }

  async function openFollowDialog(kind: "followers" | "following") {
    if (!profile) return;
    setFollowDialog(kind);
    setFollowList([]);
    try {
      const res = await api<{ data: FollowPerson[] }>(
        `/profiles/${encodeURIComponent(profile.username)}/${kind}?limit=50`,
      );
      setFollowList(res.data);
    } catch {
      setFollowList([]);
    }
  }

  if (loading) return <ProfileSkeleton handle={username} />;

  if (error || !profile) {
    // Privacy-preserving: private and missing profiles share one message.
    return (
      <div className={styles.profile}>
        <h1 className={styles.errorTitle}>
          {t("notFound", { defaultValue: "Profile not found" })}
        </h1>
        <p className={styles.artifactMeta}>{error}</p>
      </div>
    );
  }

  const accent = safeAccent(profile.appearance.accent);
  const heroTreatment = profile.appearance.heroTreatment ?? "banner";
  const showBanner = heroTreatment !== "minimal" && Boolean(profile.bannerUrl);
  const identity = formatProfileDisplayIdentity(
    profile.displayName,
    profile.username,
    profile.pronouns,
  );
  const profileDisplayName = (profile.displayName ?? "").trim();
  const profileHandle = `@${profile.username}`;

  return (
    <div
      className={styles.profile}
      data-surface={profile.appearance.surfaceTreatment ?? "default"}
      data-cards={profile.appearance.cardStyle ?? "flat"}
      data-hero={heroTreatment}
      style={
        accent
          ? ({ "--profile-accent": accent } as React.CSSProperties)
          : undefined
      }
    >
      {profile.appearance.customCss && (
        <style>{profile.appearance.customCss}</style>
      )}

      <header className="profile-hero">
        {heroTreatment !== "minimal" && (
          <div
            aria-hidden={!showBanner}
            className={
              heroTreatment === "compact" ? styles.bannerCompact : styles.banner
            }
          >
            {showBanner && <img src={profile.bannerUrl} alt="" />}
          </div>
        )}
        <div className="profile-identity">
          <span className={styles.avatarOverlap}>
            <UserAvatar
              displayName={profile.displayName}
              username={profile.username}
              avatarUrl={profile.avatarUrl}
              size="lg"
            />
          </span>
          <div className={styles.identityBody}>
            <div className={styles.identityTopRow}>
              <div className={styles.identityText}>
                <h1 className={styles.profileName}>
                  {profileDisplayName ? (
                    <ProfileName
                      user={{
                        username: profile.username,
                        displayName: profile.displayName,
                        cosmetics: profile.appearance.cosmetics,
                      }}
                      size="lg"
                    />
                  ) : (
                    profileHandle
                  )}
                  {identity.secondary && (
                    <span className={styles.pronouns}>
                      {" "}
                      {identity.secondary}
                    </span>
                  )}
                </h1>
                <p className={styles.profileHandle}>{profileHandle}</p>
              </div>
              {!profile.isOwner ? (
                <button
                  type="button"
                  className={styles.followButton}
                  aria-pressed={profile.isFollowing}
                  onClick={() => void toggleFollow()}
                  disabled={followBusy}
                >
                  {profile.isFollowing
                    ? t("followingBadge", { defaultValue: "Following" })
                    : t("follow", { defaultValue: "Follow" })}
                </button>
              ) : (
                <div className={styles.ownerActions}>
                  <Link to="/settings/profile" className={styles.editLink}>
                    {t("editProfile", { defaultValue: "Edit profile" })}
                  </Link>
                  <Link
                    to="/settings/profile?section=appearance"
                    className={styles.editLink}
                  >
                    {t("customizeProfile", {
                      defaultValue: "Customize profile",
                    })}
                  </Link>
                </div>
              )}
            </div>
            {profile.bio && <p className={styles.profileBio}>{profile.bio}</p>}
            <div className={styles.identityMetaRow}>
              <PresenceLine username={profile.username} />
              {profile.links.length > 0 && (
                <ul className={`profile-links ${styles.linkChips}`}>
                  {profile.links.map((link) => {
                    const known = link.provider !== "generic";
                    const visibleLabel = known
                      ? link.providerLabel
                      : link.label;
                    return (
                      <li key={link.id}>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.linkChip}
                          title={
                            known
                              ? `${link.providerLabel} — ${link.url}`
                              : link.url
                          }
                          aria-label={
                            known
                              ? `${link.providerLabel} (${link.label})`
                              : link.label
                          }
                        >
                          <ProviderIcon provider={link.provider} />
                          <span>{visibleLabel}</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className={styles.followCounts}>
              <button
                type="button"
                className={styles.profileCountButton}
                onClick={() => void openFollowDialog("followers")}
                aria-haspopup="dialog"
              >
                {t("followerCount", {
                  defaultValue: "{{count}} followers",
                  count: profile.counts.followers,
                })}
              </button>
              <span aria-hidden> · </span>
              <button
                type="button"
                className={styles.profileCountButton}
                onClick={() => void openFollowDialog("following")}
                aria-haspopup="dialog"
              >
                {t("followingCount", {
                  defaultValue: "{{count}} following",
                  count: profile.counts.following,
                })}
              </button>
            </p>
          </div>
        </div>
      </header>

      {followDialog && (
        <FollowDialog
          kind={followDialog}
          people={followList}
          onClose={() => setFollowDialog(null)}
        />
      )}

      {!hasContent ? (
        <ProfileEmptyState profile={profile} />
      ) : (
        <div className={`profile-artifacts ${styles.profileArtifacts}`}>
          {normalizedArtifacts.map(({ artifact, def, body }) => (
            <section
              key={artifact.id}
              className={`profile-artifact profile-artifact--${artifact.artifactType} ${styles.profileArtifact} ${styles[`profile-artifact--${artifact.size}`] ?? ""}`}
              data-size={artifact.size}
              aria-label={def.label}
            >
              <h2 className={styles.profileArtifactTitle}>{def.label}</h2>
              {body}
            </section>
          ))}
        </div>
      )}

      {profile.recentAchievements.length > 0 && (
        <RecentAchievementsSection achievements={profile.recentAchievements} />
      )}

      <ChallengeProfileSection username={profile.username} />

      {(showStatsTab || showGuestbookTab || showGoalsTab) && (
        <nav className={styles.profileTabs} aria-label="Profile sections">
          {showStatsTab && (
            <button
              type="button"
              className={styles.profileTab}
              onClick={() => setActiveTab("stats")}
              aria-current={activeTab === "stats" ? "page" : undefined}
            >
              Stats
            </button>
          )}
          {showGuestbookTab && (
            <button
              type="button"
              className={styles.profileTab}
              onClick={() => setActiveTab("guestbook")}
              aria-current={activeTab === "guestbook" ? "page" : undefined}
            >
              Guestbook
            </button>
          )}
          {showGoalsTab && (
            <button
              type="button"
              className={styles.profileTab}
              onClick={() => setActiveTab("goals")}
              aria-current={activeTab === "goals" ? "page" : undefined}
            >
              Goals
            </button>
          )}
        </nav>
      )}

      {activeTab === "stats" && statsArtifact && (
        <div className={styles.profileTabContent}>{statsArtifact.body}</div>
      )}

      {activeTab === "guestbook" && (
        <GuestbookSection
          username={profile.username}
          enabled={profile.guestbookEnabled}
          isOwner={profile.isOwner}
        />
      )}

      {activeTab === "goals" && profile && (
        <section className={styles.profileTabContent}>
          <div className={styles.goalProfileList}>
            {profile.goals.map((goal) => (
              <Link
                className={styles.goalProfileCard}
                to={`/goals/${goal.id}`}
                key={goal.id}
              >
                <div className={styles.goalProfileHeader}>
                  <strong>{goal.title}</strong>
                  <span>
                    {goal.completed
                      ? "Completed"
                      : `${goal.current} / ${goal.target}`}
                  </span>
                </div>
                <p>{goal.presentation}</p>
                <div className={styles.goalProfileTrack}>
                  <span style={{ width: `${goal.percentage}%` }} />
                </div>
                <small>{goal.percentage}%</small>
              </Link>
            ))}
          </div>
        </section>
      )}

      {activeTab === null && showGuestbookTab && (
        <GuestbookSection
          username={profile.username}
          enabled={profile.guestbookEnabled}
          isOwner={profile.isOwner}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recent achievements — the simple Profile Experience surface for    */
/* Achievements 1.0. A dedicated history/showcase comes later.        */
/* ------------------------------------------------------------------ */

function RecentAchievementsSection({
  achievements,
}: {
  achievements: ProfileAchievementView[];
}) {
  const { t } = useTranslation("achievements");
  return (
    <section
      className={styles.achievements}
      aria-label={t("recentAchievements", {
        defaultValue: "Recent achievements",
      })}
    >
      <h2 className={styles.profileArtifactTitle}>
        {t("recentAchievements", { defaultValue: "Recent achievements" })}
      </h2>
      <ol className={styles.achievementList}>
        {achievements.map((achievement) => {
          const earned = new Date(achievement.earnedAt);
          const validDate = Number.isNaN(earned.getTime()) ? null : earned;
          return (
            <li key={achievement.id} className={styles.achievementRow}>
              <AchievementIcon icon={achievement.icon} size="sm" />
              <div className={styles.achievementBody}>
                <p className={styles.achievementName}>{achievement.name}</p>
                <p
                  className={`${styles.artifactMeta} ${styles.achievementMeta}`}
                >
                  {achievement.sourceLabel
                    ? t("fromSource", {
                        defaultValue: "From {{source}}",
                        source: achievement.sourceLabel,
                      })
                    : null}
                  {achievement.sourceLabel && validDate ? " · " : null}
                  {validDate ? (
                    <time dateTime={achievement.earnedAt}>
                      {validDate.toLocaleDateString()}
                    </time>
                  ) : null}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function ProfileSkeleton({ handle }: { handle: string }) {
  const { t } = useTranslation("profile");
  return (
    <div className={styles.profile} aria-busy="true" aria-live="polite">
      <p className={styles.skeletonStatus}>
        {t("loadingProfile", {
          defaultValue: "Loading {{handle}}…",
          handle: formatUserHandle(handle),
        })}
      </p>
      <div className={styles.skeletonBanner} aria-hidden />
      <div className={styles.skeletonRow} aria-hidden>
        <span className={styles.skeletonAvatar} />
        <span className={styles.skeletonLines}>
          <span />
          <span />
        </span>
      </div>
      <div className={styles.skeletonGrid} aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function ProfileEmptyState({ profile }: { profile: ViewerProfileView }) {
  const { t } = useTranslation("profile");
  const joined = profile.memberSince ? new Date(profile.memberSince) : null;
  const validJoined = joined && !Number.isNaN(joined.getTime()) ? joined : null;
  if (profile.isOwner) {
    return (
      <div className={styles.emptyState}>
        <p>
          {t("ownEmpty", { defaultValue: "Your shelf is bare — for now." })}
        </p>
        <p className={styles.artifactMeta}>
          {t("ownEmptyHint", {
            defaultValue:
              "Pin an obsession, pick favorites, or preview a shelf to make this your space.",
          })}
        </p>
        <p>
          <Link to="/settings/profile" className={styles.editLink}>
            {t("customizeProfile", { defaultValue: "Customize profile" })}
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className={styles.emptyState}>
      <p>
        {t("sparseProfile", {
          defaultValue: "{{name}} hasn't decorated much yet.",
          name: profile.displayName,
        })}
      </p>
      {validJoined && (
        <p className={styles.artifactMeta}>
          {t("joinedFeylore", {
            defaultValue: "Joined Feylore · {{date}}",
            date: validJoined.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            }),
          })}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FollowDialog({
  kind,
  people,
  onClose,
}: {
  kind: "followers" | "following";
  people: FollowPerson[];
  onClose: () => void;
}) {
  const { t } = useTranslation("profile");
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={styles.dialogBackdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.dialog}
      >
        <div className={styles.dialogHeader}>
          <h2 id={titleId}>
            {kind === "followers"
              ? t("followers", { defaultValue: "Followers" })
              : t("following", { defaultValue: "Following" })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={styles.dialogClose}
          >
            {t("close", { defaultValue: "Close" })}
          </button>
        </div>
        {people.length === 0 ? (
          <p className={styles.artifactMeta}>
            {t("nobodyHere", { defaultValue: "Nobody to show." })}
          </p>
        ) : (
          <ul className={styles.dialogList}>
            {people.map((person) => (
              <li key={person.username}>
                <UserIdentity
                  user={{
                    username: person.username,
                    displayName: person.displayName,
                    avatarUrl: person.avatarUrl,
                  }}
                  variant="full"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Guestbook — the page footer and social sign-off. Pinned to the      */
/* bottom, outside the artifact grid; never a movable artifact.        */
/* ------------------------------------------------------------------ */

type GuestbookEntry = {
  id: string;
  body: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl?: string;
  authorCosmetics?: ProfileCosmetics | null;
  isOwn: boolean;
  createdAt: string;
};

function GuestbookSection({
  username,
  enabled,
  isOwner,
}: {
  username: string;
  enabled: boolean;
  isOwner: boolean;
}) {
  const { t } = useTranslation("profile");
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled && !isOwner) return;
    let live = true;
    void api<{ data: GuestbookEntry[] }>(
      `/profiles/${encodeURIComponent(username)}/guestbook?limit=20`,
    )
      .then((res) => {
        if (!live) return;
        setEntries(res.data);
        setTotal(res.data.length);
      })
      .catch(() => {
        if (live) setEntries([]);
      });
    return () => {
      live = false;
    };
  }, [username, enabled, isOwner]);

  if (!enabled && !isOwner) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/profiles/${encodeURIComponent(username)}/guestbook`, {
        method: "POST",
        body: JSON.stringify({ body: trimmed }),
      });
      setBody("");
      const res = await api<{ data: GuestbookEntry[] }>(
        `/profiles/${encodeURIComponent(username)}/guestbook?limit=20`,
      );
      setEntries(res.data);
      setTotal(res.data.length);
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : t("guestbookError", { defaultValue: "Could not post entry." }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(entryId: string) {
    setMessage(null);
    try {
      await api(`/profiles/guestbook/${entryId}`, { method: "DELETE" });
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      setTotal((prev) => (prev === null ? null : Math.max(0, prev - 1)));
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : t("guestbookDeleteError", {
              defaultValue: "Could not delete entry.",
            }),
      );
    }
  }

  return (
    <footer
      className={styles.guestbook}
      aria-label={t("guestbook", { defaultValue: "Guestbook" })}
    >
      <h2 className={styles.profileArtifactTitle}>
        {t("guestbook", { defaultValue: "Guestbook" })}
        {total !== null && (
          <span className={styles.artifactMeta}>
            {" "}
            ·{" "}
            {t("guestbookCount", {
              defaultValue: "{{count}} entries",
              count: total,
            })}
          </span>
        )}
      </h2>
      {!enabled && isOwner && (
        <p className={styles.artifactMeta}>
          {t("guestbookDisabled", {
            defaultValue: "Guestbook is disabled. Enable it in ",
          })}
          <Link to="/settings/profile">
            {t("profileSettings", { defaultValue: "profile settings" })}
          </Link>
          .
        </p>
      )}
      {entries.length === 0 ? (
        <p className={styles.artifactMeta}>
          {t("guestbookEmpty", {
            defaultValue: "No messages yet — be the first to sign.",
          })}
        </p>
      ) : (
        <ul className={styles.guestbookList}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.guestbookEntry}>
              <UserAvatar
                displayName={entry.authorDisplayName}
                username={entry.authorUsername}
                avatarUrl={entry.authorAvatarUrl}
                size="sm"
              />
              <div className={styles.guestbookBody}>
                <p className={styles.guestbookAuthor}>
                  <UserIdentity
                    user={{
                      username: entry.authorUsername,
                      displayName: entry.authorDisplayName,
                      avatarUrl: entry.authorAvatarUrl,
                      cosmetics: entry.authorCosmetics ?? null,
                    }}
                    variant="compact"
                  />
                </p>
                <p className={styles.guestbookText}>{entry.body}</p>
                <p className={styles.artifactMeta}>
                  <time dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </time>
                  {(entry.isOwn || isOwner) && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className={styles.inlineButton}
                        onClick={() => void remove(entry.id)}
                      >
                        {t("delete", { defaultValue: "Delete" })}
                      </button>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {(enabled || isOwner) && (
        <form onSubmit={(e) => void submit(e)} className={styles.guestbookForm}>
          <label htmlFor="guestbook-body">
            {t("leaveMessage", { defaultValue: "Leave a message" })}
          </label>
          <textarea
            id="guestbook-body"
            value={body}
            rows={3}
            maxLength={1000}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("guestbookPlaceholder", {
              defaultValue: "Sign the guestbook",
            })}
          />
          <button type="submit" disabled={busy || !body.trim()}>
            {t("post", { defaultValue: "Post" })}
          </button>
        </form>
      )}
      {message && (
        <p role="status" className={styles.artifactMeta}>
          {message}
        </p>
      )}
    </footer>
  );
}
