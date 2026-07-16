import {
  Activity,
  Bell,
  Container,
  LayoutDashboard,
  type LucideIcon,
  Plug,
  RefreshCw,
  Server,
  Settings,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/infrastructure", label: "Infrastructure", icon: Server },
  { to: "/docker", label: "Docker", icon: Container },
  { to: "/checks", label: "Checks", icon: Activity },
  { to: "/updates", label: "Updates", icon: RefreshCw },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/settings", label: "Settings", icon: Settings },
];
