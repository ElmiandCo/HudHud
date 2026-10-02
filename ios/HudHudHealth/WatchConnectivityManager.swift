import Foundation
import WatchConnectivity

final class WatchConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    @Published private(set) var paired = false
    @Published private(set) var watchAppInstalled = false
    @Published private(set) var reachable = false

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            self.paired = session.isPaired
            self.watchAppInstalled = session.isWatchAppInstalled
            self.reachable = session.isReachable
        }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { self.reachable = session.isReachable }
    }

    func sendContext(_ values: [String: Any]) {
        guard WCSession.default.activationState == .activated else { return }
        try? WCSession.default.updateApplicationContext(values)
    }
}