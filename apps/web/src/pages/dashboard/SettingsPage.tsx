import { type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { RACKORA_VERSION } from "@rackora/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/dashboard/page-header";
import { AgentsSection } from "@/components/settings/agents-section";
import { useTheme } from "@/components/theme/theme-context";

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure how Rackora looks and behaves."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>
            Choose a light or dark theme for the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow
            label="Theme"
            description="Applies instantly and is remembered on this device."
          >
            <div className="flex gap-2">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("light")}
                aria-pressed={theme === "light"}
              >
                <Sun aria-hidden />
                Light
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("dark")}
                aria-pressed={theme === "dark"}
              >
                <Moon aria-hidden />
                Dark
              </Button>
            </div>
          </SettingRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
          <CardDescription>Instance details and preferences.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border py-0">
          <SettingRow
            label="Instance name"
            description="Shown in the sidebar and browser tab."
          >
            <span className="text-sm text-muted-foreground">Rackora</span>
          </SettingRow>
          <SettingRow
            label="Telemetry"
            description="Rackora only receives outbound agent telemetry."
          >
            <span className="text-sm font-medium text-success">Enabled</span>
          </SettingRow>
        </CardContent>
      </Card>

      <AgentsSection />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Version</span>
            <span className="font-mono text-foreground">
              v{RACKORA_VERSION}
            </span>
          </div>
          <Separator className="my-3" />
          <p className="text-sm text-muted-foreground">
            Rackora is a self-hosted homelab monitoring dashboard.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
