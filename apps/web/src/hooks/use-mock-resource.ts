import { useEffect, useState } from "react";

export type ResourceState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "error"; data: null; error: Error }
  | { status: "success"; data: T; error: null };

interface Options {
  /** Simulated network delay in milliseconds. */
  delayMs?: number;
  /** When true, resolve with an error instead of the value. */
  fail?: boolean;
}

/**
 * Simulate loading typed mock data asynchronously so the UI can exercise its
 * loading, error and success states. This is a temporary stand-in for the real
 * data layer and keeps components ready for a drop-in replacement.
 */
export function useMockResource<T>(
  value: T,
  options: Options = {},
): ResourceState<T> {
  const { delayMs = 350, fail = false } = options;
  const [state, setState] = useState<ResourceState<T>>({
    status: "loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null, error: null });

    const timer = setTimeout(() => {
      if (!active) {
        return;
      }
      if (fail) {
        setState({
          status: "error",
          data: null,
          error: new Error("Failed to load data from the Rackora agent."),
        });
      } else {
        setState({ status: "success", data: value, error: null });
      }
    }, delayMs);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [value, delayMs, fail]);

  return state;
}
