import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DockerPage } from "./DockerPage";

const getDockerSummary = vi.fn();
const listDockerContainers = vi.fn();
const listHosts = vi.fn();

vi.mock("@/lib/api", () => ({
  formatDevError: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  getDockerSummary: (...args: unknown[]) => getDockerSummary(...args),
  listDockerContainers: (...args: unknown[]) => listDockerContainers(...args),
  listHosts: (...args: unknown[]) => listHosts(...args),
}));

const onlineContainer = {
  agentId: "550e8400-e29b-41d4-a716-446655440001",
  agentName: "rackora-dev",
  hostname: "host-1",
  id: "abcdef0123456789",
  shortId: "abcdef012345",
  name: "rackora-agent-dev",
  image: "dev-agent-rackora-agent:latest",
  imageId: "sha256:abc",
  imageDigest: null,
  state: "running" as const,
  health: "none" as const,
  createdAt: "2026-07-16T11:00:00.000Z",
  startedAt: "2026-07-16T11:01:00.000Z",
  restartCount: 0,
  cpuPercent: 1.2,
  memoryUsedBytes: 50_000_000,
  memoryLimitBytes: 200_000_000,
  memoryPercent: 25,
  netRxBytes: 1000,
  netTxBytes: 2000,
  blockReadBytes: 100,
  blockWriteBytes: 200,
  labels: {},
  collectedAt: "2026-07-16T12:00:00.000Z",
  stale: false,
  partial: false,
};

