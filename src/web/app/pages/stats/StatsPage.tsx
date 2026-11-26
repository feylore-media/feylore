import { useCallback, useEffect, useState } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { useTranslation } from "react-i18next";
import {
  STATS_DOMAIN_META,
  STATS_MEDIA_TYPES,
  formatAvgRuntime,
  formatStatsDuration,
  isStatsMediaType,
  type StatsMediaType,
  type StatsResponse,
} from "@shared/stats";
import { api } from "../../api";
import { useAuth } from "../../auth-context";
import { ErrorState, LoadingState } from "../../../components/states";
import { Heatmap, MonthBars } from "./StatsCharts";
import { RangePicker } from "./RangePicker";
import styles from "./stats.module.css";

function coverUrl(coverFileId: string | null | undefined): string | null {
  if (!coverFileId) return null;
  return `/api/v1/files/${coverFileId}/content`;
}

function isEmpty(data: StatsResponse): boolean {
  return (
    data.headline.totalCompleted === 0 &&
    data.rating.count === 0 &&
    data.headline.readingSeconds === 0 &&
    data.headline.activeDays === 0
  );
}

export function StatsRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={`/users/${user.username}/stats`} replace />;
}

export function StatsPage() {
  const { t } = useTranslation("stats");
  const { username, domain } = useParams<{
    username: string;
    domain?: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const domainValid = !domain || isStatsMediaType(domain);
  const mediaType: StatsMediaType | null =
    domain && isStatsMediaType(domain) ? domain : null;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const load = useCallback(async () => {
    if (!username || !domainValid) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (fromParam) query.set("from", fromParam);
      if (toParam) query.set("to", toParam);
      const qs = query.toString();
      const res = await api<{ data: StatsResponse }>(
        `/profiles/${username}/stats${mediaType ? `/${mediaType}` : ""}${qs ? `?${qs}` : ""}`,
      );
      setData(res.data);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [username, domainValid, mediaType, fromParam, toParam, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyRange = useCallback(
    (from: string | null, to: string | null) => {
      setPickerOpen(false);
      const next = new URLSearchParams();
      if (from) next.set("from", from);
      if (to) next.set("to", to);
      const qs = next.toString();
      navigate(
        `/users/${username}/stats${mediaType ? `/${mediaType}` : ""}${qs ? `?${qs}` : ""}`,
      );
    },
    [navigate, username, mediaType],
  );

  if (!username) return null;

  if (!domainValid) {
    return (
      <div className={styles.page}>
        <p role="alert">{t("unknownDomain")}</p>
      </div>
    );
  }

  if (loading && !data) return <LoadingState />;
  if (error || !data) {
    return (
      <div className={styles.page}>
        <ErrorState message={error ?? t("loadFailed")} onRetry={() => void load()} />
      </div>
    );
  }

  const meta = mediaType ? STATS_DOMAIN_META[mediaType] : null;
  const heading = t("headingOwner", {
    name: data.profile.displayName,
    range: data.range.label,
  });
  const tabQuery = (() => {
    const q = new URLSearchParams();
    if (fromParam) q.set("from", fromParam);
    if (toParam) q.set("to", toParam);
    const s = q.toString();
    return s ? `?${s}` : "";
  })();

  const empty = isEmpty(data);
  const heatTotal = data.heatmap.reduce((sum, d) => sum + d.count, 0);
  const playsTotal = data.timeSeries.buckets.reduce((sum, b) => sum + b.plays, 0);
  const hasActivity = data.timeSeries.buckets.some(
    (b) => b.completed > 0 || b.sessions > 0 || b.plays > 0,
  );

  return (
    <div className={styles.page}>
      <div className={styles.masthead}>
        <h1 className={styles.heading}>
          <button
            type="button"
            className={styles.headingButton}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((v) => !v)}
          >
            {heading}
            {meta ? ` ${t("headingDomain", { domain: meta.plural })}` : null}
          </button>
        </h1>
        <RangePicker
          open={pickerOpen}
          initialFrom={data.range.from}
          initialTo={data.range.to}
          onApply={applyRange}
          onClose={() => setPickerOpen(false)}
        />
      </div>

      <nav aria-label={t("tabsLabel")} className={styles.tabs}>
        <Link
          to={`/users/${username}/stats${tabQuery}`}
          aria-current={!mediaType ? "page" : undefined}
        >
          {t("tabOverview")}
        </Link>
        {STATS_MEDIA_TYPES.map((mt) => (
          <Link
            key={mt}
            to={`/users/${username}/stats/${mt}${tabQuery}`}
            aria-current={mediaType === mt ? "page" : undefined}
          >
            {STATS_DOMAIN_META[mt].plural}
          </Link>
        ))}
      </nav>

      {empty ? (
        <div className={styles.empty}>
          <h2>{t(mediaType ? "emptyDomainTitle" : "emptyTitle")}</h2>
          <p>
            {mediaType
              ? t("emptyDomainDetail", { domain: meta!.plural })
              : t("emptyDetail")}
          </p>
        </div>
      ) : (
        <>
          <section aria-label={t("title")} className={styles.headline}>
            {mediaType && meta ? (
              <p className={styles.num}>
                {t("unitCount", {
                  count: data.headline.totalCompleted,
                  unit: meta.unit,
                })}
              </p>
            ) : (
              <p className={styles.num}>
                {[
                  t("totalFinished", {
                    count: data.headline.totalCompleted,
                  }),
                  ...data.headline.domainCounts.map((d) =>
                    t("domainFinished", {
                      count: d.count,
                      domain: STATS_DOMAIN_META[d.mediaType].plural,
                    }),
                  ),
                ].join(" · ")}
              </p>
            )}
            <p className={styles.headlineMeta}>
              {t("daysActive", { count: data.headline.activeDays })}
              {data.headline.readingSeconds > 0
                ? ` · ${t("readingTime", {
                    duration: formatStatsDuration(data.headline.readingSeconds),
                  })}`
                : null}
            </p>
            {mediaType && meta?.hasDuration && data.duration ? (
              <p className={styles.headlineMeta}>
                {data.duration.avgSeconds != null
                  ? `${t("runtimeAverage", {
                      duration: formatAvgRuntime(data.duration.avgSeconds),
                    })} · `
                  : null}
                {data.duration.totalSeconds != null
                  ? t("runtimeTotal", {
                      duration: formatStatsDuration(data.duration.totalSeconds),
                      domain: meta.singular.toLowerCase(),
                    })
                  : null}
              </p>
            ) : null}
          </section>

          {hasActivity ? (
            <section aria-label={t("sectionActivity")}>
              <h2>{t("sectionActivity")}</h2>
              <MonthBars
                buckets={data.timeSeries.buckets}
                ticks={data.timeSeries.ticks}
                summary={t("activitySummary", {
                  finished: data.headline.totalCompleted,
                  plays: playsTotal,
                })}
              />
              <p className={styles.legend}>
                <span className={styles.legendFinished}>{t("legendFinished")}</span>
                {" · "}
                <span className={styles.legendPlays}>{t("legendPlays")}</span>
                {data.headline.readingSeconds > 0
                  ? ` · ${t("readingObserved", {
                      duration: formatStatsDuration(data.headline.readingSeconds),
                    })}`
                  : null}
              </p>
            </section>
          ) : null}

          {data.rating.count > 0 ? (
            <section aria-label={t("sectionRatings")}>
              <h2>{t("sectionRatings")}</h2>
              <p className={styles.num}>
                {t("ratingsAverage", { avg: (data.rating.avg ?? 0).toFixed(1) })}
                {" · "}
                {t("ratingsCount", { count: data.rating.count })}
              </p>
              <ul className={styles.bars}>
                {data.rating.distribution.map((d) => (
                  <li key={d.value}>
                    <span className={styles.num}>
                      {t("ratingBucket", { count: d.count, value: d.value })}
                    </span>
                    <meter
                      min={0}
                      max={data.rating.count}
                      value={d.count}
                      aria-label={t("ratingBucket", {
                        count: d.count,
                        value: d.value,
                      })}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.genres.length > 0 ? (
            <section aria-label={t("sectionGenres")}>
              <h2>{t("sectionGenres")}</h2>
              <ul className={styles.bars}>
                {data.genres.map((g) => (
                  <li key={g.name}>
                    <span>{t("genreRow", { name: g.name, count: g.count })}</span>
                    <meter
                      min={0}
                      max={100}
                      value={g.share}
                      aria-label={`${g.name}: ${g.share}%`}
                    />
                    <span className={styles.num}>{g.share}%</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.creators.length > 0 ? (
            <section aria-label={t("sectionCreators")}>
              <h2>{t("sectionCreators")}</h2>
              <ul className={styles.list}>
                {data.creators.map((c) => (
                  <li key={`${c.role}:${c.name}`}>
                    <span>{c.name}</span>{" "}
                    <span className={styles.muted}>
                      {t("creatorRow", { role: c.role, count: c.count })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.releaseYears.length > 0 ? (
            <section aria-label={t("sectionReleaseYears")}>
              <h2>{t("sectionReleaseYears")}</h2>
              <ul className={styles.bars}>
                {data.releaseYears.map((y) => (
                  <li key={y.year}>
                    <span className={styles.num}>
                      {t("yearRow", { year: y.year, count: y.count })}
                    </span>
                    <meter
                      min={0}
                      max={Math.max(...data.releaseYears.map((r) => r.count))}
                      value={y.count}
                      aria-label={t("yearRow", { year: y.year, count: y.count })}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.highlights.length > 0 ? (
            <section aria-label={t("sectionHighlights")}>
              <h2>{t("sectionHighlights")}</h2>
              <ul className={styles.list}>
                {data.highlights.map((h) => {
                  const art = coverUrl(h.coverFileId);
                  const body = (
                    <>
                      {art ? (
                        <img
                          src={art}
                          alt=""
                          aria-hidden="true"
                          className={styles.highlightCover}
                        />
                      ) : null}
                      <span>{h.title}</span>{" "}
                      <span className={styles.muted + " " + styles.num}>
                        {t("highlightRating", {
                          rating: h.rating,
                          scale: h.ratingScale,
                        })}
                      </span>
                    </>
                  );
                  return (
                    <li key={`${h.subjectType}:${h.subjectId}`}>
                      {h.href ? <Link to={h.href}>{body}</Link> : body}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {heatTotal > 0 ? (
            <section aria-label={t("sectionHeatmap")}>
              <h2>{t("sectionHeatmap")}</h2>
              <Heatmap
                days={data.heatmap}
                dayLabel={(date, count) => t("heatmapDay", { date, count })}
                summary={t("heatmapSummary", {
                  count: heatTotal,
                  from: data.heatmap[0]?.day ?? "",
                  to: data.heatmap[data.heatmap.length - 1]?.day ?? "",
                })}
              />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
