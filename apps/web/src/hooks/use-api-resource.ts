import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  /** Time before a background refetch is allowed (ms). */
  staleTime?: number;
  /** Periodic refetch interval (ms). Set to 0 to disable. */
  refetchInterval?: number;
  /** Keep last successful payload when a refetch fails. */
  keepPreviousOnError?: boolean;
}

export type ApiResourceState<T> =
  | { status: "loading"; data: T | null; error: null }
  | { status: "error"; data: null; error: Error }
  | { status: "success"; data: T; error: null };

/**
 * Fetch typed API data with loading/error states, abort on unmount, and
 * optional stale-aware background refetching.
 */
export function useApiResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: Options = {},
): ApiResourceState<T> & { refetch: () => void; stale: boolean } {
  const {
    staleTime = 30_000,
    refetchInterval = 60_000,
    keepPreviousOnError = true,
  } = options;
  const [state, setState] = useState<ApiResourceState<T>>({
    status: "loading",
    data: null,
    error: null,
  });
  const [stale, setStale] = useState(false);
  const lastFetchedAt = useRef(0);
  const hasData = useRef(false);
  const previousData = useRef<T | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async (signal: AbortSignal, force = false) => {
    const now = Date.now();
    if (
      !force &&
      hasData.current &&
      now - lastFetchedAt.current < staleTime
    ) {
      return;
    }

    setState((current) =>
      current.status === "success"
        ? current
        : previousData.current !== null && keepPreviousOnError
          ? {
              status: "loading",
              data: previousData.current,
              error: null,
            }
          : { status: "loading", data: null, error: null },
    );

    try {
      const data = await fetcherRef.current(signal);
      if (signal.aborted) {
        return;
      }
      lastFetchedAt.current = Date.now();
      hasData.current = true;
      previousData.current = data;
      setStale(false);
      setState({ status: "success", data, error: null });
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      if (keepPreviousOnError && previousData.current !== null) {
        setStale(true);
        setState({
          status: "success",
          data: previousData.current,
          error: null,
        });
        return;
      }
      setState({
        status: "error",
        data: null,
        error: error instanceof Error ? error : new Error("Request failed"),
      });
    }
  }, [keepPreviousOnError, staleTime]);

  const refetch = useCallback(() => {
    const controller = new AbortController();
    void load(controller.signal, true);
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal, true);

    const interval =
      refetchInterval > 0
        ? window.setInterval(() => {
            void load(controller.signal);
          }, refetchInterval)
        : undefined;

    return () => {
      controller.abort();
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
    };
  }, [load, refetchInterval]);

  return { ...state, refetch, stale };
}
