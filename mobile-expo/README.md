# TakeCare Mobile (React Native CLI)

This is the native React Native mobile app for Android and iOS.

## Install

```bash
npm install
```

If you need to add the native packages manually:

```bash
npm install react-native-vector-icons
npm install --save-dev @react-native/metro-config@0.81.5 @react-native/babel-preset@0.81.5 @react-native-community/cli@20.0.0 @react-native-community/cli-platform-android@20.0.0 @react-native-community/cli-platform-ios@20.0.0
```

## Run

```bash
npm run start
npm run android
```

For iOS, run this on macOS with CocoaPods set up:

```bash
npm run ios
```

## Backend Requirement

Start backend in `../backend`:

```bash
npm install
npm run dev
```

Start web frontend in `../frontend`:

```bash
npm install
npm run dev
```

Use your computer LAN IP in the app login screen:

`http://<your-lan-ip>:5000`

Use the matching web frontend URL:

`http://<your-lan-ip>:5173`

Do not use `localhost` on a physical phone. For the Android emulator on the same computer, `http://10.0.2.2:5173` can also reach the host machine.

## Login Flow For Mobile Testing

The app uses:

`POST /mobile/dev-login`

with:

```json
{
  "email": "patient@test.com",
  "name": "Mobile Tester",
  "role": "patient"
}
```

It creates or updates the user and returns a JWT token for test usage.
