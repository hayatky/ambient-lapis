import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { KioskInitialData } from "@/hooks/use-kiosk-data";
import { FIXTURE_NOW, fixtureScenarios } from "@/test/fixtures";

import { Kiosk } from "./kiosk";

vi.mock("@/components/dashboard/environment-chart", () => ({
  EnvironmentChart: ({
    onSelectionChange,
    ariaLabel,
  }: {
    onSelectionChange?: (value: unknown) => void;
    ariaLabel: string;
  }) => (
    <button
      type="button"
      data-testid="kiosk-chart"
      data-aria-label={ariaLabel}
      onClick={() =>
        onSelectionChange?.({
          epochMs: Date.parse(FIXTURE_NOW),
          point: null,
          airconSegment: null,
        })
      }
    >
      chart
    </button>
  ),
}));

const statusMock = vi.fn();
const currentMock = vi.fn();
const environmentSeriesMock = vi.fn();
const airconSeriesMock = vi.fn();
const requestFullscreenMock = vi.fn();
const exitFullscreenMock = vi.fn();

vi.mock("@/lib/api/browser-client", () => ({
  browserApi: {
    status: (...args: unknown[]) => statusMock(...args),
    current: (...args: unknown[]) => currentMock(...args),
    environmentSeries: (...args: unknown[]) => environmentSeriesMock(...args),
    airconSeries: (...args: unknown[]) => airconSeriesMock(...args),
  },
}));

