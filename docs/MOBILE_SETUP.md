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
