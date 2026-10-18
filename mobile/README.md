# Parent app

Expo SDK 58 parent app for the School Payment Request demo. It uses React Native 0.88 and React 19.3.

## Run in the iOS Simulator

Start the FastAPI demo server on `127.0.0.1:8000`, then run:

```sh
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000 ../scripts/with-node npm run ios
```

The app sends the selected demo parent ID in `X-Demo-User-Id`. The simulator uses `127.0.0.1` to reach the Mac. Select Parent A or Parent B from the Account tab.

## Checks

```sh
../scripts/with-node npm run test:ci
../scripts/with-node npm run typecheck
../scripts/with-node npm run lint
npx expo install --check
npx expo-doctor
```

All application data comes from the API. Payments are simulated, and the app never charges money.
