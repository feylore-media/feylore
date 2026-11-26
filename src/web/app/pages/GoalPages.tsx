import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { GoalRecord, GoalRuleExpression } from "@shared/goals";
import type { GoalProgress } from "@shared/goal-evaluation";
import type { GoalCapability } from "@shared/goal-registry";
import { formatGoalPresentation } from "@shared/goal-presentation";
import { api } from "../api";
import { Button } from "../../components/primitives";
import { ErrorState, LoadingState } from "../../components/states";
import { GoalsChallengesTabs } from "./ChallengePages";
import styles from "./goals.module.css";

type GoalWithProgress = GoalRecord & { progress: GoalProgress };
type EvaluatedCandidate = {
  workType: string;
  workId: string;
  title: string;
  occurredAt: string;
  evaluation: {
    eligible: boolean;
    failures: Array<{ predicate: string; reason: string }>;
  };
};
type RuleField = {
  id: string;
  label: string;
  domains: readonly string[];
  operators: readonly string[];
};
type CapabilitiesResponse = {
  domains: string[];
  activities: string[];
  metrics: GoalCapability[];
  dimensions: GoalCapability[];
  operators: string[];
  combinations: Array<{ capabilityId: string; domain: string; activity: string }>;
  ruleFields: RuleField[];
};
type Condition = { field: string; operator: string; value: string };

type GoalMode = "read" | "listen" | "watch" | "tv" | "podcast" | "music" | "any";

function flattenConditions(rule: GoalRuleExpression | null): Condition[] {
  if (!rule) return [];
  if (rule.type === "predicate") {
    return [{ field: rule.field, operator: rule.operator, value: String(rule.value ?? "") }];
  }
  return rule.children.flatMap((child) => flattenConditions(child));
}

const MODE_DOMAINS: Record<GoalMode, string[]> = {
  read: ["books"],
  listen: ["audiobooks"],
  watch: ["movies"],
  tv: ["tv"],
  podcast: ["podcasts"],
  music: ["music"],
  any: ["books", "audiobooks", "movies", "tv", "podcasts", "music"],
};

function endOfDate(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function displayDate(value: string | null, fallback = "") {
  if (!value) return fallback;
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatGoalLanguage(goal: Pick<GoalRecord, "domains" | "metric" | "target">) {
  return formatGoalPresentation(goal);
}

function progressPercent(progress: GoalProgress) {
  return Math.max(0, Math.min(100, progress.percentage));
}

function lifecycle(goal: GoalRecord, progress: GoalProgress): "upcoming" | "active" | "completed" | "ended" {
  const now = Date.now();
  if (goal.startsAt && new Date(goal.startsAt).getTime() > now) return "upcoming";
  if (goal.endsAt && new Date(goal.endsAt).getTime() <= now) return progress.completed ? "completed" : "ended";
  return progress.completed ? "completed" : "active";
}

const previewPercent = progressPercent;

export function GoalsPage() {
  const { t } = useTranslation("goals");
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ data: GoalWithProgress[] }>("/goals?include=progress")
      .then((response) => setGoals(response.data))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const active = goals.filter((goal) => ["active", "completed"].includes(lifecycle(goal, goal.progress)));
  const upcoming = goals.filter((goal) => lifecycle(goal, goal.progress) === "upcoming");
  const ended = goals.filter((goal) => lifecycle(goal, goal.progress) === "ended");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t("title")}</p>
          <h1>{t("title")}</h1>
          <p className={styles.lead}>{t("progressCalculated")}</p>
        </div>
        <Link to="/goals/new"><Button variant="primary">{t("newGoal")}</Button></Link>
      </header>

      <GoalsChallengesTabs active="goals" />

      {goals.length === 0 && (
        <section className={styles.section}>
          <h2>{t("emptyTitle")}</h2>
          <p className={styles.lead}>{t("emptyDetail")}</p>
        </section>
      )}

      {active.length > 0 && (
        <GoalSection title={t("active")} goals={active} />
      )}
      {upcoming.length > 0 && (
        <GoalSection title={t("upcoming")} goals={upcoming} />
      )}
      {ended.length > 0 && (
        <GoalSection title={t("ended")} goals={ended} />
      )}
    </div>
  );
}