describe("DockerPage", () => {
  beforeEach(() => {
    getDockerSummary.mockResolvedValue({
      totalAgents: 0,
      onlineAgents: 0,
      dockerConnectedAgents: 0,
      totalContainers: 0,
      runningContainers: 0,
      stoppedContainers: 0,
      unhealthyContainers: 0,
      lastUpdatedAt: null,
      stale: false,
      partial: false,
      warnings: [],
      pageState: "no_agents",
    });
    listDockerContainers.mockResolvedValue({
      containers: [],
      stale: false,
      partial: false,
      warnings: [],
      lastUpdatedAt: null,
    });
    listHosts.mockResolvedValue({
      hosts: [],
      stale: false,
      partial: false,
      lastUpdatedAt: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows no-agent empty state", async () => {
    render(<DockerPage />);
    expect(
      await screen.findByText("No Rackora Agents have been enrolled yet."),
    ).toBeInTheDocument();
  });

  it("shows waiting-for-telemetry state", async () => {
    getDockerSummary.mockResolvedValue({
      totalAgents: 1,
      onlineAgents: 1,
      dockerConnectedAgents: 0,
      totalContainers: 0,
      runningContainers: 0,
      stoppedContainers: 0,
      unhealthyContainers: 0,
      lastUpdatedAt: null,
      stale: false,
      partial: false,
      warnings: [],
      pageState: "waiting_for_telemetry",
    });

    render(<DockerPage />);
    expect(
      await screen.findByText("Waiting for the first telemetry report."),
    ).toBeInTheDocument();
  });

  it("shows docker unavailable state", async () => {
    getDockerSummary.mockResolvedValue({
      totalAgents: 1,
      onlineAgents: 1,
      dockerConnectedAgents: 0,
      totalContainers: 0,
      runningContainers: 0,
      stoppedContainers: 0,
      unhealthyContainers: 0,
      lastUpdatedAt: "2026-07-16T12:00:00.000Z",
      stale: false,
      partial: true,
      warnings: ["Docker engine ping failed"],
      pageState: "docker_unavailable",
    });
    listHosts.mockResolvedValue({
      hosts: [
        {
          agentId: onlineContainer.agentId,
          agentName: "rackora-dev",
          status: "online",
          agentVersion: "0.1.0",
          hostname: "host-1",
          os: "Debian",
          architecture: "x64",
          uptimeSeconds: 1000,
          cpuUsagePercent: 10,
          cpuCores: 4,
          loadAverage: [0.1, 0.2, 0.3],
          memoryUsedBytes: 1_000,
          memoryTotalBytes: 2_000,
          memoryAvailableBytes: 1_000,
          swapUsedBytes: null,
          swapTotalBytes: null,
          filesystems: [],
          temperatures: [],
          dockerAvailable: false,
          dockerEngineVersion: null,
          containerCount: 0,
          lastHeartbeatAt: "2026-07-16T12:00:00.000Z",
          lastTelemetryAt: "2026-07-16T12:00:00.000Z",
          stale: false,
          partial: true,
          warnings: ["Docker engine ping failed"],
        },
      ],
      stale: false,
      partial: true,
      lastUpdatedAt: "2026-07-16T12:00:00.000Z",
    });

    render(<DockerPage />);
    expect(
      await screen.findByText("Docker is not available on this agent."),
    ).toBeInTheDocument();
    expect(screen.getByText("Hosts")).toBeInTheDocument();
  });

  it("renders populated containers and filters", async () => {
    getDockerSummary.mockResolvedValue({
      totalAgents: 1,
      onlineAgents: 1,
      dockerConnectedAgents: 1,
      totalContainers: 1,
      runningContainers: 1,
      stoppedContainers: 0,
      unhealthyContainers: 0,
      lastUpdatedAt: "2026-07-16T12:00:00.000Z",
      stale: false,
      partial: false,
      warnings: [],
      pageState: "ready",
    });
    listDockerContainers.mockResolvedValue({
      containers: [onlineContainer],
      stale: false,
      partial: false,
      warnings: [],
      lastUpdatedAt: "2026-07-16T12:00:00.000Z",
    });
    listHosts.mockResolvedValue({
      hosts: [
        {
          agentId: onlineContainer.agentId,
          agentName: "rackora-dev",
          status: "online",
          agentVersion: "0.1.0",
          hostname: "host-1",
          os: "Debian",
          architecture: "x64",
          uptimeSeconds: 3600,
          cpuUsagePercent: 12.5,
          cpuCores: 8,
          loadAverage: [0.5, 0.4, 0.3],
          memoryUsedBytes: 4_000_000_000,
          memoryTotalBytes: 16_000_000_000,
          memoryAvailableBytes: 12_000_000_000,
          swapUsedBytes: 0,
          swapTotalBytes: 1_000_000_000,
          filesystems: [
            {
              mountpoint: "/",
              fstype: "ext4",
              totalBytes: 100_000_000_000,
              usedBytes: 40_000_000_000,
              availableBytes: 60_000_000_000,
            },
          ],
          temperatures: [
            { name: "x86_pkg_temp", celsius: 48, source: "thermal" },
          ],
          dockerAvailable: true,
          dockerEngineVersion: "27.1.0",
          containerCount: 1,
          lastHeartbeatAt: "2026-07-16T12:00:00.000Z",
          lastTelemetryAt: "2026-07-16T12:00:00.000Z",
          stale: false,
          partial: false,
          warnings: [],
        },
      ],
      stale: false,
      partial: false,
      lastUpdatedAt: "2026-07-16T12:00:00.000Z",
    });

    render(<DockerPage />);

    expect(await screen.findByText("rackora-agent-dev")).toBeInTheDocument();
    expect(
      screen.getByTestId("container-row-abcdef012345"),
    ).toHaveTextContent("Running");
    expect(screen.getByText("Containers running")).toBeInTheDocument();
    expect(screen.getByText(/v0\.1\.0/)).toBeInTheDocument();
    expect(screen.getByText("27.1.0")).toBeInTheDocument();
    expect(screen.getByText("x86_pkg_temp")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter by state"), {
      target: { value: "stopped" },
    });
    await waitFor(() => {
      expect(screen.queryByText("rackora-agent-dev")).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Filter by state"), {
      target: { value: "running" },
    });
    expect(await screen.findByText("rackora-agent-dev")).toBeInTheDocument();
  });
});
