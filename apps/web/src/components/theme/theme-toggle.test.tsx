import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "./theme-provider";
import { ThemeToggle } from "./theme-toggle";

afterEach(() => {
  document.documentElement.classList.remove("dark");
  window.localStorage.clear();
});

describe("ThemeToggle", () => {
  it("toggles the dark class on the document root", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    expect(document.documentElement.classList.contains("dark")).toBe(false);

    fireEvent.click(
      screen.getByRole("button", { name: /switch to dark mode/i }),
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("rackora-theme")).toBe("dark");

    fireEvent.click(
      screen.getByRole("button", { name: /switch to light mode/i }),
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
