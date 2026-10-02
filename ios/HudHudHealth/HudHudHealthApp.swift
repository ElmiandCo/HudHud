import SwiftUI

@main
struct HudHudHealthApp: App {
    @StateObject private var health = HealthKitManager()
    @StateObject private var watch = WatchConnectivityManager()

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                HudHudHealthView()
                    .environmentObject(health)
                    .environmentObject(watch)
            }
        }
    }
}

struct HudHudHealthView: View {
    @EnvironmentObject private var health: HealthKitManager
    @EnvironmentObject private var watch: WatchConnectivityManager

    var body: some View {
        List {
            Section("Apple Watch") {
                Label(watch.paired ? "Watch paired" : "No paired Watch", systemImage: "applewatch")
                Label(watch.watchAppInstalled ? "HudHud Watch app installed" : "Watch companion not installed", systemImage: "checkmark.circle")
                Label(watch.reachable ? "Watch reachable" : "Background connection", systemImage: "antenna.radiowaves.left.and.right")
            }
            Section("HudHud Health") {
                Text(health.status)
                Button("Connect Apple Health") {
                    Task { await health.connect() }
                }
                Button("Sync to HudHud HQ") {
                    // Supply the signed-in Supabase access token from the native auth session.
                    // Never hard-code or paste a token into the app.
                }
            }
        }
        .navigationTitle("HudHud Health")
    }
}