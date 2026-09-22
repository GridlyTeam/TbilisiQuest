# Mobile app setup (Android)

The player app uses MapLibre, which is a native module. Expo Go cannot load it,
so you need a **development build** -- your own APK with the native code
compiled in. You build it once; after that, JavaScript changes hot-reload over
Wi-Fi exactly like Expo Go.

## 1. Expo account

```bash
npx eas-cli login
```

Free. Sign up at expo.dev if you don't have one.

## 2. Build the APK

From `apps/mobile`:

```bash
npx eas-cli build --profile development --platform android
```

First run asks to generate an Android keystore -- say yes, EAS stores it.

The build runs on Expo's servers and takes roughly 10-20 minutes on the free
tier. You get a URL and a QR code when it finishes.

## 3. Install on your phone

Open the build URL on the phone and install the APK. Android will warn about
installing outside the Play Store -- expected for a development build.

## 4. Run the dev server

From `apps/mobile`:

```bash
npx expo start --dev-client
```

Open the app on your phone and it connects over Wi-Fi. From here every JS
change reloads instantly; you only rebuild the APK when native dependencies
change.

## Testing the location mechanics

Walking around Tbilisi is the real test, but for desk work Android lets you
fake a position:

1. **Settings -> About phone**, tap **Build number** seven times to unlock
   Developer options.
2. Install any "mock location" app from the Play Store.
3. **Developer options -> Select mock location app**, choose it.
4. Set your position to a seeded venue:

| Venue | Latitude | Longitude |
|---|---|---|
| Fabrika Coffee Room | 41.7060 | 44.7975 |
| Rustaveli Bakery | 41.6977 | 44.7995 |
| Abanotubani Tea House | 41.6890 | 44.8090 |
| Vake Wine Bar | 41.7095 | 44.7605 |
| Marjanishvili Salon | 41.7085 | 44.7965 |
| Dry Bridge Bistro | 41.6975 | 44.8060 |

Move to within 100 m and the marker reveals. Within 20 m the claim button
enables.

## What to expect

- **Map** -- dark basemap, markers coloured by rarity. Undiscovered drops show
  `?`; revealed ones show the discount and venue name.
- **Tap a marker** -- detail sheet with remaining stock, distance and a
  countdown. Claim is disabled until you are inside the radius.
- **Vouchers** -- claimed vouchers; tapping one opens the geofenced scanner.
- **Profile** -- level, XP progress, streak, language toggle.

## Full loop test

1. Portal (laptop): create a drop that is live now.
2. Phone: walk or mock-locate to the venue, claim it.
3. Portal (tablet or second browser): open the Counter screen.
4. Phone: Vouchers -> tap the voucher -> scan the counter QR.
5. Portal: Analytics now shows a redemption.

That exercises every part of the system: fog of war, the geofence, atomic
allocation, the rotating counter code, and the analytics funnel.

## Push notifications

The daily "drops are live" notification is the app's one push, sent at 13:55
Tbilisi time and only when drops are actually live with stock left. Everything
else in the app is pull.

### What is already built
- `src/lib/usePushToken.ts` asks for permission after sign-in, registers an
  Expo push token and stores it through `set_push_token()`.
- `push_outbox` plus `enqueue_drop_notifications()` and `flush_push_outbox()`
  (migration 0023), scheduled with pg_cron.

### What you have to do once
Expo delivers to Android through Firebase, so Google has to be told your app
exists before anything arrives on a phone.

1. Create a Firebase project at <https://console.firebase.google.com>, add an
   **Android app** with package name `com.gridly.tbilisiquest` (match
   `android.package` in `app.json`).
2. Download `google-services.json` and put it at `apps/mobile/google-services.json`.
   It is not a secret, but keep it out of screenshots.
3. In the Firebase console open **Project settings → Cloud Messaging** and
   enable the **Firebase Cloud Messaging API (V1)** if it is not already on.
4. Upload the service account key to Expo so its servers can send on your
   behalf:

   ```
   npx eas credentials -p android
   # → Push Notifications: Manage your FCM V1 service account key
   ```

   The JSON key comes from Firebase: **Project settings → Service accounts →
   Generate new private key**.
5. Rebuild: `eas build -p android --profile preview`. Push cannot work in a
   build made before `expo-notifications` was installed.

### Checking it works
```sql
-- Should return the number of rows queued.
select public.enqueue_drop_notifications();
-- Runs every minute anyway; call it to skip the wait.
select public.flush_push_outbox();
select status, count(*) from public.push_outbox group by status;
```

A device that never appears in `public.users.push_token` did not get past the
permission prompt, or is a simulator — `usePushToken` skips those deliberately.

## Build-time configuration

The app reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` at
startup and throws if either is missing — which, on a device, looks exactly
like a native crash: the Supabase client is imported while expo-router is still
building its route tree, so the app dies before any screen renders.

`apps/mobile/.env` is gitignored and is **not** uploaded to EAS. Build-time
values live as EAS environment variables instead:

```
npx eas-cli env:list
npx eas-cli env:create --environment preview \
  --name EXPO_PUBLIC_SUPABASE_URL --value "https://…" --visibility plaintext
```

They are set for the `development`, `preview` and `production` environments. A
new one has to be added to each environment that needs it.

### Archive size
`.easignore` lives at the **repository root**, not in `apps/mobile`. EAS
archives from the git root in a monorepo and reads ignore rules from there; a
copy inside the app directory is never consulted. Getting this wrong costs
about eight minutes of upload per build.
