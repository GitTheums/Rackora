import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { OverviewPage } from "@/pages/dashboard/OverviewPage";
import { InfrastructurePage } from "@/pages/dashboard/InfrastructurePage";
import { DockerPage } from "@/pages/dashboard/DockerPage";
import { ChecksPage } from "@/pages/dashboard/ChecksPage";
import { UpdatesPage } from "@/pages/dashboard/UpdatesPage";
import { AlertsPage } from "@/pages/dashboard/AlertsPage";
import { IntegrationsPage } from "@/pages/dashboard/IntegrationsPage";
import { SettingsPage } from "@/pages/dashboard/SettingsPage";
import { LoginPage } from "@/pages/LoginPage";
import { SetupPage } from "@/pages/SetupPage";

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/infrastructure" element={<InfrastructurePage />} />
            <Route path="/docker" element={<DockerPage />} />
            <Route path="/checks" element={<ChecksPage />} />
            <Route path="/updates" element={<UpdatesPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/integrations" element={<IntegrationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
