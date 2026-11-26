import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ClubContext, ClubWork, ClubWorkSummary } from "@shared/clubs";
import { Button } from "../../../components/primitives";

interface ClubCurrentWorkProps {
  clubId: string;
  context: ClubContext;
  currentWork: ClubWorkSummary | null;
  works: ClubWork[];
  canModerate: boolean;
  onChanged: () => void;
}

export function ClubCurrentWork({
  clubId,
  context,
  currentWork,
  works,
  canModerate,
  onChanged,
}: ClubCurrentWorkProps) {
  const { t } = useTranslation("clubs");

  if (context !== "book" && context !== "video" && !currentWork) {
    return null;
  }

  return (
    <section style={{ marginBottom: "var(--space-4)" }}>
      <h2 style={{ fontSize: "1rem", marginBottom: "var(--space-2)" }}>
        {t("currentWork")}
      </h2>
      {currentWork ? (
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            alignItems: "flex-start",
          }}
        >
          {currentWork.coverFileId && (
            <img
              src={`/api/v1/files/${currentWork.coverFileId}/content`}
              alt=""
              style={{ width: "4rem", height: "auto" }}
            />
          )}
          <div>
            <Link to={currentWork.href}>{currentWork.title}</Link>
            {canModerate && (
              <p style={{ marginTop: "var(--space-2)" }}>
                <Button
                  type="button"
                  onClick={() =>
                    void completeWork(clubId, currentWork.id, onChanged)
                  }
                >
                  {t("markWorkCompleted")}
                </Button>
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="muted">{t("noCurrentWork")}</p>
      )}
      {canModerate && works.length > 1 && (
        <ul style={{ marginTop: "var(--space-3)", paddingLeft: "1.25rem" }}>
          {works
            .filter((w) => w.status !== "current")
            .map((work) => (
              <li key={work.id}>
                {work.title}{" "}
                <Button
                  type="button"
                  onClick={() =>
                    void setCurrentWork(clubId, work.id, onChanged)
                  }
                >
                  {t("setAsCurrent")}
                </Button>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

async function setCurrentWork(
  clubId: string,
  workId: string,
  onChanged: () => void,
) {
  const { api } = await import("../../api");
  await api(`/clubs/${clubId}/works/${workId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "current" }),
  });
  onChanged();
}

async function completeWork(
  clubId: string,
  workId: string,
  onChanged: () => void,
) {
  const { api } = await import("../../api");
  await api(`/clubs/${clubId}/works/${workId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed" }),
  });
  onChanged();
}
