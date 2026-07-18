import { act, renderHook } from "@testing-library/react";

import { resolvePresetPeriod } from "@/lib/period";
import { FIXTURE_NOW, fixtureScenarios } from "@/test/fixtures";

import { useKioskData, type KioskInitialData } from "./use-kiosk-data";

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
const initial: KioskInitialData = {
  status: scenario.status.data,
  current: scenario.current.data,
  currentFailed: false,
  environmentSeries: scenario.environmentSeries.data,
  airconSeries: scenario.airconSeries.data,
  historyFailed: false,
};
const period = resolvePresetPeriod("24h", new Date(FIXTURE_NOW));

beforeEach(() => {
  vi.clearAllMocks();
  statusMock.mockResolvedValue(scenario.status);
  currentMock.mockResolvedValue(scenario.current);
  environmentSeriesMock.mockResolvedValue(scenario.environmentSeries);
  airconSeriesMock.mockResolvedValue(scenario.airconSeries);
});

afterEach(() => vi.useRealTimers());

describe("useKioskData", () => {
  it("refreshes current every minute and history every five minutes without daily summaries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXTURE_NOW));
    const onAdvance = vi.fn();
    renderHook(() => useKioskData(initial, period, onAdvance));

    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(statusMock).toHaveBeenCalledTimes(1);
    expect(environmentSeriesMock).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(240_000));
    expect(statusMock).toHaveBeenCalledTimes(5);
    expect(environmentSeriesMock).toHaveBeenCalledTimes(1);
    expect(airconSeriesMock).toHaveBeenCalledTimes(1);
    expect(dailySummaryMock).not.toHaveBeenCalled();
    expect(onAdvance).toHaveBeenCalledWith(
      expect.objectContaining({
        series: expect.objectContaining({
          toIso: new Date(Date.parse(FIXTURE_NOW) + 300_000).toISOString(),
        }),
      }),
    );
  });

  it("keeps the previous history pair and its range when either refresh fails", async () => {
    const nextPeriod = resolvePresetPeriod("7d", new Date(FIXTURE_NOW));
    environmentSeriesMock.mockResolvedValue({
      ...scenario.environmentSeries,
      data: { ...scenario.environmentSeries.data, points: [] },
    });
    airconSeriesMock.mockRejectedValue(new Error("unavailable"));
    const { result } = renderHook(() => useKioskData(initial, period));
    await act(async () => result.current.loadHistory(nextPeriod));
    expect(result.current.state.historyError).toBe(true);
    expect(result.current.state.environmentSeries).toEqual(
      scenario.environmentSeries.data,
    );
    expect(result.current.state.airconSeries).toEqual(
      scenario.airconSeries.data,
    );
    expect(result.current.state.historyPeriod).toEqual(period);
  });

  it("commits both history series and the range together after success", async () => {
    const nextPeriod = resolvePresetPeriod("7d", new Date(FIXTURE_NOW));
    const nextEnvironment = {
      ...scenario.environmentSeries,
      data: { ...scenario.environmentSeries.data, points: [] },
    };
    environmentSeriesMock.mockResolvedValue(nextEnvironment);
    const { result } = renderHook(() => useKioskData(initial, period));
    await act(async () => result.current.loadHistory(nextPeriod));
    expect(result.current.state.environmentSeries).toEqual(
      nextEnvironment.data,
    );
    expect(result.current.state.airconSeries).toEqual(
      scenario.airconSeries.data,
    );
    expect(result.current.state.historyPeriod).toEqual(nextPeriod);
    expect(result.current.state.historyError).toBe(false);
  });

  it("pauses both refresh loops while hidden and refreshes on return", async () => {
    vi.useFakeTimers();
    let visibilityState: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibilityState,
    );
    renderHook(() => useKioskData(initial, period));
    await act(async () => {
      visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => vi.advanceTimersByTimeAsync(600_000));
    expect(statusMock).not.toHaveBeenCalled();
    expect(environmentSeriesMock).not.toHaveBeenCalled();

    await act(async () => {
      visibilityState = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusMock).toHaveBeenCalledTimes(1);
    expect(environmentSeriesMock).toHaveBeenCalledTimes(1);
  });
});
