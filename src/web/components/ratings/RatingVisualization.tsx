import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BookReview,
  GenreRatingDefinition,
  RatingDimension,
  TrajectoryPoint,
} from "@shared/ratings";
import styles from "./rating-visualization.module.css";

type View =
  | {
      key: "core";
      label: string;
      title: string;
      dimensions: RatingDimension[];
      values: Record<string, number>;
    }
  | {
      key: "genre";
      label: string;
      title: string;
      dimensions: RatingDimension[];
      values: Record<string, number>;
    }
  | {
      key: "trajectory";
      label: string;
      title: string;
      points: TrajectoryPoint[];
    };

export interface RatingVisualizationProps {
  review: Pick<BookReview, "coreValues" | "genreValues" | "trajectory">;
  coreDimensions: RatingDimension[];
  genreDefinitions: GenreRatingDefinition[];
  scale: number;
  variant?: "full" | "compact";
}

export function RatingVisualization({
  review,
  coreDimensions,
  genreDefinitions,
  scale,
  variant = "full",
}: RatingVisualizationProps) {
  const { t } = useTranslation("books");
  const views = useMemo<View[]>(() => {
    const available: View[] = [];
    const core = coreDimensions.filter(
      (dimension) =>
        dimension.enabled && review.coreValues[dimension.key] != null,
    );
    if (core.length) {
      available.push({
        key: "core",
        label: t("ratingVisualizationCore"),
        title: t("ratingVisualizationCore").toUpperCase(),
        dimensions: coreDimensions.filter((dimension) => dimension.enabled),
        values: review.coreValues,
      });
    }

    const genre = genreDefinitions.find((definition) => {
      const values = review.genreValues[definition.genreTermId];
      return definition.enabled && values && Object.keys(values).length > 0;
    });
    if (genre) {
      const genreLabel = genre.selectedGenreName ?? genre.genreName;
      available.push({
        key: "genre",
        label: genreLabel,
        title: genreLabel.toUpperCase(),
        dimensions: genre.dimensions.filter((dimension) => dimension.enabled),
        values: review.genreValues[genre.genreTermId] ?? {},
      });
    }

    if (review.trajectory.length) {
      available.push({
        key: "trajectory",
        label: t("ratingVisualizationTrajectory"),
        title: t("ratingVisualizationTrajectory").toUpperCase(),
        points: review.trajectory,
      });
    }
    return available;
  }, [coreDimensions, genreDefinitions, review, t]);
  const [activeKey, setActiveKey] = useState<View["key"]>(
    views[0]?.key ?? "core",
  );
  const touchStart = useRef<number | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!views.some((view) => view.key === activeKey)) {
      setActiveKey(views[0]?.key ?? "core");
    }
  }, [activeKey, views]);

  if (!views.length) return null;
  const activeIndex = Math.max(
    0,
    views.findIndex((view) => view.key === activeKey),
  );
  const active = views[activeIndex]!;
  const advance = (offset = 1) => {
    if (views.length < 2) return;
    setActiveKey(
      views[(activeIndex + offset + views.length) % views.length]!.key,
    );
  };

  return (
    <div className={`${styles.root} ${styles[variant]}`}>
      <div
        id={panelId}
        className={styles.stage}
        role={views.length > 1 ? "button" : undefined}
        tabIndex={views.length > 1 ? 0 : undefined}
        aria-label={
          views.length > 1
            ? t("ratingVisualizationAdvance", { view: active.label })
            : undefined
        }
        onClick={() => advance()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            advance();
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            advance();
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            advance(-1);
          }
        }}
        onTouchStart={(event) => {
          touchStart.current = event.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const end = event.changedTouches[0]?.clientX;
          if (touchStart.current == null || end == null) return;
          const distance = end - touchStart.current;
          touchStart.current = null;
          if (Math.abs(distance) >= 44) advance(distance < 0 ? 1 : -1);
        }}
      >
        <div className={styles.view} key={active.key}>
          {active.key === "trajectory" ? (
            <RatingTrajectoryChart
              points={active.points}
              scale={scale}
              title={active.title}
            />
          ) : (
            <RatingRadar
              dimensions={active.dimensions}
              values={active.values}
              scale={scale}
              title={active.title}
            />
          )}
        </div>
      </div>
      {views.length > 1 && (
        <div
          className={styles.switcher}
          role="tablist"
          aria-label={t("ratingVisualizationViews")}
        >
          {views.map((view) => (
            <button
              key={view.key}
              type="button"
              role="tab"
              aria-selected={view.key === active.key}
              aria-controls={panelId}
              onClick={() => setActiveKey(view.key)}
            >
              <span aria-hidden="true">
                {view.key === active.key ? "●" : "○"}
              </span>
              {view.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function average(
  dimensions: RatingDimension[],
  values: Record<string, number>,
) {
  const rated = dimensions
    .map((dimension) => ({
      value: values[dimension.key],
      weight: dimension.weight || 1,
    }))
    .filter(
      (entry): entry is { value: number; weight: number } =>
        entry.value != null,
    );
  if (!rated.length) return null;
  return (
    rated.reduce((sum, entry) => sum + entry.value * entry.weight, 0) /
    rated.reduce((sum, entry) => sum + entry.weight, 0)
  );
}

function polar(index: number, count: number, radius: number) {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  return {
    x: 150 + Math.cos(angle) * radius,
    y: 150 + Math.sin(angle) * radius,
  };
}

export function RatingRadar({
  dimensions,
  values,
  scale,
  title,
}: {
  dimensions: RatingDimension[];
  values: Record<string, number>;
  scale: number;
  title: string;
}) {
  const { t } = useTranslation("books");
  const count = Math.max(dimensions.length, 3);
  const score = average(dimensions, values);
  const allRated =
    dimensions.length >= 3 &&
    dimensions.every((dimension) => values[dimension.key] != null);
  const ratedPoints = dimensions.flatMap((dimension, index) => {
    const value = values[dimension.key];
    return value == null
      ? []
      : [{ ...polar(index, count, 32 + (value / scale) * 70), index }];
  });
  const polygon = ratedPoints.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <svg
      className={styles.chart}
      viewBox="0 0 300 300"
      role="img"
      aria-label={t("ratingRadarLabel", { title, score: score?.toFixed(1) })}
    >
      {[0.25, 0.5, 0.75, 1].map((level) => (
        <polygon
          key={level}
          className={styles.grid}
          points={Array.from({ length: count }, (_, index) => {
            const point = polar(index, count, 102 * level);
            return `${point.x},${point.y}`;
          }).join(" ")}
        />
      ))}
      {dimensions.map((dimension, index) => {
        const edge = polar(index, count, 102);
        const label = polar(index, count, 128);
        const value = values[dimension.key];
        const point =
          value == null ? null : polar(index, count, 32 + (value / scale) * 70);
        return (
          <g key={dimension.key}>
            <line
              className={styles.spoke}
              x1="150"
              y1="150"
              x2={edge.x}
              y2={edge.y}
            />
            <text
              className={styles.axisText}
              x={label.x}
              y={label.y}
              textAnchor={
                label.x < 135 ? "end" : label.x > 165 ? "start" : "middle"
              }
              dominantBaseline="middle"
            >
              {dimension.name}
            </text>
            {point ? (
              <circle
                className={styles.dataPoint}
                cx={point.x}
                cy={point.y}
                r="4"
              />
            ) : (
              <circle
                className={styles.missingPoint}
                cx={edge.x}
                cy={edge.y}
                r="3"
              />
            )}
          </g>
        );
      })}
      {ratedPoints.length >= 2 && (
        <polyline
          className={`${styles.dataShape} ${!allRated ? styles.partialShape : ""}`}
          points={allRated ? `${polygon} ${polygon.split(" ")[0]}` : polygon}
        />
      )}
      <text className={styles.centerTitle} x="150" y="143" textAnchor="middle">
        {title}
      </text>
      {score != null && (
        <text
          className={styles.centerScore}
          x="150"
          y="166"
          textAnchor="middle"
        >
          {score.toFixed(1)}
        </text>
      )}
    </svg>
  );
}

function trajectoryDirection(points: TrajectoryPoint[]) {
  if (points.length < 2) return null;
  const delta = points.at(-1)!.rating - points[0]!.rating;
  if (Math.abs(delta) < 0.5) return "steady";
  const signs = points
    .slice(1)
    .map((point, index) => Math.sign(point.rating - points[index]!.rating));
  const nonZero = signs.filter(Boolean);
  if (new Set(nonZero).size > 1) return "mixed";
  return delta > 0 ? "improved" : "declined";
}

export function RatingTrajectoryChart({
  points,
  scale,
  title,
}: {
  points: TrajectoryPoint[];
  scale: number;
  title: string;
}) {
  const { t } = useTranslation("books");
  const sorted = [...points].sort((a, b) => a.progress - b.progress);
  const x = (progress: number) => 42 + (progress / 100) * 224;
  const y = (rating: number) =>
    238 - ((rating - 1) / Math.max(1, scale - 1)) * 166;
  const direction = trajectoryDirection(sorted);
  return (
    <svg
      className={styles.chart}
      viewBox="0 0 300 300"
      role="img"
      aria-label={t("ratingTrajectoryLabel", { count: points.length })}
    >
      <text
        className={styles.trajectoryTitle}
        x="150"
        y="29"
        textAnchor="middle"
      >
        {title}
      </text>
      {Array.from({ length: scale }, (_, index) => index + 1).map((rating) => (
        <g key={rating}>
          <line
            className={styles.gridLine}
            x1="42"
            y1={y(rating)}
            x2="266"
            y2={y(rating)}
          />
          <text
            className={styles.tickText}
            x="32"
            y={y(rating)}
            textAnchor="end"
            dominantBaseline="middle"
          >
            {rating}
          </text>
        </g>
      ))}
      {[25, 50, 75, 100].map((progress) => (
        <g key={progress}>
          <line
            className={styles.tick}
            x1={x(progress)}
            y1="238"
            x2={x(progress)}
            y2="243"
          />
          <text
            className={styles.tickText}
            x={x(progress)}
            y="258"
            textAnchor="middle"
          >
            {progress}%
          </text>
        </g>
      ))}
      <line className={styles.axis} x1="42" y1="238" x2="266" y2="238" />
      {sorted.length > 1 && (
        <polyline
          className={styles.trajectoryLine}
          points={sorted
            .map((point) => `${x(point.progress)},${y(point.rating)}`)
            .join(" ")}
        />
      )}
      {sorted.map((point) => (
        <circle
          key={point.progress}
          className={styles.dataPoint}
          cx={x(point.progress)}
          cy={y(point.rating)}
          r="5"
        />
      ))}
      {direction && (
        <text className={styles.direction} x="150" y="287" textAnchor="middle">
          {t(
            `ratingTrajectory${direction[0]!.toUpperCase()}${direction.slice(1)}`,
          )}
        </text>
      )}
    </svg>
  );
}