const scenario = fixtureScenarios.normal;
const initial: KioskInitialData = {
  status: scenario.status.data,
  current: scenario.current.data,
  currentFailed: false,
  environmentSeries: scenario.environmentSeries.data,
  airconSeries: scenario.airconSeries.data,
  historyFailed: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(document, "fullscreenEnabled", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: null,
  });
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    configurable: true,
    value: requestFullscreenMock,
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: exitFullscreenMock,
  });
  requestFullscreenMock.mockResolvedValue(undefined);
  exitFullscreenMock.mockResolvedValue(undefined);
  statusMock.mockResolvedValue(scenario.status);
  currentMock.mockResolvedValue(scenario.current);
  environmentSeriesMock.mockResolvedValue(scenario.environmentSeries);
  airconSeriesMock.mockResolvedValue(scenario.airconSeries);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Kiosk", () => {
  it("keeps current values and reveals controls after interaction", async () => {
    render(<Kiosk initial={initial} serverNowIso={FIXTURE_NOW} />);
    expect(
      screen.getByRole("region", { name: "現在の室内環境" }),
    ).toHaveTextContent("26.4");
    expect(
      screen.getByRole("region", { name: "現在の室内環境" }),
    ).toHaveTextContent("58");
    expect(
      screen.getByRole("region", { name: "エアコン - Nature Remo認識状態" }),
    ).toHaveTextContent("運転中");
    const root = screen.getByTestId("kiosk-root");
    const dock = screen.getByTestId("kiosk-control-dock");
    expect(dock).toHaveAttribute("data-menu-visible", "false");
    fireEvent.pointerMove(root);
    expect(dock).toHaveAttribute("data-menu-visible", "true");
    expect(screen.getByRole("button", { name: "24時間" })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /全画面/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "通常表示" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("radiogroup", { name: "テーマ" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/双方向確認/)).not.toBeInTheDocument();
  });

  it("loads a new range and exposes selected chart details", async () => {
    const user = userEvent.setup();
    render(<Kiosk initial={initial} serverNowIso={FIXTURE_NOW} />);
    fireEvent.pointerMove(screen.getByTestId("kiosk-root"));
    await user.click(screen.getByRole("button", { name: "7日" }));
    expect(environmentSeriesMock).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId("kiosk-chart"));
    expect(
      screen.getByRole("region", { name: "選択時刻の詳細" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "詳細を閉じる" }));
    expect(
      screen.queryByRole("region", { name: "選択時刻の詳細" }),
    ).not.toBeInTheDocument();
  });

  it("keeps successful current values and history when status failed", () => {
    render(
      <Kiosk
        initial={{ ...initial, status: null, currentFailed: true }}
        serverNowIso={FIXTURE_NOW}
      />,
    );
    expect(
      screen.getByRole("region", { name: "現在の室内環境" }),
    ).toHaveTextContent("26.4");
    expect(
      screen.getByRole("region", { name: "エアコン - Nature Remo認識状態" }),
    ).toHaveTextContent("運転中");
    expect(screen.getByTestId("kiosk-chart")).toBeInTheDocument();
  });

  it("keeps a severe collection warning visible while the dock is hidden", () => {
    const stopped = fixtureScenarios.collectionStopped;
    render(
      <Kiosk
        initial={{
          status: stopped.status.data,
          current: stopped.current.data,
          currentFailed: false,
          environmentSeries: stopped.environmentSeries.data,
          airconSeries: stopped.airconSeries.data,
          historyFailed: false,
        }}
        serverNowIso={FIXTURE_NOW}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "データ収集が停止しています",
    );
    expect(screen.getByTestId("kiosk-control-dock")).toHaveAttribute(
      "data-menu-visible",
      "false",
    );
  });

  it("shows the empty state instead of a chart canvas for an empty series", () => {
    render(
      <Kiosk
        initial={{
          ...initial,
          environmentSeries: {
            ...scenario.environmentSeries.data,
            points: [],
          },
        }}
        serverNowIso={FIXTURE_NOW}
      />,
    );
    expect(
      screen.getByText("表示できる履歴はまだありません"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("kiosk-chart")).not.toBeInTheDocument();
  });

  it("keeps the old chart range and shows retry when a period refresh partially fails", async () => {
    airconSeriesMock.mockRejectedValue(new Error("unavailable"));
    const user = userEvent.setup();
    render(<Kiosk initial={initial} serverNowIso={FIXTURE_NOW} />);
    fireEvent.pointerMove(screen.getByTestId("kiosk-root"));
    expect(screen.getByTestId("kiosk-chart")).toHaveAttribute(
      "data-aria-label",
      expect.stringContaining("24時間"),
    );
    await user.click(screen.getByRole("button", { name: "7日" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("履歴更新失敗"),
    );
    expect(screen.getByTestId("kiosk-chart")).toHaveAttribute(
      "data-aria-label",
      expect.stringContaining("24時間"),
    );
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
  });

  it("hides fullscreen when the complete API is unavailable", async () => {
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      value: false,
    });
    render(<Kiosk initial={initial} serverNowIso={FIXTURE_NOW} />);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /全画面/ }),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps the kiosk usable when fullscreen permission is rejected", async () => {
    requestFullscreenMock.mockRejectedValue(new Error("denied"));
    const user = userEvent.setup();
    render(<Kiosk initial={initial} serverNowIso={FIXTURE_NOW} />);
    fireEvent.pointerMove(screen.getByTestId("kiosk-root"));
    const button = await screen.findByRole("button", { name: "全画面" });
    await user.click(button);
    expect(requestFullscreenMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "通常表示" })).toBeInTheDocument();
  });

  it("reveals on interaction, hides after idle, and stays open while focused", () => {
    vi.useFakeTimers();
    render(<Kiosk initial={initial} serverNowIso={FIXTURE_NOW} />);
    const root = screen.getByTestId("kiosk-root");
    const dock = screen.getByTestId("kiosk-control-dock");

    expect(dock).toHaveAttribute("data-menu-visible", "false");
    fireEvent.pointerMove(root);
    expect(dock).toHaveAttribute("data-menu-visible", "true");
    act(() => vi.advanceTimersByTime(2999));
    expect(dock).toHaveAttribute("data-menu-visible", "true");
    act(() => vi.advanceTimersByTime(1));
    expect(dock).toHaveAttribute("data-menu-visible", "false");

    fireEvent.pointerMove(root);
    const periodButton = screen.getByRole("button", { name: "24時間" });
    fireEvent.focus(periodButton);
    act(() => vi.advanceTimersByTime(5000));
    expect(dock).toHaveAttribute("data-menu-visible", "true");
    fireEvent.blur(periodButton, { relatedTarget: null });
    act(() => vi.advanceTimersByTime(3000));
    expect(dock).toHaveAttribute("data-menu-visible", "false");

    fireEvent.pointerMove(root);
    fireEvent.mouseEnter(dock);
    act(() => vi.advanceTimersByTime(5000));
    expect(dock).toHaveAttribute("data-menu-visible", "true");
    fireEvent.mouseLeave(dock);
    act(() => vi.advanceTimersByTime(3000));
    expect(dock).toHaveAttribute("data-menu-visible", "false");

    fireEvent.pointerMove(root);
    fireEvent.click(periodButton);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dock).toHaveAttribute("data-menu-visible", "false");
  });
});
