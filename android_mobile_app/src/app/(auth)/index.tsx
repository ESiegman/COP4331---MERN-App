import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { Alert, BackHandler, StatusBar, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { parseAppMessage, REPORT_SESSION_SCRIPT } from "@/lib/bridge";
import { pathForNotification, pathFromLink } from "@/lib/links";
import { getPushToken, markNotificationRead, registerPushToken, removePushToken } from "@/lib/push";
import { shareImageFromDataUrl } from "@/lib/shareImage";
import { SITE_URL, USER_AGENT_NAME } from "@/lib/site";

export default function Index() {
  const webView = useRef<ComponentRef<typeof WebView>>(null);
  const pageLoaded = useRef(false);
  const canGoBack = useRef(false);
  const [startPath, setStartPath] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // The login token the site reported, and this phone's push token once both are known
  const loginToken = useRef<string | null>(null);
  const pushToken = useRef<string | null>(null);

  const openPath = useCallback((path: string) => {
    if (pageLoaded.current && webView.current) {
      webView.current.injectJavaScript(`window.location.assign(${JSON.stringify(path)}); true;`);
    } else {
      // Not loaded yet: start the site on that page instead
      setStartPath(path);
    }
  }, []);

  // Links that open the app: emailed verification and reset links, and mernstackandroidmobileapp://
  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      const path = url ? pathFromLink(url) : null;
      if (path) openPath(path);
      setReady(true);
    });
    const subscription = Linking.addEventListener("url", ({ url }) => {
      const path = pathFromLink(url);
      if (path) openPath(path);
    });
    return () => subscription.remove();
  }, [openPath]);

  // Tapping a push notification opens that ranking (or the notifications list)
  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!lastResponse || lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const data = lastResponse.notification.request.content.data as Record<string, unknown> | undefined;
    openPath(pathForNotification(data));
    const notificationId = data?.notificationId;
    if (typeof notificationId === "string" && loginToken.current) {
      void markNotificationRead(loginToken.current, notificationId);
    }
    void Notifications.clearLastNotificationResponseAsync();
  }, [lastResponse, openPath]);

  // The phone's push token: asked for once, then sent to the API for whoever is logged in
  useEffect(() => {
    void getPushToken().then((token) => {
      pushToken.current = token;
      if (token && loginToken.current) void registerPushToken(loginToken.current, token);
    });
  }, []);

  function onSession(token: string | null) {
    const previous = loginToken.current;
    if (token === previous) return;
    loginToken.current = token;

    if (token && pushToken.current) {
      void registerPushToken(token, pushToken.current);
    } else if (!token && previous && pushToken.current) {
      // Logged out: stop this phone's notifications. The old token still works for this one request.
      void removePushToken(previous, pushToken.current);
    }
  }

  function onMessage(event: WebViewMessageEvent) {
    const message = parseAppMessage(event.nativeEvent.data);
    if (!message) return;

    if (message.type === "session") {
      onSession(message.token);
    } else if (message.type === "share-image") {
      shareImageFromDataUrl(message.dataUrl, message.fileName, message.title).catch(() => {
        Alert.alert("Couldn't share the image", "Try again, or open the site in your browser.");
      });
    }
  }

  // The Android back button goes back inside the site first
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack.current && webView.current) {
        webView.current.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, []);

  // Wait for the link that opened the app (if any) so the site loads on the right page the first time
  if (!ready) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <WebView
        ref={webView}
        source={{ uri: `${SITE_URL}${startPath ?? ""}` }}
        applicationNameForUserAgent={`${USER_AGENT_NAME}/1.0`}
        javaScriptEnabled
        domStorageEnabled
        // Lets the site's picture buttons open the phone's gallery or camera
        allowFileAccess
        mediaPlaybackRequiresUserAction
        injectedJavaScript={REPORT_SESSION_SCRIPT}
        onMessage={onMessage}
        onNavigationStateChange={(state) => {
          canGoBack.current = state.canGoBack;
        }}
        onLoadEnd={() => {
          pageLoaded.current = true;
        }}
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: StatusBar.currentHeight ?? 0, backgroundColor: "#12131a" },
  web: { flex: 1 },
});
