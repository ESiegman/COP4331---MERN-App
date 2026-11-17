// Links that open the app (emailed verification and reset links, mernstackandroidmobileapp://...)
// are for the website inside the WebView, not for this app's own screens. Without this, Expo
// Router would look for a screen called /verify-email and show "not found". The WebView screen
// reads the link itself (see (auth)/index.tsx), so the router just stays on the home screen.
export function redirectSystemPath() {
  return "/";
}
