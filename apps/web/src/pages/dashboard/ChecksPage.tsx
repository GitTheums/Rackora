import { Activity } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/states";

export function ChecksPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Checks"
        description="Uptime and reachability checks for your services."
      />

      <EmptyState
        icon={Activity}
        title="Monitoring checks have not been configured yet"
        description="Service checks will appear here once monitoring is set up."
      />
    </div>
  );
}
