import { Container } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/states";

export function DockerPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Docker"
        description="Container status reported by the Rackora agent."
      />

      <EmptyState
        icon={Container}
        title="Rackora Agent is not configured yet"
        description="Docker monitoring will be available once the Rackora Agent is connected."
      />
    </div>
  );
}
