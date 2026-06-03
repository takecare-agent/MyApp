# TakeCare Mobile (Expo Go)

This is the React Native mobile app for quick testing with Expo Go.

## Run

```bash
npm install
npm run start:tunnel
```

Then scan the QR code in Expo Go on iOS or Android.

## Backend requirement

Start backend in `../backend`:

```bash
npm install
npm run dev
```

Use your computer LAN IP in the app login screen:

`http://<your-lan-ip>:5000`

Do not use `localhost` on phone.

## Login flow for mobile testing

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

It creates/updates the user and returns a JWT token for test usage.
