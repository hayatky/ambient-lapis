import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { serverApi } from "@/lib/api/server-client";
import { loadDashboardInitialData } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const initialData = await loadDashboardInitialData(serverApi);
  return <DashboardClient initialData={initialData} />;
}
