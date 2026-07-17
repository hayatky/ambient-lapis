import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PeriodSelector } from "./period-selector";

describe("PeriodSelector", () => {
  it("renders all presets as a radiogroup with the selection checked", () => {
    render(<PeriodSelector value="24h" onChange={() => {}} />);
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
    const onChange = vi.fn();
    render(<PeriodSelector value="24h" onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole("radio", { name: "30日" }));
    expect(onChange).toHaveBeenCalledWith("30d");
  });

  it("moves the selection with arrow keys", async () => {
    const onChange = vi.fn();
    render(<PeriodSelector value="24h" onChange={onChange} />);
    const user = userEvent.setup();
    screen.getByRole("radio", { name: "24時間" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("7d");
    // Focus moved to 7日; the left arrow wraps back to the previous item.
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("24h");
    screen.getByRole("radio", { name: "24時間" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("custom");
  });

  it("confirms with Enter and Space", async () => {
    const onChange = vi.fn();
    render(<PeriodSelector value="7d" onChange={onChange} />);
    const user = userEvent.setup();
    screen.getByRole("radio", { name: "7日" }).focus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("7d");
    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
