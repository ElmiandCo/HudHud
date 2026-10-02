# HudHud Health — native Apple companion

Architecture:

Apple Watch → Apple Health → HudHud Health iPhone app → /api/health-sync → Supabase → HudHud HQ.

Apple requires the HealthKit capability and explicit user authorization for each health data type. Watch Connectivity provides the iPhone/watchOS communication layer.

## Xcode setup

1. Create an iOS SwiftUI app named HudHudHealth and add these Swift files to the target.
2. Add the HealthKit capability.
3. Add Watch Connectivity and create a companion watchOS target.
4. Add NSHealthShareUsageDescription:
   HudHud Health uses your Apple Health data to show your activity, nutrition and wellness context in HudHud.
5. Add the corresponding HealthKit capability/entitlement to the watch target if the watch app reads HealthKit directly.
6. Add the native HudHud/Supabase authentication flow so the app can obtain the signed-in user's access token.
7. Pass that access token to HealthKitManager.sync(accessToken:). Never hard-code a token.
8. Configure the App ID, signing, provisioning, privacy policy and App Store/TestFlight metadata in Apple Developer/Xcode.

The web site intentionally does not get direct browser access to Apple Health. HealthKit authorization stays on Apple's platform and the user's permission controls what HudHud receives.

## Watch target

The watch target can read supported HealthKit data and use WCSession background transfers to communicate with the iPhone companion. The iPhone remains the bridge to HudHud HQ.