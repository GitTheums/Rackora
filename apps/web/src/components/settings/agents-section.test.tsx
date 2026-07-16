import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentsSection } from "./agents-section";

const listAgents = vi.fn();
const listEnrollmentTokens = vi.fn();
const getCurrentUser = vi.fn();
const createEnrollmentToken = vi.fn();
const revokeAgent = vi.fn();

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
  formatDevError: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
  listAgents: (...args: unknown[]) => listAgents(...args),
  listEnrollmentTokens: (...args: unknown[]) => listEnrollmentTokens(...args),
  createEnrollmentToken: (...args: unknown[]) => createEnrollmentToken(...args),
  revokeAgent: (...args: unknown[]) => revokeAgent(...args),
}));

const onlineAgent = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  name: "rackora-dev",
  status: "online" as const,
  version: "0.1.0",
  hostname: "fixture-host",
  os: "Debian",
  architecture: "x64",
  enrolledAt: "2026-07-16T11:00:00.000Z",
  lastHeartbeatAt: "2026-07-16T11:05:00.000Z",
  revokedAt: null,
  telemetryReceivedAt: "2026-07-16T11:05:00.000Z",
  dockerAvailable: true,
  telemetrySchemaVersion: 1,
  dockerEngineVersion: "27.1.0",
  containerCount: 2,
  cpuUsagePercent: 10,
  memoryUsedBytes: 1000,
  memoryTotalBytes: 2000,
};

const pendingToken = {
  id: "550e8400-e29b-41d4-a716-446655440099",
  name: "rackora-dev",
  expiresAt: "2026-07-16T12:00:00.000Z",
  usedAt: null,
  createdAt: "2026-07-16T11:00:00.000Z",
};

describe("AgentsSection", () => {
  beforeEach(() => {
    getCurrentUser.mockResolvedValue({ csrfToken: "csrf-token" });
    listAgents.mockResolvedValue({ agents: [] });
    listEnrollmentTokens.mockResolvedValue({ tokens: [] });
    createEnrollmentToken.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "host-a",
      expiresAt: "2026-07-16T12:00:00.000Z",
      usedAt: null,
      createdAt: "2026-07-16T11:00:00.000Z",
      token: "one-time-token-value",
    });
    revokeAgent.mockResolvedValue({
      ...onlineAgent,
      status: "revoked",
      revokedAt: "2026-07-16T11:30:00.000Z",
      lastHeartbeatAt: null,
      dockerAvailable: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("shows the Agents section and empty enrolled state", async () => {
    render(<AgentsSection />);

    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(
      await screen.findByText("No agents have been enrolled yet."),
    ).toBeInTheDocument();
    expect(screen.getByText("Enrolled agents")).toBeInTheDocument();
    expect(
      screen.queryByText("Pending enrollments"),
    ).not.toBeInTheDocument();
    expect(listEnrollmentTokens).toHaveBeenCalledWith(true);
  });

  it("loads pending tokens separately from enrolled agents", async () => {
    listAgents.mockResolvedValue({ agents: [onlineAgent] });
    listEnrollmentTokens.mockResolvedValue({ tokens: [pendingToken] });

    render(<AgentsSection />);

    const agentRow = await screen.findByTestId(`agent-row-${onlineAgent.id}`);
    const pendingRow = screen.getByTestId(`pending-token-${pendingToken.id}`);

    expect(within(agentRow).getByText("Online")).toBeInTheDocument();
    expect(within(pendingRow).getByText("Pending")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Enrolled agents" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Pending enrollments" }),
    ).toBeInTheDocument();
    // Same display name may appear twice; enrolled row must stay Online.
    expect(screen.getAllByText("rackora-dev")).toHaveLength(2);
    expect(listAgents).toHaveBeenCalled();
    expect(listEnrollmentTokens).toHaveBeenCalledWith(true);
  });

  it("does not show pending enrollments when the token list is empty", async () => {
    listAgents.mockResolvedValue({ agents: [onlineAgent] });
    listEnrollmentTokens.mockResolvedValue({ tokens: [] });

    render(<AgentsSection />);

    const agentRow = await screen.findByTestId(`agent-row-${onlineAgent.id}`);
    expect(within(agentRow).getByText("0.1.0")).toBeInTheDocument();
    expect(within(agentRow).getByText("Connected")).toBeInTheDocument();
    expect(within(agentRow).getByText("fixture-host")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Pending enrollments" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Waiting for enrollment")).not.toBeInTheDocument();
  });

  it("Refresh refetches both enrolled agents and pending tokens", async () => {
    listAgents.mockResolvedValue({ agents: [onlineAgent] });
    listEnrollmentTokens.mockResolvedValue({ tokens: [] });

    render(<AgentsSection />);
    await screen.findByTestId(`agent-row-${onlineAgent.id}`);

    listAgents.mockClear();
    listEnrollmentTokens.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(listAgents).toHaveBeenCalledTimes(1);
      expect(listEnrollmentTokens).toHaveBeenCalledWith(true);
    });
  });

  it("opens Add agent, creates a token, and shows it once with instructions", async () => {
    render(<AgentsSection />);

    await screen.findByText("No agents have been enrolled yet.");
    fireEvent.click(screen.getAllByRole("button", { name: "Add agent" })[0]!);

    expect(
      screen.getByText("Create a one-time enrollment token for a new host."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Agent name"), {
      target: { value: "host-a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));

    expect(await screen.findByText("one-time-token-value")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This token is shown only once. Copy it now. Rackora cannot display it again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/CORE_URL=/)).toBeInTheDocument();
    expect(screen.getByText(/DATA_DIR=\/data/)).toBeInTheDocument();
    expect(screen.getByText(/HEARTBEAT_INTERVAL_MS=30000/)).toBeInTheDocument();
    expect(createEnrollmentToken).toHaveBeenCalledWith(
      {
        agentName: "host-a",
        expiresInSeconds: 1800,
      },
      "csrf-token",
    );

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("one-time-token-value")).not.toBeInTheDocument();
  });

  it("renders agent status and confirms revoke", async () => {
    listAgents.mockResolvedValue({
      agents: [onlineAgent],
    });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AgentsSection />);

    const agentRow = await screen.findByTestId(`agent-row-${onlineAgent.id}`);
    expect(within(agentRow).getByText("rackora-dev")).toBeInTheDocument();
    expect(within(agentRow).getByText("Online")).toBeInTheDocument();
    expect(within(agentRow).getByText("fixture-host")).toBeInTheDocument();
    expect(within(agentRow).getByText("Connected")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for rackora-dev" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke agent" }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(revokeAgent).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440001",
        "csrf-token",
      );
    });
    confirmSpy.mockRestore();
  });
});
