import type { PublicProfile } from "./types";

export function nameOf(profile: PublicProfile | null | undefined): string {
  return profile?.displayName || profile?.username || "someone";
}

export function initialOf(profile: PublicProfile | null | undefined): string {
  return nameOf(profile).charAt(0).toUpperCase();
}

const DATE = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

export function formatDate(iso: string | null | undefined): string {
  return iso ? DATE.format(new Date(iso)) : "";
}

// "5 minutes ago", "3 days ago", or the date once it is more than a month old
export function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
  ];
  for (let i = units.length - 1; i >= 0; i--) {
    const [size, name] = units[i];
    if (seconds >= size) {
      const count = Math.floor(seconds / size);
      if (name === "day" && count > 30) return formatDate(iso);
      return `${count} ${name}${count === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}
