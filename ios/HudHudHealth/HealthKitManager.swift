import Foundation
import HealthKit

@MainActor
final class HealthKitManager: ObservableObject {
    @Published private(set) var authorized = false
    @Published private(set) var lastSync: Date?
    @Published private(set) var status = "Not connected"

    private let store = HKHealthStore()
    private let readTypes: Set<HKObjectType> = [
        HKObjectType.quantityType(forIdentifier: .stepCount)!,
        HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
        HKObjectType.quantityType(forIdentifier: .heartRate)!,
        HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
        HKObjectType.quantityType(forIdentifier: .dietaryEnergyConsumed)!,
        HKObjectType.quantityType(forIdentifier: .dietaryProtein)!,
        HKObjectType.workoutType(),
        HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
    ]

    func connect() async {
        guard HKHealthStore.isHealthDataAvailable() else { status = "Apple Health is unavailable on this device."; return }
        do {
            try await store.requestAuthorization(toShare: [], read: readTypes)
            authorized = true
            status = "Apple Health connected"
        } catch { status = "Authorization failed: \(error.localizedDescription)" }
    }

    func sync(accessToken: String, endpoint: URL = URL(string: "https://hudhudhq.vercel.app/api/health-sync")!) async {
        guard authorized else { status = "Connect Apple Health first."; return }
        do {
            let start = Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? Date()
            var samples: [[String: Any]] = []
            for type in readTypes {
                if let quantity = type as? HKQuantityType { samples.append(contentsOf: try await queryQuantity(quantity, start: start)) }
                else if let category = type as? HKCategoryType, category.identifier == HKCategoryTypeIdentifier.sleepAnalysis.rawValue { samples.append(contentsOf: try await querySleep(category, start: start)) }
            }
            var request = URLRequest(url: endpoint)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["samples": samples, "permissions": ["activity": true, "heart": true, "nutrition": true, "sleep": true], "metadata": ["client": "HudHud Health iOS"]])
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw NSError(domain: "HudHudHealth", code: 1, userInfo: [NSLocalizedDescriptionKey: "HudHud sync failed."]) }
            lastSync = Date()
            status = "Synced \(samples.count) health samples"
        } catch { status = "Sync failed: \(error.localizedDescription)" }
    }

    private func queryQuantity(_ type: HKQuantityType, start: Date) async throws -> [[String: Any]] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                if let error { continuation.resume(throwing: error); return }
                let rows = (samples as? [HKQuantitySample] ?? []).map { sample -> [String: Any] in
                    let identifier = sample.quantityType.identifier
                    let unit: HKUnit
                    switch identifier {
                    case HKQuantityTypeIdentifier.heartRate: unit = HKUnit.count().unitDivided(by: .minute())
                    case HKQuantityTypeIdentifier.activeEnergyBurned, HKQuantityTypeIdentifier.dietaryEnergyConsumed: unit = .kilocalorie()
                    case HKQuantityTypeIdentifier.dietaryProtein: unit = .gram()
                    case HKQuantityTypeIdentifier.distanceWalkingRunning: unit = .meter()
                    default: unit = .count()
                    }
                    return ["sample_type": self.normalized(identifier), "external_id": sample.uuid.uuidString, "value": sample.quantity.doubleValue(for: unit), "unit": unit.unitString, "started_at": ISO8601DateFormatter().string(from: sample.startDate), "ended_at": ISO8601DateFormatter().string(from: sample.endDate), "source_name": sample.sourceRevision.source.name]
                }
                continuation.resume(returning: rows)
            }
            store.execute(query)
        }
    }

    private func querySleep(_ type: HKCategoryType, start: Date) async throws -> [[String: Any]] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                if let error { continuation.resume(throwing: error); return }
                let rows = (samples as? [HKCategorySample] ?? []).map { ["sample_type": "sleep", "external_id": $0.uuid.uuidString, "value": $0.endDate.timeIntervalSince($0.startDate), "unit": "seconds", "started_at": ISO8601DateFormatter().string(from: $0.startDate), "ended_at": ISO8601DateFormatter().string(from: $0.endDate), "source_name": $0.sourceRevision.source.name] as [String : Any] }
                continuation.resume(returning: rows)
            }
            store.execute(query)
        }
    }

    private func normalized(_ identifier: String) -> String {
        switch identifier {
        case HKQuantityTypeIdentifier.stepCount: return "step_count"
        case HKQuantityTypeIdentifier.activeEnergyBurned: return "active_energy"
        case HKQuantityTypeIdentifier.heartRate: return "heart_rate"
        case HKQuantityTypeIdentifier.distanceWalkingRunning: return "walking_running_distance"
        case HKQuantityTypeIdentifier.dietaryEnergyConsumed: return "dietary_energy"
        case HKQuantityTypeIdentifier.dietaryProtein: return "dietary_protein"
        default: return identifier
        }
    }
}