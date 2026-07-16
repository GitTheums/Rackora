import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("@/lib/api", () => ({
  getOverview: vi.fn().mockResolvedValue({
    proxmox: {
      connected: false,
      message: "No Proxmox integration configured",
    },
  }),
  getInfrastructure: vi.fn().mockResolvedValue({ nodes: [] }),
  getCurrentUser: vi.fn(),
  getSetupStatus: vi.fn(),
}));

afterEach(() => {
  document.documentElement.classList.remove("dark");
  window.localStorage.clear();
});

describe("App dashboard shell", () => {
  it("renders the sidebar navigation and topbar health status", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Overview" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Infrastructure" }).length,
    ).toBeGreaterThan(0);
    expect(
      await screen.findByText("Proxmox not connected"),
    ).toBeInTheDocument();
  });

  it("shows a loading skeleton and then the overview content", async () => {
    render(<App />);

    expect(screen.getAllByTestId("loading-skeleton").length).toBeGreaterThan(0);

    expect(
      await screen.findByText("Proxmox unavailable"),
    ).toBeInTheDocument();
  });
});
