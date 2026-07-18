import type { DisplayTimestamp } from "@/lib/view-model/types";

import { ThemeSelector } from "./theme-selector";

const collectionLabels = {
  initializing: "準備中",
  healthy: "収集は正常です",
  degraded: "一部の収集に問題があります",
  stopped: "収集が停止しています",
} as const;

export interface DashboardHeaderProps {
  collectionState: keyof typeof collectionLabels;
  hasStatusError: boolean;
  isRefreshing: boolean;
  lastFullSuccessAt: DisplayTimestamp | null;
}

export function DashboardHeader({
  collectionState,
  hasStatusError,
  isRefreshing,
  lastFullSuccessAt,
}: DashboardHeaderProps) {
  const label = hasStatusError
    ? "収集状態を確認できません"
    : collectionLabels[collectionState];

  return (
    <header className="dashboard-header">
      <div className="brand-lockup">
        <span aria-hidden="true" className="brand-mark">
          <span />
        </span>
        <div>
          <p>AMBIENT LAPIS</p>
          <h1>部屋の空気に、静かな輪郭を。</h1>
        </div>
      </div>

      <div className="dashboard-header__status">
        <div className="collection-summary">
          <span
            aria-hidden="true"
            className={`collection-summary__dot collection-summary__dot--${hasStatusError ? "unknown" : collectionState}`}
          />
          <div>
            <span>{isRefreshing ? "表示を更新しています" : label}</span>
            <small>
              {lastFullSuccessAt ? (
                <>
                  最終完全成功{" "}
                  <time dateTime={lastFullSuccessAt.iso}>
                    {lastFullSuccessAt.label}
                  </time>
                </>
              ) : (
                "最終完全成功 --"
              )}
            </small>
          </div>
        </div>
        <ThemeSelector className="theme-selector" />
      </div>
    </header>
  );
}
