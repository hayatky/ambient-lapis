import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PeriodSelector, type PeriodSelectorProps } from "./period-selector";

function props(
  overrides: Partial<PeriodSelectorProps> = {},
): PeriodSelectorProps {
  return {
    customDates: { fromDate: "2026-07-12", toDate: "2026-07-18" },
    error: null,
    isLoading: false,
    maxDate: "2026-07-18",
    onCustomDatesChange: vi.fn(),
    onCustomSubmit: vi.fn(),
    onPresetChange: vi.fn(),
    selected: "24h",
    ...overrides,
  };
}

describe("PeriodSelector", () => {
  it("exposes a named radio group and supports arrow-key preset selection", async () => {
    const user = userEvent.setup();
    const onPresetChange = vi.fn();
    render(<PeriodSelector {...props({ onPresetChange })} />);

    expect(screen.getByRole("group", { name: "表示期間" })).toBeInTheDocument();
    const current = screen.getByRole("radio", { name: "24時間" });
    expect(current).toBeChecked();
    expect(screen.getByRole("radio", { name: "7日" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "30日" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "任意" })).not.toBeChecked();

    current.focus();
    await user.keyboard("{ArrowRight}");
    expect(onPresetChange).toHaveBeenCalledWith("7d");
  });

  it("renders an accessible bounded custom range and forwards date edits", async () => {
    const user = userEvent.setup();
    const onCustomDatesChange = vi.fn();
    const onCustomSubmit = vi.fn();
    render(
      <PeriodSelector
        {...props({
          onCustomDatesChange,
          onCustomSubmit,
          selected: "custom",
        })}
      />,
    );

    expect(screen.getByRole("group", { name: "任意期間" })).toBeInTheDocument();
    const from = screen.getByLabelText("開始日");
    const to = screen.getByLabelText("終了日");
    expect(from).toHaveAttribute("max", "2026-07-18");
    expect(to).toHaveAttribute("min", "2026-07-12");
    expect(to).toHaveAttribute("max", "2026-07-18");

    fireEvent.change(from, { target: { value: "2026-07-10" } });
    expect(onCustomDatesChange).toHaveBeenLastCalledWith({
      fromDate: "2026-07-10",
      toDate: "2026-07-18",
    });
    await user.click(screen.getByRole("button", { name: "表示する" }));
    expect(onCustomSubmit).toHaveBeenCalledTimes(1);
  });

  it("announces validation errors and prevents duplicate custom submission while loading", () => {
    render(
      <PeriodSelector
        {...props({
          error: "終了日は今日以前を選択してください",
          isLoading: true,
          selected: "custom",
        })}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "終了日は今日以前を選択してください",
    );
    expect(screen.getByRole("button", { name: "表示する" })).toBeDisabled();
  });
});
