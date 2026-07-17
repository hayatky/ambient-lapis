import { act, renderHook, waitFor } from "@testing-library/react";

import { fixtureScenarios } from "@/test/fixtures";

import {
  useDashboardData,
  type DashboardInitialData,
} from "./use-dashboard-data";

const statusMock = vi.fn();
const currentMock = vi.fn();
const environmentSeriesMock = vi.fn();
const airconSeriesMock = vi.fn();
const dailySummaryMock = vi.fn();

vi.mock("@/lib/api/browser-client", () => ({
  browserApi: {
    status: (...args: unknown[]) => statusMock(...args),
    current: (...args: unknown[]) => currentMock(...args),
    environmentSeries: (...args: unknown[]) => environmentSeriesMock(...args),
    airconSeries: (...args: unknown[]) => airconSeriesMock(...args),
    dailySummary: (...args: unknown[]) => dailySummaryMock(...args),
  },
}));

const scenario = fixtureScenarios.normal;

const initial: DashboardInitialData = {
  status: scenario.status.data,
  current: scenario.current.data,
  currentFailed: false,
  environmentSeries: scenario.environmentSeries.data,
  airconSeries: scenario.airconSeries.data,
  dailySummary: scenario.dailySummary.data,
  historyFailed: false,
};

const period = {
  series: {
    fromIso: "2026-07-17T12:35:00.000Z",
    toIso: "2026-07-18T12:35:00.000Z",
  },
  dailySummary: {
    fromIso: "2026-07-11T15:00:00.000Z",
    toIso: "2026-07-18T12:35:00.000Z",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  statusMock.mockResolvedValue(scenario.status);
  currentMock.mockResolvedValue(scenario.current);
  environmentSeriesMock.mockResolvedValue(scenario.environmentSeries);
  airconSeriesMock.mockResolvedValue(scenario.airconSeries);
  dailySummaryMock.mockResolvedValue(scenario.dailySummary);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDashboardData", () => {
  it("initializes from the SSR data without fetching", () => {
    const { result } = renderHook(() => useDashboardData(initial));
    expect(result.current.state.status).toEqual(scenario.status.data);
    expect(result.current.state.currentError).toBe(false);
    expect(statusMock).not.toHaveBeenCalled();
  });

  it("polls status and current every 60 seconds while visible", async () => {
    vi.useFakeTimers();
    renderHook(() => useDashboardData(initial));
    expect(statusMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(statusMock).toHaveBeenCalledTimes(1);
    expect(currentMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(statusMock).toHaveBeenCalledTimes(2);
  });

  it("keeps previous data and flags an error when a refresh fails", async () => {
    statusMock.mockRejectedValue(new Error("boom"));
    currentMock.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useDashboardData(initial));
    await act(async () => {
      await result.current.refreshCurrent();
    });
    expect(result.current.state.currentError).toBe(true);
    expect(result.current.state.status).toEqual(scenario.status.data);
    expect(result.current.state.current).toEqual(scenario.current.data);
  });

  it("clears the error after a successful retry", async () => {
    statusMock.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useDashboardData(initial));
    await act(async () => {
      await result.current.refreshCurrent();
    });
    expect(result.current.state.currentError).toBe(true);
    await act(async () => {
      await result.current.refreshCurrent();
    });
    expect(result.current.state.currentError).toBe(false);
  });

  it("loads history for a period and reports partial failures", async () => {
    airconSeriesMock.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useDashboardData(initial));
    await act(async () => {
      await result.current.loadHistory(period);
    });
    expect(result.current.state.historyError).toBe(true);
    // Successful parts are still applied.
    expect(result.current.state.environmentSeries).toEqual(
      scenario.environmentSeries.data,
    );
    expect(result.current.state.historyLoading).toBe(false);
  });

  it("aborts the previous history request when a new one starts", async () => {
    const signals: AbortSignal[] = [];
    environmentSeriesMock.mockImplementation(
      (_query: unknown, options: { signal: AbortSignal }) => {
        signals.push(options.signal);
        return new Promise((resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
          setTimeout(() => resolve(scenario.environmentSeries), 5);
        });
      },
    );
    const { result } = renderHook(() => useDashboardData(initial));
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.loadHistory(period);
    });
    await act(async () => {
      await result.current.loadHistory(period);
      await first;
    });
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    // The aborted request must not overwrite the newer result.
    await waitFor(() => {
      expect(result.current.state.historyLoading).toBe(false);
    });
    expect(result.current.state.historyError).toBe(false);
  });

  it("pauses polling while hidden and refetches immediately on return", async () => {
    vi.useFakeTimers();
    let visibilityState: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibilityState,
    );
    renderHook(() => useDashboardData(initial));

    await act(async () => {
      visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(statusMock).not.toHaveBeenCalled();

    await act(async () => {
      visibilityState = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusMock).toHaveBeenCalledTimes(1);
  });
});
