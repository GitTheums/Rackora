import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockInfrastructure } from "@rackora/shared";
import { InfrastructurePage } from "./InfrastructurePage";

vi.mock("@/lib/api", () => ({
  getInfrastructure: vi.fn(),
  formatDevError: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

import { getInfrastructure } from "@/lib/api";

describe("InfrastructurePage", () => {
  beforeEach(() => {
    vi.mocked(getInfrastructure).mockReset();
  });

  it("renders nodes and opens a detail drawer", async () => {
    vi.mocked(getInfrastructure).mockResolvedValue(mockInfrastructure);

    render(
      <MemoryRouter>
        <InfrastructurePage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "pve-node-1" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Virtual Machines/i }));
    fireEvent.click(screen.getByText("docker-host"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "docker-host" })).toBeInTheDocument();
  });

  it("shows empty state when no nodes are available", async () => {
    vi.mocked(getInfrastructure).mockResolvedValue({
      nodes: [],
      collectedAt: null,
      integrationId: null,
      healthStatus: "unknown",
      lastError: null,
      clusterStorages: [],
      warnings: [],
    });

    render(
      <MemoryRouter>
        <InfrastructurePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No nodes connected")).toBeInTheDocument();
    expect(screen.getByText("Configure Proxmox")).toBeInTheDocument();
  });
});
