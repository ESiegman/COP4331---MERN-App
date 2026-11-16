import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "./api";
import type { Page } from "./types";

// Loads a cursor-paginated list endpoint and appends pages as the user asks for more.
// `route` is the endpoint with its filters already in the query string, without cursor or limit.
// Changing `route` starts over from the first page.
export function usePagedList<T>(route: string | null, limit = 12) {
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(route !== null);
  const [error, setError] = useState("");
  // Ignores answers to requests that were replaced by a newer one
  const requestId = useRef(0);

  const load = useCallback(
    async (cursor: string | null) => {
      if (route === null) return;
      const id = ++requestId.current;
      setLoading(true);
      setError("");

      const joiner = route.includes("?") ? "&" : "?";
      const cursorPart = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const res = await apiFetch<Page<T>>(`${route}${joiner}limit=${limit}${cursorPart}`);
      if (id !== requestId.current) return;

      if (res.ok) {
        setItems((current) => (cursor ? [...current, ...res.data.items] : res.data.items));
        setNextCursor(res.data.nextCursor);
      } else {
        setError(res.error ?? "Could not load this list");
      }
      setLoading(false);
    },
    [route, limit]
  );

  useEffect(() => {
    // A new route starts over at the first page; the old items stay until it answers
    // load() flags itself as loading before it asks the API: that is the point of this effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(null);
  }, [load]);

  return {
    items,
    setItems,
    loading,
    error,
    hasMore: nextCursor !== null,
    loadMore: () => void load(nextCursor),
    reload: () => void load(null),
  };
}
