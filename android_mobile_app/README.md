# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **src/app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **example** directory and create a blank **src/app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## This app

The app is the website (`https://mern.esiegman.dev`) in a WebView, plus a few things a WebView can't do alone:

- **Push notifications.** The site reports the login token to the app (`src/lib/bridge.ts`). The app asks for permission, gets an Expo push token and sends it to `POST /api/users/me/push-tokens`, and removes it with `DELETE` on logout. Tapping a notification opens its ranking (or the notifications list).
- **Emailed links.** Verification and password reset links open in the app (`android.intentFilters` in `app.json`, handled in `src/app/(auth)/index.tsx`). `mernstackandroidmobileapp://` links work too.
- **Share as image.** The site sends the picture to the app, which opens the phone's share sheet.
- **Photo upload.** The site's Upload buttons show the phone's gallery or camera.
- **Google sign-in** is hidden inside the app, because Google blocks it in a WebView. The app adds `TierListApp` to the user agent so the site can tell.

### Before push notifications and email links work on a phone

These need things that only the app's owner can supply:

1. Run `eas init` so `app.json` gets `extra.eas.projectId`. Without it the app can't get a push token.
2. Set `android.package` in `app.json`, add a Firebase `google-services.json` and point `android.googleServicesFile` at it (Expo's [push credentials guide](https://docs.expo.dev/push-notifications/fcm-credentials/)).
3. For emailed links to open the app and not the browser, serve `https://mern.esiegman.dev/.well-known/assetlinks.json` with the package name and the app's signing certificate SHA-256 fingerprint ([Android App Links](https://developer.android.com/training/app-links/verify-android-applinks)). Until then Android may open them in the browser.

Push notifications and the camera need a development build; Expo Go can't test them.
