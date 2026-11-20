// Messages the website (client/src/utils/nativeApp.ts) sends to the app through the WebView.
export type AppMessage =
  | { type: "session"; token: string | null }
  | { type: "share-image"; fileName: string; dataUrl: string; title: string };

export function parseAppMessage(raw: string): AppMessage | null {
  try {
    const message = JSON.parse(raw) as Partial<AppMessage> | null;
    if (message?.type === "session") {
      return { type: "session", token: typeof message.token === "string" && message.token ? message.token : null };
    }
    if (message?.type === "share-image" && typeof message.dataUrl === "string") {
      return {
        type: "share-image",
        dataUrl: message.dataUrl,
        fileName: typeof message.fileName === "string" ? message.fileName : "tier-list.png",
        title: typeof message.title === "string" ? message.title : "Tier list",
      };
    }
  } catch {
    // Not JSON: not one of ours
  }
  return null;
}

// Runs inside the page when it loads, so the app learns about a login that already exists.
// (After that, the site reports every login and logout itself.)
export const REPORT_SESSION_SCRIPT = `
(function () {
  try {
    var stored = window.localStorage.getItem("tierlist_session");
    var token = stored ? JSON.parse(stored).token || null : null;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "session", token: token }));
  } catch (e) {}
})();
true;
`;
