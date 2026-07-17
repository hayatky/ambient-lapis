import type { ReactElement } from "react";

import type { DashboardViewModel } from "@/lib/view-model";
import { formatAge } from "@/lib/view-model/time";

import { StatusDot } from "./icons";
import { ThemeToggle } from "./theme-toggle";

const STATE_LABELS: Record<DashboardViewModel["collectionState"], string> = {
  initializing: "初回収集待ち",
  healthy: "収集正常",
  degraded: "一部取得失敗",
  stopped: "収集停止",
};

const STATE_COLORS: Record<DashboardViewModel["collectionState"], string> = {
  initializing: "text-[var(--text-secondary)]",
  healthy: "text-[var(--success)]",
  degraded: "text-[var(--warning)]",
  stopped: "text-[var(--danger)]",
};

interface DashboardHeaderProps {
  collectionState: DashboardViewModel["collectionState"] | null;
  lastFullSuccessAt: DashboardViewModel["lastFullSuccessAt"];
}

export function DashboardHeader({
  collectionState,
  lastFullSuccessAt,
}: DashboardHeaderProps): ReactElement {
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex flex-col gap-0.5">
        <p className="m-0 text-xl leading-tight font-semibold tracking-tight text-[var(--text-primary)]">
          Ambient Lapis
        </p>
        {collectionState === null ? (
          <p className="m-0 text-[0.8125rem] text-[var(--text-secondary)]">
            収集状態を取得できません
          </p>
        ) : (
          <p className="m-0 flex items-center gap-1.5 text-[0.8125rem] text-[var(--text-secondary)]">
            <StatusDot
              className={`shrink-0 ${STATE_COLORS[collectionState]}`}
            />
            {STATE_LABELS[collectionState]}
            {lastFullSuccessAt
              ? ` ・ 最終取得 ${formatAge(lastFullSuccessAt.ageSeconds)}`
              : ""}
          </p>
        )}
      </div>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
