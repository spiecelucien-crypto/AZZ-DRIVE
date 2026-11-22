import Foundation

/// Données publiées pour les proches qui suivent le trajet.
/// Volontairement compactes : quelques centaines d'octets toutes les 15 secondes.
struct TripSnapshot: Codable, Equatable {
    enum Status: String, Codable { case enRoute = "en_route", pause, arrive, termine }

    var driver: String
    var destination: String
    var lat: Double
    var lon: Double
    var heading: Double
    var speedKmh: Int
    var remainingMeters: Int
    /// Heure d'arrivée estimée (millisecondes depuis 1970, lisible directement en JavaScript).
    var etaMs: Int64
    var progress: Double
    var status: Status
    var vehicle: String
    var updatedMs: Int64
}

struct TripReaction: Codable, Equatable {
    var emoji: String
    var from: String
    var atMs: Int64
}

/// Décide quand publier une mise à jour : assez souvent pour que le suivi soit vivant,
/// assez rarement pour ne coûter ni batterie, ni données, ni fluidité.
struct ShareThrottle {
    var minInterval: TimeInterval = 5
    var maxInterval: TimeInterval = 15
    var distanceTrigger: Double = 300

    private var lastTime: TimeInterval?
    private var lastPoint: GeoPoint?
    private var lastStatus: TripSnapshot.Status?

    init(minInterval: TimeInterval = 5, maxInterval: TimeInterval = 15, distanceTrigger: Double = 300) {
        self.minInterval = minInterval
        self.maxInterval = maxInterval
        self.distanceTrigger = distanceTrigger
    }

    mutating func shouldPublish(point: GeoPoint, status: TripSnapshot.Status, time: TimeInterval) -> Bool {
        guard let lastTime, let lastPoint else { return commit(point, status, time) }
        if status != lastStatus { return commit(point, status, time) }
        let elapsed = time - lastTime
        if elapsed < minInterval { return false }
        if elapsed >= maxInterval || Geo.distance(lastPoint, point) >= distanceTrigger {
            return commit(point, status, time)
        }
        return false
    }

    private mutating func commit(_ p: GeoPoint, _ s: TripSnapshot.Status, _ t: TimeInterval) -> Bool {
        lastTime = t
        lastPoint = p
        lastStatus = s
        return true
    }
}

enum TripID {
    /// Identifiant aléatoire non devinable (22 caractères, ~128 bits).
    static func make() -> String {
        let alphabet = Array("abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        var g = SystemRandomNumberGenerator()
        return String((0..<22).map { _ in alphabet[Int(g.next() % UInt64(alphabet.count))] })
    }
}
