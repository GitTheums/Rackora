import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the Rackora brand and headline", () => {
    render(<App />);

    expect(screen.getByText("Rackora")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /your homelab, at a glance/i }),
    ).toBeInTheDocument();
  });
});
