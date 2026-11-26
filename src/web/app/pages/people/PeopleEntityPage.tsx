import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type {
  PeopleCreditItem,
  PeopleEntityProfile,
  PeopleEntityType,
} from "@shared/people";
import { api } from "../../api";
import { LoadingState } from "../../../components/states";
import {
  albumPath,
  audiobookPath,
  bookPath,
  moviePath,
  peopleEditPath,
  tvShowPath,
} from "../../../routes/paths";
import styles from "../../../components/people/people.module.css";

const ENTITY_TYPE_KEYS: Record<PeopleEntityType, string> = {
  person: "entityType_person",
  group: "entityType_group",
  organization: "entityType_organization",
};

const TAB_ORDER = [
  "book",
  "audiobook",
  "album",
  "track",
  "movie",
  "tvShow",
  "podcast",
] as const;

const TAB_LABEL_KEYS: Record<string, string> = {
  book: "tabBooks",
  audiobook: "tabAudiobooks",
  album: "tabMusic",
  track: "tabMusic",
  movie: "tabMovies",
  tvShow: "tabTv",
  podcast: "tabPodcasts",
};

function groupType(targetType: string): string {
  if (targetType === "album" || targetType === "track") return "music";
  return targetType;
}

function mediaPath(targetType: string, slug: string): string | null {
  switch (targetType) {
    case "book":
      return bookPath(slug);
    case "audiobook":
      return audiobookPath(slug);
    case "movie":
      return moviePath(slug);
    case "tvShow":
      return tvShowPath(slug);
    case "album":
      return albumPath(slug);
    default:
      return null;
  }
}

function roleLabelsFor(creditCounts: Record<string, number>, t: (k: string) => string): string[] {
  const labels: string[] = [];
  if ((creditCounts["book"] ?? 0) > 0) labels.push(t("roleLabel_author"));
  if ((creditCounts["audiobook"] ?? 0) > 0) labels.push(t("roleLabel_narrator"));
  if (
    (creditCounts["movie"] ?? 0) + (creditCounts["tvShow"] ?? 0) > 0
  ) {
    labels.push(t("roleLabel_actor"));
  }
  if ((creditCounts["album"] ?? 0) > 0) labels.push(t("roleLabel_artist"));
  if ((creditCounts["podcast"] ?? 0) > 0) labels.push(t("roleLabel_podcast"));
  return labels.length > 0 ? labels : [t("roleLabel_contributor")];
}

function formatReleaseDate(date: string): string {
  const [y, m, d] = date.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const month = months[Number(m) - 1] ?? "";
  return `${month} ${Number(d)} ${y}`;
}

function CreditCover({ credit }: { credit: PeopleCreditItem }) {
  return credit.targetCoverFileId ? (
    <img
      src={`/api/v1/files/${credit.targetCoverFileId}`}
      alt={credit.targetTitle}
      className={styles.workCover}
    />
  ) : (
    <div className={styles.workCoverPlaceholder} aria-hidden>
      {credit.targetTitle.charAt(0)}
    </div>
  );
}

function CreditTitle({ credit }: { credit: PeopleCreditItem }) {
  if (credit.targetSlug) {
    const path = mediaPath(credit.targetType, credit.targetSlug);
    if (path) {
      return (
        <Link to={path} className={styles.workTitle}>
          {credit.targetTitle}
        </Link>
      );
    }
  }
  return <span className={styles.workTitle}>{credit.targetTitle}</span>;
}

function CreditMeta({ credit }: { credit: PeopleCreditItem }) {
  return (
    <span className={styles.workRole}>
      {credit.role}
      {credit.character ? ` · ${credit.character}` : ""}
      {credit.seriesPosition != null ? ` · #${credit.seriesPosition}` : ""}
    </span>
  );
}

