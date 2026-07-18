import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FilterRow } from "./filter-row";

// 2026-07-18 21:35 JST
const NOW = new Date("2026-07-18T12:35:00.000Z");

function renderRow(
  overrides: Partial<React.ComponentProps<typeof FilterRow>> = {},
) {
  const onPresetChange = vi.fn();
  const onCustomApply = vi.fn();
  render(
    <FilterRow
      preset="24h"
      onPresetChange={onPresetChange}
      onCustomApply={onCustomApply}
      now={NOW}
      {...overrides}
    />,
  );
  return { onPresetChange, onCustomApply };
}

describe("FilterRow period tabs", () => {
  it("renders all presets as a radiogroup with the selection checked", () => {
    renderRow();
    expect(
      screen.getByRole("radiogroup", { name: "表示期間" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "24時間" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "7日" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("selects with mouse clicks", async () => {
    const { onPresetChange } = renderRow();
    await userEvent.setup().click(screen.getByRole("radio", { name: "30日" }));
    expect(onPresetChange).toHaveBeenCalledWith("30d");
  });

  it("moves the selection with arrow keys", async () => {
    const { onPresetChange } = renderRow();
    const user = userEvent.setup();
    screen.getByRole("radio", { name: "24時間" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onPresetChange).toHaveBeenCalledWith("7d");
    screen.getByRole("radio", { name: "24時間" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(onPresetChange).toHaveBeenLastCalledWith("custom");
  });

  it("confirms with Enter and Space", async () => {
    const { onPresetChange } = renderRow({ preset: "7d" });
    const user = userEvent.setup();
    screen.getByRole("radio", { name: "7日" }).focus();
    await user.keyboard("{Enter}");
    expect(onPresetChange).toHaveBeenCalledWith("7d");
    await user.keyboard(" ");
    expect(onPresetChange).toHaveBeenCalledTimes(2);
  });
});

describe("FilterRow custom range", () => {
  it("shows date fields capped at today (JST) when custom is active", () => {
    renderRow({ preset: "custom" });
    expect(screen.getByLabelText("開始日")).toHaveAttribute(
      "max",
      "2026-07-18",
    );
    expect(screen.getByLabelText("終了日")).toHaveAttribute(
      "max",
      "2026-07-18",
    );
  });

  it("applies a valid range", async () => {
    const { onCustomApply } = renderRow({ preset: "custom" });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("開始日"), "2026-07-01");
    await user.type(screen.getByLabelText("終了日"), "2026-07-10");
    await user.click(screen.getByRole("button", { name: "適用" }));
    expect(onCustomApply).toHaveBeenCalledTimes(1);
    const period = onCustomApply.mock.calls[0]?.[0] as {
      series: { fromIso: string };
    };
    expect(period.series.fromIso).toBe("2026-06-30T15:00:00.000Z");
  });

  it("rejects an inverted range with a message and does not apply", async () => {
    const { onCustomApply } = renderRow({ preset: "custom" });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("開始日"), "2026-07-10");
    await user.type(screen.getByLabelText("終了日"), "2026-07-01");
    await user.click(screen.getByRole("button", { name: "適用" }));
    expect(onCustomApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "開始日は終了日と同じか、それより前にしてください。",
    );
  });
});
