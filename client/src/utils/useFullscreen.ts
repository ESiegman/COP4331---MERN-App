import { useCallback, useEffect, useRef, useState } from "react";

// Full screen for one element. Where the browser allows it (desktop, Android, iPad) that is real
// full screen. Where it doesn't (iPhone Safari, and the Android app's WebView) the element fills
// the page instead, so the button works everywhere. Escape leaves either one.
export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [native, setNative] = useState(false);
  const [covering, setCovering] = useState(false);

  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement !== null && document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // The "covers the page" version has to handle Escape and page scrolling itself
  useEffect(() => {
    if (!covering) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCovering(false);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [covering]);

  const enter = useCallback(async () => {
    const element = ref.current;
    if (!element) return;
    if (document.fullscreenEnabled && element.requestFullscreen) {
      try {
        await element.requestFullscreen();
        return;
      } catch {
        // Refused (a blocked frame, or a browser that says yes and then no): cover the page instead
      }
    }
    setCovering(true);
  }, []);

  const exit = useCallback(async () => {
    setCovering(false);
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Already out
      }
    }
  }, []);

  const active = native || covering;
  const toggle = useCallback(() => void (active ? exit() : enter()), [active, enter, exit]);

  return { ref, active, covering, toggle };
}
