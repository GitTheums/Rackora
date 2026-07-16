import { BellOff } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/states";

export function AlertsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts"
        description="Notifications raised across your homelab."
      />

      <EmptyState
        icon={BellOff}
        title="No alerts have been generated"
        description="Alerts will appear here when monitoring detects issues."
      />
    </div>
  );
}