function CreditRail({
  credits,
  showDate,
}: {
  credits: PeopleCreditItem[];
  showDate?: boolean;
}) {
  return (
    <div className={styles.workRail}>
      {credits.map((credit) => (
        <div key={credit.id} className={styles.workCell}>
          <CreditCover credit={credit} />
          <CreditTitle credit={credit} />
          <CreditMeta credit={credit} />
          {credit.releaseDate && showDate && (
            <span className={styles.workDate}>
              {formatReleaseDate(credit.releaseDate)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function CreditGrid({ credits }: { credits: PeopleCreditItem[] }) {
  return (
    <div className={styles.workGrid}>
      {credits.map((credit) => (
        <div key={credit.id} className={styles.workCell}>
          <CreditCover credit={credit} />
          <CreditTitle credit={credit} />
        </div>
      ))}
    </div>
  );
}

function WorksSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.worksSection}>
      <h2 className={styles.worksSectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

export function PeopleEntityPage() {
  const { t } = useTranslation("people");
  const { slug } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<PeopleEntityProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<
    "idle" | "fetching" | "done"
  >("idle");

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    void api<{ data: PeopleEntityProfile }>(`/people/${slug}`)
      .then((r) => {
        setProfile(r.data);
        const keys = Object.keys(r.data.creditCounts);
        if (keys.length > 0) {
          const ordered = TAB_ORDER.filter((key) =>
            keys.includes(key),
          );
          setActiveTab(ordered[0] ?? keys[0]!);
        }
      })
      .catch((e: Error) => {
        setError(e.message);
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const groupedTabs = useMemo(() => {
    if (!profile) return [];
    const counts: Record<string, number> = {};
    for (const [type, cnt] of Object.entries(profile.creditCounts)) {
      const group = groupType(type);
      counts[group] = (counts[group] ?? 0) + cnt;
    }
    return TAB_ORDER.filter((t) => counts[t] !== undefined).map((t) => ({
      key: t,
      count: counts[t] as number,
    }));
  }, [profile]);

  const creditsByGroup = useMemo(() => {
    if (!profile) return new Map<string, PeopleCreditItem[]>();
    const map = new Map<string, PeopleCreditItem[]>();
    for (const credit of profile.credits) {
      const group = groupType(credit.targetType);
      const list = map.get(group) ?? [];
      list.push(credit);
      map.set(group, list);
    }
    return map;
  }, [profile]);

  const linkRows = useMemo(() => {
    if (!profile) return [];
    return [...profile.links];
  }, [profile]);

  const activeCredits = creditsByGroup.get(activeTab ?? "") ?? [];

  const lastPublished = activeCredits
    .filter((c) => c.releaseDate !== null)
    .sort((a, b) =>
      (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""),
    )
    .slice(0, 10);

  const seriesGroups = activeCredits
    .reduce<Map<string, PeopleCreditItem[]>>((map, credit) => {
      if (!credit.seriesName) return map;
      const list = map.get(credit.seriesName) ?? [];
      list.push(credit);
      map.set(credit.seriesName, list);
      return map;
    }, new Map());
  const seriesGroupsSorted = [...seriesGroups.entries()]
    .map(([name, list]) => ({
      name,
      credits: list.sort(
        (a, b) =>
          (a.seriesPosition ?? Number.MAX_SAFE_INTEGER) -
          (b.seriesPosition ?? Number.MAX_SAFE_INTEGER),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const otherWorks = activeCredits.filter(
    (c) => c.releaseDate === null && !c.seriesName,
  );

  if (loading) return <LoadingState />;
  if (!slug || error || !profile) {
    return <p className={styles.empty}>{error ?? "Not found."}</p>;
  }

  const roleLabels = roleLabelsFor(profile.creditCounts, t);

  const bioTruncated =
    profile.bio && profile.bio.length > 240 && !bioExpanded
      ? `${profile.bio.slice(0, 240)}…`
      : profile.bio;

  function triggerFetch() {
    if (!slug || fetchStatus === "fetching") return;
    setFetchStatus("fetching");
    void api<{ data: { jobId: string } }>(`/people/${slug}/metadata/fetch`, {
      method: "POST",
    })
      .then(() => setFetchStatus("done"))
      .catch(() => setFetchStatus("idle"));
  }

  return (
    <div>
      <header className={styles.profileHeader}>
        {profile.photoFileId ? (
          <img
            src={`/api/v1/files/${profile.photoFileId}`}
            alt={profile.name}
            className={styles.profilePhoto}
          />
        ) : (
          <div className={styles.profilePhotoPlaceholder}>
            {profile.name.charAt(0)}
          </div>
        )}
        <div className={styles.profileInfo}>
          <div className={styles.profileTopActions}>
            <Link to={peopleEditPath(slug)} className={styles.profileAction}>
              {t("editMetadata")} ↗
            </Link>
            <button
              type="button"
              className={styles.profileAction}
              onClick={triggerFetch}
              disabled={fetchStatus === "fetching"}
            >
              {t("fetchMetadata")} ↻
            </button>
          </div>
          <h1 className={styles.profileName}>
            {profile.name}
            {profile.pronouns && (
              <span className={styles.profilePronouns}>
                {" "}
                ({profile.pronouns})
              </span>
            )}
          </h1>
          <div className={styles.profileRoles}>
            {t(ENTITY_TYPE_KEYS[profile.entityType])}
            {roleLabels.length > 0 && ` · ${roleLabels.join(" · ")}`}
          </div>
          {profile.bio && (
            <div className={styles.profileBioWrap}>
              <p className={styles.profileBio}>{bioTruncated}</p>
              {profile.bio.length > 240 && (
                <button
                  type="button"
                  className={styles.profileBioToggle}
                  onClick={() => setBioExpanded((v) => !v)}
                >
                  {bioExpanded ? t("bioLess") : t("bioMore")}
                </button>
              )}
            </div>
          )}
        </div>
        {linkRows.length > 0 || profile.personalUrl ? (
          <aside className={styles.profileLinksColumn}>
            <h2 className={styles.profileLinksTitle}>{t("linksTitle")}</h2>
            <ul className={styles.profileLinksList}>
              {profile.personalUrl && (
                <li>
                  <a
                    href={profile.personalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("personalSite")} ↗
                  </a>
                </li>
              )}
              {linkRows.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.label || link.kind} ↗
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </header>

      {profile.relationships.length > 0 && (
        <section className={styles.profileSection}>
          <h2 className={styles.profileSectionTitle}>{t("peopleTitle")}</h2>
          <ul className={styles.relationshipList}>
            {profile.relationships.map((rel) => (
              <li key={rel.relatedPeopleId} className={styles.relationshipRow}>
                <Link to={`/people/${rel.relatedSlug}`}>
                  {rel.relatedName}
                </Link>
                <span className={styles.relationshipType}>
                  {rel.relationshipType.replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {groupedTabs.length > 0 && (
        <section className={styles.profileSection}>
          <div className={styles.mediaTabs}>
            {groupedTabs.map(({ key, count }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`${styles.mediaTab} ${activeTab === key ? styles.mediaTabActive : ""}`}
              >
                {t(TAB_LABEL_KEYS[key])} ({count})
              </button>
            ))}
          </div>

          {activeTab && (
            <div>
              {lastPublished.length > 0 && (
                <WorksSection title={t("lastPublishedTitle")}>
                  <CreditRail credits={lastPublished} showDate />
                </WorksSection>
              )}
              {seriesGroupsSorted.map((series) => (
                <WorksSection key={series.name} title={series.name}>
                  <CreditRail credits={series.credits} />
                </WorksSection>
              ))}
              {otherWorks.length > 0 && (
                <WorksSection title={t("otherWorksTitle")}>
                  <CreditRail credits={otherWorks} />
                </WorksSection>
              )}
              <WorksSection title={t("allWorksTitle")}>
                <CreditGrid credits={activeCredits} />
              </WorksSection>
            </div>
          )}
        </section>
      )}
    </div>
  );
}