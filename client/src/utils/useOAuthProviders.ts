import { useEffect, useState } from "react";
import { fetchProviders, type OAuthProviderInfo } from "./oauth";

// The providers the server has set up. Empty until the answer arrives, and empty if it fails,
// so a button only ever shows for a provider that works.
export function useOAuthProviders() {
  const [providers, setProviders] = useState<OAuthProviderInfo[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchProviders().then((list) => {
      if (cancelled) return;
      setProviders(list);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { providers, loaded };
}
