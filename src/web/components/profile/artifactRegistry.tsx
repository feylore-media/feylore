import type {
  ProfileArtifactSize,
  ProfileArtifactType,
} from "@shared/profile-platform";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { UserIdentity } from "../users";
import { ProfileCover, ProfilePortrait } from "./ProfileArtwork";
import styles from "./profile.module.css";

export interface ArtifactOwner {
  username: string;
  displayName: string;
}

export interface ArtifactRendererProps {
  data: Record<string, unknown> | null;
  config: Record<string, unknown>;
  owner: ArtifactOwner;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asItems(
  data: Record<string, unknown> | null,
  key = "items",
): Array<Record<string, unknown>> {
  if (!data) return [];
  const items = data[key];
  return Array.isArray(items)
    ? (items as Array<Record<string, unknown>>)
    : [];
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function fileId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function href(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("/") ? value : null;
}

function MediaLink({
  to,
  children,
  label,
}: {
  to: string | null;
  children: ReactNode;
  label: string;
}) {
  if (!to) return <span>{children}</span>;
  return (
    <Link to={to} aria-label={label} className={styles.mediaLink}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Currently obsessed with — expressive, captioned, larger imagery.    */
/* Durable taste lives in Favorites; obsessions are this week's brain. */
/* ------------------------------------------------------------------ */

function ObsessionsRenderer({ data }: ArtifactRendererProps) {
  const items = asItems(data).slice(0, 3);
  if (items.length === 0) return null;
  return (
    <ol className={styles.obsessionGrid}>
      {items.map((item) => {
        const id = str(item.id || item.targetId, String(Math.random()));
        const title = str(item.title, "Unavailable");
        const subtitle = str(item.subtitle, "");
        const note =
          typeof item.note === "string" && item.note.trim()
            ? item.note.trim()
            : null;
        const link = href(item.href);
        const restricted = item.restricted === true;
        const imageKind =
          item.imageKind === "portrait" ? "portrait" : "cover";
        const art = fileId(item.coverFileId);
        return (
          <li key={id} className={styles.obsessionCard}>
            <MediaLink to={restricted ? null : link} label={title}>
              {imageKind === "portrait" ? (
                <ProfilePortrait photoFileId={art} name={title} />
              ) : (
                <ProfileCover coverFileId={art} title={title} />
              )}
            </MediaLink>
            <p className={styles.obsessionTitle}>
              {restricted || !link ? (
                <span>{title}</span>
              ) : (
                <Link to={link}>{title}</Link>
              )}
              {subtitle && (
                <span className={styles.artifactMeta}> · {subtitle}</span>
              )}
            </p>
            {note && (
              <p className={styles.obsessionNote}>
                <q>{note}</q>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Favorites — durable taste as a cover/poster row.                    */
/* ------------------------------------------------------------------ */

function FavoritesRenderer({ data }: ArtifactRendererProps) {
  const items = asItems(data).slice(0, 6);
  if (items.length === 0) return null;
  return (
    <ol className={styles.coverRow}>
      {items.map((item, index) => {
        const title = str(item.title ?? item.subjectId, "Untitled");
        const link = href(item.href);
        const key = `${str(item.subjectType, "item")}-${str(item.subjectId, String(index))}`;
        return (
          <li key={key} className={styles.coverCell}>
            <MediaLink to={link} label={title}>
              <ProfileCover
                coverFileId={fileId(item.coverFileId)}
                title={title}
              />
            </MediaLink>
            <p className={styles.coverCaption}>
              {link ? <Link to={link}>{title}</Link> : <span>{title}</span>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Favorite quote — typographic and spacious.                          */
/* ------------------------------------------------------------------ */

function QuoteRenderer({ data }: ArtifactRendererProps) {
  const quote =
    data && typeof data.quote === "string" && data.quote.trim()
      ? data.quote.trim()
      : null;
  const source =
    data && typeof data.source === "string" && data.source.trim()
      ? data.source.trim()
      : null;
  if (!quote) return null;
  return (
    <blockquote className={styles.quote}>
      <p>“{quote}”</p>
      {source && <cite>— {source}</cite>}
    </blockquote>
  );
}

/* ------------------------------------------------------------------ */
/* Currently reading — a little stack with honest progress.            */
/* ------------------------------------------------------------------ */

function CurrentlyReadingRenderer({ data }: ArtifactRendererProps) {
  const items = asItems(data).slice(0, 4);
  if (items.length === 0) return null;
  return (
    <ol className={styles.readingStack}>
      {items.map((item, index) => {
        const title = str(item.title ?? item.workId, "Untitled");
        const link = href(item.href);
        const raw = item.progressPercent;
        const percent =
          typeof raw === "number" && raw >= 0 && raw <= 100 ? raw : null;
        return (
          <li
            key={`${str(item.workId, String(index))}`}
            className={styles.readingRow}
          >
            <span className={styles.readingCover}>
              <ProfileCover
                coverFileId={fileId(item.coverFileId)}
                title={title}
              />
            </span>
            <span className={styles.readingBody}>
              <span className={styles.readingTitle}>
                {link ? <Link to={link}>{title}</Link> : <span>{title}</span>}
              </span>
              {percent !== null ? (
                <span className={styles.progress}>
                  <span
                    className={styles.progressTrack}
                    role="progressbar"
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${title} — ${percent}% read`}
                  >
                    <span
                      className={styles.progressFill}
                      style={{ width: `${percent}%` }}
                    />
                  </span>
                  <span className={styles.progressLabel}>{percent}%</span>
                </span>
              ) : (
                <span className={styles.artifactMeta}>In progress</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Recent five-star — covers with an explicit star row.                */
/* ------------------------------------------------------------------ */

function FiveStarRenderer({ data }: ArtifactRendererProps) {
  const items = asItems(data).slice(0, 4);
  if (items.length === 0) return null;
  return (
    <ol className={styles.fiveStarGrid}>
      {items.map((item, index) => {
        const title = str(item.title, "Untitled");
        const link = href(item.href);
        const key = `${str(item.subjectId, String(index))}`;
        return (
          <li key={key} className={styles.fiveStarCell}>
            <MediaLink to={link} label={title}>
              <ProfileCover
                coverFileId={fileId(item.coverFileId)}
                title={title}
              />
            </MediaLink>
            <p className={styles.stars} aria-label="Rated five stars">
              ★★★★★
            </p>
            <p className={styles.coverCaption}>
              {link ? <Link to={link}>{title}</Link> : <span>{title}</span>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Favorite person — portrait and name first.                          */
/* ------------------------------------------------------------------ */

function FavoritePersonRenderer({ data }: ArtifactRendererProps) {
  const person = data && isRecord(data.person) ? data.person : null;
  if (!person) return null;
  const name = str(person.name, "Unknown");
  const link = href(person.href);
  const role = str(person.role, "");
  return (
    <div className={styles.personCard}>
      <MediaLink to={link} label={name}>
        <ProfilePortrait
          photoFileId={fileId(person.photoFileId)}
          name={name}
        />
      </MediaLink>
      <p className={styles.personName}>
        {link ? <Link to={link}>{name}</Link> : <span>{name}</span>}
      </p>
      {role && <p className={styles.artifactMeta}>{role}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shelf preview — a little shelf with a way out.                      */
/* ------------------------------------------------------------------ */

function ShelfRenderer({ data }: ArtifactRendererProps) {
  if (!data) return null;
  const shelf = isRecord(data.shelf) ? data.shelf : null;
  if (!shelf) return null;
  const name = str(shelf.name, "Shelf").trim() || "Shelf";
  const shelfId = str(shelf.id, "");
  const shelfHref = shelfId ? `/shelves/${shelfId}` : null;
  const items = asItems(data).slice(0, 6);
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className={styles.shelfTitle}>{name}</h3>
      <ol className={styles.coverRow}>
        {items.map((item, index) => {
          const title = str(item.title ?? item.subjectId, "Untitled");
          const link = href(item.href);
          return (
            <li
              key={`${str(item.subjectType, "item")}-${str(item.subjectId, String(index))}`}
              className={styles.coverCell}
            >
              <MediaLink to={link} label={title}>
                <ProfileCover
                  coverFileId={fileId(item.coverFileId)}
                  title={title}
                />
              </MediaLink>
            </li>
          );
        })}
      </ol>
      <p className={styles.shelfMetaRow}>
        <span>{items.length} items</span>
        {shelfHref && (
          <Link to={shelfHref} className={styles.shelfMoreLink}>
            View shelf →
          </Link>
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Club — badge/card, not a list row.                                  */
/* ------------------------------------------------------------------ */

function ClubRenderer({ data }: ArtifactRendererProps) {
  const clubs = Array.isArray(data?.clubs)
    ? (data?.clubs as Array<Record<string, unknown>>)
    : [];
  const visible = clubs.slice(0, 4);
  if (visible.length === 0) return null;
  return (
    <ol className={styles.clubGrid}>
      {visible.map((club) => {
        const name = str(club.name, "Club");
        const id = str(club.id, name);
        return (
          <li key={id} className={styles.clubBadge}>
            <Link to={`/clubs/${id}`} className={styles.clubMedallion} aria-hidden tabIndex={-1}>
              {name.trim().charAt(0).toUpperCase() || "C"}
            </Link>
            <Link to={`/clubs/${id}`} className={styles.clubName}>
              {name}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Recent activity — deliberately subordinate textual statements.      */
/* ------------------------------------------------------------------ */

const ACTIVITY_VERBS: Record<string, string> = {
  finished: "finished",
  completed: "finished",
  rated: "rated",
  reviewed: "reviewed",
  added: "added",
  joined: "joined",
  created: "started",
  progress: "made progress on",
};

function activityVerb(type: string): string {
  const lower = type.toLowerCase();
  for (const [key, verb] of Object.entries(ACTIVITY_VERBS)) {
    if (lower.includes(key)) return verb;
  }
  return lower.replace(/[_-]+/g, " ").trim() || "updated";
}

function ActivityRenderer({ data, owner }: ArtifactRendererProps) {
  const items = asItems(data).slice(0, 5);
  if (items.length === 0) return null;
  return (
    <ul className={styles.activityList}>
      {items.map((item) => {
        const id = str(item.id, String(Math.random()));
        const type = str(item.type, "updated");
        const subjectTitle = str(item.subjectTitle, "");
        const subjectLink = href(item.subjectHref);
        const when = str(item.createdAt, "");
        const date = when ? new Date(when) : null;
        const validDate = date && !Number.isNaN(date.getTime()) ? date : null;
        return (
          <li key={id} className={styles.activityStatement}>
            <UserIdentity
              user={{
                username: owner.username,
                displayName: owner.displayName,
              }}
              variant="handle"
            />{" "}
            <span>{activityVerb(type)}</span>{" "}
            {subjectTitle ? (
              subjectLink ? (
                <Link to={subjectLink} className={styles.activitySubject}>
                  {subjectTitle}
                </Link>
              ) : (
                <span className={styles.activitySubject}>{subjectTitle}</span>
              )
            ) : (
              <span className={styles.artifactMeta}>
                {str(item.subjectType, "something")}
              </span>
            )}
            {type.toLowerCase().includes("rat") && (
              <span className={styles.stars} aria-hidden>
                {" "}
                ★★★★★
              </span>
            )}
            {validDate && (
              <span className={styles.artifactMeta}>
                {" "}
                ·{" "}
                <time dateTime={validDate.toISOString()}>
                  {validDate.toLocaleDateString()}
                </time>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Stats — numbers, not a dashboard.                                   */
/* ------------------------------------------------------------------ */

function StatsRenderer({ data }: ArtifactRendererProps) {
  if (!data) return null;
  const favorites = typeof data.favorites === "number" ? data.favorites : 0;
  const ratings = typeof data.ratings === "number" ? data.ratings : 0;
  const shelves = typeof data.shelves === "number" ? data.shelves : 0;
  // All-zero stats communicate nothing; suppress the section entirely
  // rather than rendering an empty dashboard widget.
  if (favorites === 0 && ratings === 0 && shelves === 0) return null;
  const entries: Array<[string, number]> = [
    ["Favorites", favorites],
    ["Ratings", ratings],
    ["Shelves", shelves],
  ];
  return (
    <dl className={styles.statsRow}>
      {entries.map(([label, value]) => (
        <div key={label} className={styles.stat}>
          <dd>{value}</dd>
          <dt>{label}</dt>
        </div>
      ))}
    </dl>
  );
}

export interface ArtifactDefinition {
  type: ProfileArtifactType;
  label: string;
  allowedSizes: ProfileArtifactSize[];
  /**
   * Renderers are pure functions of props (no hooks) and are invoked
   * directly — not as JSX — so an empty artifact returns `null` and the
   * caller can suppress the whole section, heading included. An empty
   * artifact must consume zero grid space.
   */
  render: (props: ArtifactRendererProps) => ReactNode;
  configHint: string;
}

const shelfArtifact: ArtifactDefinition = {
  type: "shelf",
  label: "Shelf",
  allowedSizes: ["medium", "wide"],
  render: (props) => ShelfRenderer(props),
  configHint: "Optional shelfId; respects shelf visibility.",
};

export const ARTIFACT_REGISTRY: Record<ProfileArtifactType, ArtifactDefinition> = {
  obsessions: {
    type: "obsessions",
    label: "Currently obsessed with",
    allowedSizes: ["wide"],
    render: (props) => ObsessionsRenderer(props),
    configHint: "Shows pinned obsessions in order.",
  },
  favorites: {
    type: "favorites",
    label: "Favorites",
    allowedSizes: ["small", "medium"],
    render: (props) => FavoritesRenderer(props),
    configHint: "Optional limit, default 6.",
  },
  "favorite-quote": {
    type: "favorite-quote",
    label: "Favorite quote",
    allowedSizes: ["small", "medium"],
    render: (props) => QuoteRenderer(props),
    configHint: "Set quote and source in configuration.",
  },
  "currently-reading": {
    type: "currently-reading",
    label: "Currently reading",
    allowedSizes: ["medium", "wide"],
    render: (props) => CurrentlyReadingRenderer(props),
    configHint: "Derived from reading progress.",
  },
  "recent-five-star": {
    type: "recent-five-star",
    label: "Five-star",
    allowedSizes: ["small", "medium"],
    render: (props) => FiveStarRenderer(props),
    configHint: "Recent top ratings.",
  },
  "favorite-person": {
    type: "favorite-person",
    label: "Favorite person",
    allowedSizes: ["small", "medium"],
    render: (props) => FavoritePersonRenderer(props),
    configHint: "Optional personId in configuration.",
  },
  shelf: shelfArtifact,
  "shelf-preview": shelfArtifact,
  club: {
    type: "club",
    label: "Club",
    allowedSizes: ["small", "medium"],
    render: (props) => ClubRenderer(props),
    configHint: "Optional clubId; private clubs stay hidden.",
  },
  "recent-activity": {
    type: "recent-activity",
    label: "Recent activity",
    allowedSizes: ["medium", "wide"],
    render: (props) => ActivityRenderer(props),
    configHint: "Respects activity visibility.",
  },
  stats: {
    type: "stats",
    label: "Stats",
    allowedSizes: ["small", "medium"],
    render: (props) => StatsRenderer(props),
    configHint: "Counts only, no decorative dashboard.",
  },
};

export const ARTIFACT_TYPE_LIST = Object.values(ARTIFACT_REGISTRY);
