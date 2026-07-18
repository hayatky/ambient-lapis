import type { HistoryPreset } from "@/lib/dashboard";

export interface CustomDateValue {
  fromDate: string;
  toDate: string;
}

export interface PeriodSelectorProps {
  customDates: CustomDateValue;
  error: string | null;
  isLoading: boolean;
  maxDate: string;
  onCustomDatesChange: (value: CustomDateValue) => void;
  onCustomSubmit: () => void;
  onPresetChange: (preset: HistoryPreset) => void;
  selected: HistoryPreset;
}

const presets: ReadonlyArray<{ value: HistoryPreset; label: string }> = [
  { value: "24h", label: "24時間" },
  { value: "7d", label: "7日" },
  { value: "30d", label: "30日" },
  { value: "custom", label: "任意" },
];

export function PeriodSelector({
  customDates,
  error,
  isLoading,
  maxDate,
  onCustomDatesChange,
  onCustomSubmit,
  onPresetChange,
  selected,
}: PeriodSelectorProps) {
  return (
    <div className="period-control">
      <fieldset className="period-selector">
        <legend className="sr-only">表示期間</legend>
        {presets.map((preset) => (
          <label key={preset.value}>
            <input
              checked={selected === preset.value}
              name="history-period"
              onChange={() => onPresetChange(preset.value)}
              type="radio"
              value={preset.value}
            />
            <span>{preset.label}</span>
          </label>
        ))}
      </fieldset>

      {selected === "custom" ? (
        <div className="custom-range" role="group" aria-label="任意期間">
          <label>
            <span>開始日</span>
            <input
              max={maxDate}
              onChange={(event) =>
                onCustomDatesChange({
                  ...customDates,
                  fromDate: event.currentTarget.value,
                })
              }
              type="date"
              value={customDates.fromDate}
            />
          </label>
          <span aria-hidden="true" className="custom-range__separator">
            —
          </span>
          <label>
            <span>終了日</span>
            <input
              max={maxDate}
              min={customDates.fromDate || undefined}
              onChange={(event) =>
                onCustomDatesChange({
                  ...customDates,
                  toDate: event.currentTarget.value,
                })
              }
              type="date"
              value={customDates.toDate}
            />
          </label>
          <button disabled={isLoading} onClick={onCustomSubmit} type="button">
            表示する
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="period-control__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
