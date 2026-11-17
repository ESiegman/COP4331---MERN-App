// The website this app wraps, and the API behind it
export const SITE_URL = "https://mern.esiegman.dev";
export const SITE_HOST = "mern.esiegman.dev";
export const API_URL = `${SITE_URL}/api`;

// The link scheme from app.json ("scheme")
export const APP_SCHEME = "mernstackandroidmobileapp";

// Added to the WebView's user agent. The site looks for it to hide the Google button
// (client/src/utils/oauth.ts), because Google refuses to sign in inside a WebView.
export const USER_AGENT_NAME = "TierListApp";
