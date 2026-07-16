import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState } from "./states";

describe("state components", () => {
  it("renders an empty state with title and description", () => {
    render(
      <EmptyState title="No checks configured" description="Add one to start." />,
    );

    expect(screen.getByText("No checks configured")).toBeInTheDocument();
    expect(screen.getByText("Add one to start.")).toBeInTheDocument();
  });

  it("renders an error state and calls onRetry when clicked", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
