import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/states";

export function UpdatesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Updates"
        description="Available package and image updates across your hosts."
      />

      <EmptyState
        icon={RefreshCw}
        title="No update provider is connected"
        description="Update monitoring will appear here when a provider is configured."
      />
    </div>
  );
}
