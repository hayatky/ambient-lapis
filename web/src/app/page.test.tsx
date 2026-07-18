import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import type { DashboardInitialData } from "@/lib/dashboard";

const mocks = vi.hoisted(() => ({
  loadDashboardInitialData: vi.fn(),
  serverApi: { marker: "server-api" },
}));

vi.mock("@/lib/api/server-client", () => ({ serverApi: mocks.serverApi }));
vi.mock("@/lib/dashboard", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/dashboard")>();
  return {
    ...original,
    loadDashboardInitialData: mocks.loadDashboardInitialData,
  };
});
vi.mock("@/components/dashboard/dashboard-client", () => ({
  DashboardClient: ({ initialData }: { initialData: DashboardInitialData }) => (
    <main>
      <h1>Ambient Lapis dashboard</h1>
      <span>{initialData.loadedAt}</span>
    </main>
  ),
}));

import HomePage, { dynamic } from "./page";

describe("HomePage", () => {
  it("loads the independent SSR resources and renders the dashboard client", async () => {
    const initialData = {
      loadedAt: "2026-07-18T12:35:00.000Z",
    } as DashboardInitialData;
    mocks.loadDashboardInitialData.mockResolvedValue(initialData);

    render(await HomePage());

    expect(dynamic).toBe("force-dynamic");
    expect(mocks.loadDashboardInitialData).toHaveBeenCalledWith(
      mocks.serverApi,
    );
    expect(
      screen.getByRole("heading", { name: "Ambient Lapis dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByText(initialData.loadedAt)).toBeInTheDocument();
  });
});
