import { render, screen } from "@testing-library/react";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the minimal Japanese application shell", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: "ダッシュボードの基盤を準備しています",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/エアコンのNature Remo認識状態/),
    ).toBeInTheDocument();
  });
});
