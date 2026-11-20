// The Android app is this site inside a WebView. The WebView gives the page a
// window.ReactNativeWebView object, and anything posted to it reaches the app.
// Everything here is a no-op in a normal browser.

interface NativeBridge {
  postMessage: (message: string) => void;
}

// Messages the page sends to the app. Keep in step with android_mobile_app/src/lib/bridge.ts.
export type AppMessage =
  | { type: "session"; token: string | null }
  | { type: "share-image"; fileName: string; dataUrl: string; title: string };

function bridge(): NativeBridge | null {
  const candidate = (window as unknown as { ReactNativeWebView?: NativeBridge }).ReactNativeWebView;
  return candidate && typeof candidate.postMessage === "function" ? candidate : null;
}

export function isInApp(): boolean {
  return bridge() !== null;
}

// Returns false when there is no app to receive it
export function postToApp(message: AppMessage): boolean {
  const target = bridge();
  if (!target) return false;
  try {
    target.postMessage(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the image"));
    reader.readAsDataURL(blob);
  });
}
