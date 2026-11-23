import Foundation
import QuartzCore

/// Limitation de vitesse de la route en cours, d'après OpenStreetMap (API Overpass, gratuite).
///
/// Apple Plans ne fournit pas les limitations : on interroge OpenStreetMap au plus
/// toutes les 8 s et seulement après ~120 m parcourus, une requête à la fois.
/// Les routes reçues (rayon 60 m) sont gardées en mémoire : entre deux requêtes,
/// on recalcule localement la route correspondante, sans réseau.
@MainActor
final class SpeedLimitService: ObservableObject {
    @Published private(set) var limitKmh: Int?

    var isEnabled = true {
        didSet { if !isEnabled { reset() } }
    }

    private var throttle = SpeedLimit.QueryThrottle()
    private var ways: [SpeedLimit.Way] = []
    private var inFlight = false
    /// Serveurs Overpass publics : on passe au suivant si l'un est saturé.
    private let endpoints = ["https://overpass-api.de/api/interpreter",
                             "https://overpass.private.coffee/api/interpreter",
                             "https://overpass.kumi.systems/api/interpreter"].compactMap(URL.init(string:))
    private var endpointIndex = 0
    private var demoLimit: Int?

    /// Démo (captures d'écran) : limitation fixe, aucun réseau.
    func startDemo(limit: Int = 50) {
        demoLimit = limit
        limitKmh = limit
    }

    func reset() {
        guard demoLimit == nil else { return }
        limitKmh = nil
        ways = []
        throttle.reset()
    }

    func update(point: GeoPoint, heading: Double) {
        guard isEnabled else { return }
        if let demoLimit { limitKmh = demoLimit; return }
        // Correspondance locale à chaque position (quelques microsecondes).
        let matched = SpeedLimit.match(ways: ways, at: point, heading: heading)
        if let matched, matched != limitKmh { limitKmh = matched }

        guard !inFlight, throttle.shouldQuery(at: point, time: CACurrentMediaTime()) else { return }
        inFlight = true
        let query = String(format: "[out:json][timeout:6];way(around:60,%.6f,%.6f)[highway][maxspeed];out tags geom;",
                           point.latitude, point.longitude)
        var req = URLRequest(url: endpoints[endpointIndex % endpoints.count])
        req.httpMethod = "POST"
        req.timeoutInterval = 8
        req.setValue("AZZ-DRIVE/1.0 (iOS)", forHTTPHeaderField: "User-Agent")
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = ("data=" + (query.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "")).data(using: .utf8)

        Task { [weak self] in
            defer { self?.inFlight = false }
            guard let result = try? await URLSession.shared.data(for: req),
                  (result.1 as? HTTPURLResponse)?.statusCode == 200 else {
                self?.endpointIndex += 1 // serveur saturé : le suivant au prochain essai
                return
            }
            let data = result.0
            let fresh = SpeedLimit.ways(fromOverpass: data)
            guard let self else { return }
            self.ways = fresh
            // Hors de toute route connue : on efface plutôt que d'afficher une valeur fausse.
            self.limitKmh = SpeedLimit.match(ways: fresh, at: point, heading: heading)
        }
    }
}
