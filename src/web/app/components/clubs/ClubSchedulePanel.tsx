import { useCallback, useEffect, useState } from "react";
import type {
  ClubContext,
  ClubScheduleView,
  ClubWork,
} from "@shared/clubs";
import { api } from "../../api";
import { LoadingState } from "../../../components/states";
import { ClubScheduleForm } from "./ClubScheduleForm";
import { ClubScheduleList } from "./ClubScheduleList";
import { ClubWorkPicker } from "./ClubWorkPicker";
import { ClubCurrentWork } from "./ClubCurrentWork";

interface ClubSchedulePanelProps {
  clubId: string;
  context: ClubContext;
  canModerate: boolean;
  currentWork: import("@shared/clubs").ClubWorkSummary | null;
  showCurrentWork?: boolean;
}

export function ClubSchedulePanel({
  clubId,
  context,
  canModerate,
  currentWork,
  showCurrentWork = true,
}: ClubSchedulePanelProps) {
  const [view, setView] = useState<ClubScheduleView | null>(null);
  const [works, setWorks] = useState<ClubWork[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void Promise.all([
      api<{ data: ClubScheduleView }>(`/clubs/${clubId}/schedule`),
      api<{ data: ClubWork[] }>(`/clubs/${clubId}/works`),
    ])
      .then(([scheduleRes, worksRes]) => {
        setView(scheduleRes.data);
        setWorks(worksRes.data);
      })
      .finally(() => setLoading(false));
  }, [clubId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !view) return <LoadingState />;

  return (
    <div>
      {showCurrentWork && (
        <ClubCurrentWork
          clubId={clubId}
          context={context}
          currentWork={currentWork}
          works={works}
          canModerate={canModerate}
          onChanged={load}
        />
      )}
      {canModerate && (
        <>
          <ClubWorkPicker clubId={clubId} context={context} onAdded={load} />
          <ClubScheduleForm
            clubId={clubId}
            context={context}
            works={works}
            onCreated={load}
          />
        </>
      )}
      <ClubScheduleList clubId={clubId} view={view} />
    </div>
  );
}