function GoalSection({
  title,
  goals,
}: {
  title: string;
  goals: GoalWithProgress[];
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.grid}>
        {goals.map((goal) => (
          <Link className={styles.card} to={`/goals/${goal.id}`} key={goal.id}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>{goal.title}</h3>
              <span className={styles.percent}>{lifecycle(goal, goal.progress)}</span>
            </div>
            <p className={styles.cardMeta}>{formatGoalLanguage(goal)}</p>
            <div className={styles.progressTrack} aria-label={`${goal.progress.current} of ${goal.progress.target}`}>
              <div className={styles.progressFill} style={{ width: `${progressPercent(goal.progress)}%` }} />
            </div>
            <div className={styles.progressMeta}>
              <span>{goal.progress.current} / {goal.progress.target}</span>
              <span>{displayDate(goal.startsAt)}{goal.endsAt ? ` – ${displayDate(goal.endsAt)}` : ""}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function GoalBuilderPage() {
  const { t } = useTranslation("goals");
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const editing = Boolean(id);
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(null);
  const [existingGoal, setExistingGoal] = useState<GoalRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<GoalMode>("read");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState(25);
  const [startsAt, setStartsAt] = useState("2027-01-01");
  const [endsAt, setEndsAt] = useState("2027-12-31");
  const [groupOperator, setGroupOperator] = useState<"and" | "or">("and");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [preview, setPreview] = useState<GoalProgress | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const requests: [Promise<{ data: CapabilitiesResponse }>, Promise<{ data: GoalRecord }> | null] = [
      api<{ data: CapabilitiesResponse }>("/goals/capabilities"),
      id ? api<{ data: GoalRecord }>(`/goals/${id}`) : null,
    ];
    void Promise.all(requests)
      .then(([capabilityResponse, goalResponse]) => {
        setCapabilities(capabilityResponse.data);
        if (goalResponse) setExistingGoal(goalResponse.data);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!existingGoal) return;
    setTitle(existingGoal.title);
    setTarget(existingGoal.target);
    setStartsAt(existingGoal.startsAt?.slice(0, 10) ?? "");
    setEndsAt(existingGoal.endsAt ? new Date(new Date(existingGoal.endsAt).getTime() - 86400000).toISOString().slice(0, 10) : "");
    setConditions(flattenConditions(existingGoal.rule));
    if (existingGoal.domains.includes("movies")) setMode("watch");
    else if (existingGoal.domains.includes("tv")) setMode("tv");
    else if (existingGoal.domains.includes("podcasts")) setMode("podcast");
    else if (existingGoal.domains.includes("music")) setMode("music");
    else if (existingGoal.domains.includes("audiobooks") && existingGoal.domains.includes("books")) setMode("any");
    else if (existingGoal.domains.includes("audiobooks")) setMode("listen");
    else setMode("read");
  }, [existingGoal]);

  const domains = MODE_DOMAINS[mode];
  const fields = useMemo(
    () => capabilities?.ruleFields.filter((field) =>
      field.domains.some((domain) => domain === "global" || domains.includes(domain)),
    ) ?? [],
    [capabilities, domains],
  );
  const worksMetric = capabilities?.metrics.find(
    (metric) => metric.id === "works" && domains.some((domain) => metric.supportedDomains.includes(domain as never)),
  );
  const selectedMetric = mode === "tv" || mode === "podcast"
    ? "episodes"
    : mode === "music"
      ? "albums"
      : worksMetric?.id ?? "works";

  useEffect(() => {
    if (!capabilities) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const rule: GoalRuleExpression | undefined = conditions.length > 0
        ? {
            type: "group",
            operator: groupOperator,
            children: conditions.map((condition) => ({
              type: "predicate",
              field: condition.field,
              operator: condition.operator,
              value: condition.value,
            })),
          }
        : undefined;
      setPreviewLoading(true);
      void api<{ data: GoalProgress }>("/goals/preview", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim() || t("title"),
          metric: selectedMetric,
          aggregation: { kind: "count" },
          target: Math.max(1, target),
          activity: "finish",
          basis: "completed",
          startsAt: startsAt ? new Date(`${startsAt}T00:00:00.000Z`).toISOString() : undefined,
          endsAt: endOfDate(endsAt),
          domains,
          rule,
        }),
      })
        .then((response) => {
          if (!cancelled) setPreview(response.data);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [capabilities, conditions, domains, endsAt, groupOperator, selectedMetric, startsAt, t, target, title]);

  function addCondition() {
    const field = fields[0];
    if (!field) return;
    setConditions((current) => [
      ...current,
      { field: field.id, operator: field.operators[0] ?? "eq", value: "" },
    ]);
  }

  function updateCondition(index: number, patch: Partial<Condition>) {
    setConditions((current) => current.map((condition, i) => i === index ? { ...condition, ...patch } : condition));
  }

  function removeCondition(index: number) {
    setConditions((current) => current.filter((_, i) => i !== index));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!capabilities) return;
    setSaving(true);
    setError(null);
    const rule: GoalRuleExpression | undefined = conditions.length > 0
      ? {
          type: "group",
          operator: groupOperator,
          children: conditions.map((condition) => ({
            type: "predicate",
            field: condition.field,
            operator: condition.operator,
            value: condition.value,
          })),
        }
      : undefined;
    try {
      const response = await api<{ data: GoalRecord }>(editing ? `/goals/${id}` : "/goals", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          title: title.trim() || `${t("title")} ${new Date().getFullYear()}`,
          metric: selectedMetric,
          aggregation: { kind: "count" },
          target,
          activity: "finish",
          basis: "completed",
          startsAt: startsAt ? new Date(`${startsAt}T00:00:00.000Z`).toISOString() : undefined,
          endsAt: endOfDate(endsAt),
          domains,
          rule,
        }),
      });
      void navigate(`/goals/${response.data.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("loadError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error && !capabilities) return <ErrorState message={error} />;

  return (
    <div className={`${styles.page} ${styles.builder}`}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t("title")}</p>
          <h1>{editing ? "Edit goal" : t("createTitle")}</h1>
          {editing && <p className={styles.helper}>Changing this goal may change which past activity counts toward it.</p>}
        </div>
        <Link to="/goals"><Button>{t("cancel")}</Button></Link>
      </header>
      <form onSubmit={save}>
        <section className={styles.builderSection}>
          <h2>{t("whatDo")}</h2>
          <div className={styles.choiceGrid}>
            {(["read", "listen", "watch", "tv", "podcast", "music", "any"] as GoalMode[]).map((item) => (
              <button
                className={mode === item ? styles.choiceSelected : styles.choice}
                key={item}
                type="button"
                onClick={() => setMode(item)}
              >
                {t(item === "any" ? "anyMedia" : item)}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.builderSection}>
          <div className={styles.fieldRow}>
            <label htmlFor="goal-title">{t("title")}</label>
            <input className={styles.input} id="goal-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${t("title")} ${new Date().getFullYear()}`} />
          </div>
          <div className={styles.fieldRow}>
            <label htmlFor="goal-target">I want to {t("finish")}</label>
            <input className={styles.input} id="goal-target" type="number" min="1" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
            <span>{mode === "watch" ? "movies" : mode === "listen" ? "audiobooks" : mode === "tv" || mode === "podcast" ? "episodes" : mode === "music" ? "albums" : mode === "any" ? "items" : "books"}</span>
          </div>
          <p className={styles.helper}>{formatGoalLanguage({ domains, metric: selectedMetric as GoalRecord["metric"], target })}</p>
        </section>

        <section className={styles.builderSection}>
          <div className={styles.fieldRow}>
            <label htmlFor="goal-start">{t("from")}</label>
            <input className={styles.input} id="goal-start" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            <label htmlFor="goal-end">{t("to")}</label>
            <input className={styles.input} id="goal-end" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </section>

        <section className={styles.builderSection}>
          <h2>{t("conditions")}</h2>
          {conditions.length > 0 && (
            <div className={styles.fieldRow}>
              <label htmlFor="group-operator">{groupOperator === "and" ? t("matchAll") : t("matchAny")}</label>
              <select className={styles.select} id="group-operator" value={groupOperator} onChange={(e) => setGroupOperator(e.target.value as "and" | "or")}>
                <option value="and">{t("matchAll")}</option>
                <option value="or">{t("matchAny")}</option>
              </select>
            </div>
          )}
          <div className={styles.conditions}>
            {conditions.map((condition, index) => {
              const field = fields.find((candidate) => candidate.id === condition.field) ?? fields[0];
              return (
                <div className={styles.conditionRow} key={`${condition.field}-${index}`}>
                  <select className={styles.select} aria-label={t("conditionField")} value={condition.field} onChange={(e) => updateCondition(index, { field: e.target.value })}>
                    {fields.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
                  </select>
                  <select className={styles.select} aria-label={t("conditionOperator")} value={condition.operator} onChange={(e) => updateCondition(index, { operator: e.target.value })}>
                    {(field?.operators ?? capabilities?.operators ?? []).map((operator) => <option key={operator} value={operator}>{t(`operator${operator[0]?.toUpperCase()}${operator.slice(1)}`)}</option>)}
                  </select>
                  <input className={styles.input} aria-label={t("conditionValue")} value={condition.value} onChange={(e) => updateCondition(index, { value: e.target.value })} placeholder={t("conditionValue")} />
                  <button className={styles.remove} type="button" onClick={() => removeCondition(index)} aria-label="Remove condition">×</button>
                </div>
              );
            })}
          </div>
          <button className={styles.addButton} type="button" onClick={addCondition}>+ {t("addCondition")}</button>
        </section>

        <section className={styles.builderSection}>
          <h2>{t("preview")}</h2>
          {previewLoading && <p className={styles.helper}>{t("previewLoading")}</p>}
          {preview && !previewLoading && (
            <>
              <div className={styles.progressMeta}>
                <strong>{preview.current} / {preview.target}</strong>
                <span>{preview.percentage}%</span>
              </div>
              <div className={styles.progressTrack} aria-label={`${preview.percentage}%`}>
                <div className={styles.progressFill} style={{ width: `${previewPercent(preview)}%` }} />
              </div>
              <p className={styles.helper}>{t("qualifyingItems", { count: preview.qualifyingItems })}</p>
              {preview.missingContributionData > 0 && <p className={styles.helper}>{t("missingItems", { count: preview.missingContributionData })}</p>}
            </>
          )}
          {!preview && !previewLoading && <p className={styles.helper}>{t("previewUnavailable")}</p>}
        </section>

        {error && <p role="alert" className={styles.helper}>{error}</p>}
        <div className={styles.builderActions}>
          <Link to="/goals"><Button type="button">{t("cancel")}</Button></Link>
          <Button variant="primary" type="submit" disabled={saving}>{saving ? t("loading") : editing ? "Save changes" : t("saveGoal")}</Button>
        </div>
      </form>
    </div>
  );
}

export function GoalDetailPage() {
  const { t } = useTranslation("goals");
  const { id } = useParams<{ id: string }>();
  const [goal, setGoal] = useState<GoalRecord | null>(null);
  const [progress, setProgress] = useState<GoalProgress | null>(null);
  const [candidates, setCandidates] = useState<EvaluatedCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void Promise.all([
      api<{ data: GoalRecord }>(`/goals/${id}`),
      api<{ data: GoalProgress }>(`/goals/${id}/progress`),
      api<{ data: EvaluatedCandidate[] }>(`/goals/${id}/candidates`),
    ])
      .then(([goalResponse, progressResponse, candidatesResponse]) => {
        setGoal(goalResponse.data);
        setProgress(progressResponse.data);
        setCandidates(candidatesResponse.data);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [id]);

  if (error) return <ErrorState message={error} />;
  if (!goal || !progress) return <LoadingState />;

  return (
    <div className={`${styles.page} ${styles.detail}`}>
      <Link to="/goals">{t("backToGoals")}</Link>
      <header className={styles.detailHeader}>
        <p className={styles.eyebrow}>{t("title")}</p>
        <h1>{goal.title}</h1>
        <p className={styles.lead}>{formatGoalLanguage(goal)}</p>
        <p className={styles.detailMeta}>{displayDate(goal.startsAt)}{goal.endsAt ? ` – ${displayDate(goal.endsAt)}` : ""}</p>
        <p className={styles.detailMeta}>{lifecycle(goal, progress)} · {progress.current} / {progress.target}</p>
        <Link to={`/goals/${goal.id}/edit`}><Button>{t("editGoal")}</Button></Link>
      </header>
      <section className={styles.detailProgress}>
        <div>
          <div className={styles.bigProgress}>{progress.current} <span className={styles.detailMeta}>of {progress.target}</span></div>
          <div className={styles.progressTrack} aria-label={`${progress.percentage}%`}><div className={styles.progressFill} style={{ width: `${progressPercent(progress)}%` }} /></div>
          <p className={styles.detailMeta}>{progress.qualifyingItems} qualifying items · {progress.contributingItems} contributing</p>
          {progress.missingContributionData > 0 && <p className={styles.detailMeta}>{progress.missingContributionData} items are missing contribution data.</p>}
          <div className={styles.milestones}>
            {[25, 50, 75, 100].map((milestone) => (
              <span className={progress.percentage >= milestone ? styles.milestoneReached : styles.milestone} key={milestone}>{milestone}%</span>
            ))}
          </div>
        </div>
        <div className={styles.percent}>{progress.percentage}%</div>
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("countsWhen")}</h2>
        <ul className={styles.ruleList}>
          <li className={styles.ruleItem}>{goal.domains.length ? goal.domains.join(" · ") : t("anyMedia")}</li>
          <li className={styles.ruleItem}>{goal.basis === "completed" ? "Finished during the goal period" : "Activity during the goal period"}</li>
          {goal.rule ? <RuleSummary expression={goal.rule} /> : <li className={styles.ruleItem}>{t("noConditions")}</li>}
        </ul>
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("recentlyCounted")}</h2>
        {candidates.filter((candidate) => candidate.evaluation.eligible).length > 0 ? (
          <ul className={styles.ruleList}>
            {candidates
              .filter((candidate) => candidate.evaluation.eligible)
              .slice(0, 8)
              .map((candidate) => (
                <li className={styles.ruleItem} key={`${candidate.workType}:${candidate.workId}`}>
                  <strong>{candidate.title}</strong>
                  <span className={styles.detailMeta}> · {displayDate(candidate.occurredAt)}</span>
                </li>
              ))}
          </ul>
        ) : (
          <p className={styles.helper}>{t("emptyTitle")}</p>
        )}
      </section>
      {candidates.some((candidate) => !candidate.evaluation.eligible) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("whyNot")}</h2>
          <ul className={styles.ruleList}>
            {candidates
              .filter((candidate) => !candidate.evaluation.eligible)
              .slice(0, 8)
              .map((candidate) => (
                <li className={styles.ruleItem} key={`${candidate.workType}:${candidate.workId}`}>
                  <strong>{candidate.title}</strong>
                  {candidate.evaluation.failures.map((failure) => (
                    <div className={styles.detailMeta} key={`${candidate.workId}:${failure.predicate}`}>
                      — {failure.reason}
                    </div>
                  ))}
                </li>
              ))}
          </ul>
        </section>
      )}
      <p className={styles.helper}>{t("progressCalculated")}</p>
    </div>
  );
}

function RuleSummary({ expression }: { expression: GoalRuleExpression }): ReactNode {
  if (expression.type === "predicate") {
    return <li className={styles.ruleItem}>{expression.field} {expression.operator} {String(expression.value ?? "")}</li>;
  }
  return (
    <li className={styles.ruleItem}>
      {expression.operator === "and" ? "All of these" : "Any of these"}
      <ul className={styles.ruleList}>{expression.children.map((child, index) => <RuleSummary expression={child} key={index} />)}</ul>
    </li>
  );
}
