import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CustomRangeFields } from "./custom-range-fields";

// 2026-07-18 21:35 JST
const NOW = new Date("2026-07-18T12:35:00.000Z");

describe("CustomRangeFields", () => {
  it("caps the date inputs at today in JST", () => {
    render(<CustomRangeFields now={NOW} onApply={() => {}} />);
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
    const onApply = vi.fn();
    render(<CustomRangeFields now={NOW} onApply={onApply} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("開始日"), "2026-07-01");
    await user.type(screen.getByLabelText("終了日"), "2026-07-10");
    await user.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const period = onApply.mock.calls[0]?.[0] as {
      series: { fromIso: string };
    };
    expect(period.series.fromIso).toBe("2026-06-30T15:00:00.000Z");
  });

  it("rejects an inverted range with a message and does not apply", async () => {
    const onApply = vi.fn();
    render(<CustomRangeFields now={NOW} onApply={onApply} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("開始日"), "2026-07-10");
    await user.type(screen.getByLabelText("終了日"), "2026-07-01");
    await user.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "開始日は終了日と同じか、それより前にしてください。",
    );
  });
});
