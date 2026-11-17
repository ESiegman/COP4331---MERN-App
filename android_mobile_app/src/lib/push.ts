import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { API_URL } from "./site";

// Show a notification that arrives while the app is open too
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Asks for permission and returns this phone's Expo push token, or null if it can't have one
// (an emulator, permission refused, or the project has no EAS id yet).
export async function getPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  if (Platform.OS === "android") {
    // Android needs a channel before it shows anything
    await Notifications.setNotificationChannelAsync("default", {
      name: "Tier List",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;

  try {
    // The project id comes from app.json (extra.eas.projectId), set by `eas init`
    return (await Notifications.getExpoPushTokenAsync()).data;
  } catch (error) {
    console.warn("No push token:", error);
    return null;
  }
}

async function callApi(path: string, method: string, loginToken: string, body?: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${loginToken}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// POST /api/users/me/push-tokens. Registering the same phone twice is harmless.
export const registerPushToken = (loginToken: string, pushToken: string) =>
  callApi("/users/me/push-tokens", "POST", loginToken, { token: pushToken });

// DELETE /api/users/me/push-tokens, for logout. Needs the login token that was valid until now.
export const removePushToken = (loginToken: string, pushToken: string) =>
  callApi("/users/me/push-tokens", "DELETE", loginToken, { token: pushToken });

// PATCH /api/notifications/:id: the apps mark a notification read when its push is opened
export const markNotificationRead = (loginToken: string, notificationId: string) =>
  callApi(`/notifications/${encodeURIComponent(notificationId)}`, "PATCH", loginToken, { read: true });
