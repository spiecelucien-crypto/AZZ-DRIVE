import Foundation

/// Position fournie au moteur : vrai GPS ou simulation, même format.
struct PositionFix: Equatable {
    var point: GeoPoint
    /// Cap GPS en degrés, ou `nil` s'il est invalide (à l'arrêt).
    var course: Double?
    /// Vitesse en m/s (0 si inconnue).
    var speed: Double
    /// Précision horizontale en mètres.
    var accuracy: Double
    var timestamp: TimeInterval
}

/// État de la navigation, recalculé à chaque position.
struct NavigationProgress: Equatable {
    var distanceAlong: Double
    /// Position affichée : accrochée à la route si on est dessus, brute sinon.
    var displayPoint: GeoPoint
    var heading: Double
    var speed: Double
    var isOnRoute: Bool
    /// Index (dans `route.maneuvers`) de la prochaine manœuvre, `nil` après la dernière.
    var nextManeuverIndex: Int?
    var distanceToNextManeuver: Double
    var remainingDistance: Double
    var remainingTime: TimeInterval
    /// Avancement de 0 à 1, utilisé aussi pour le partage aux proches.
    var fraction: Double
}

enum NavigationEvent: Equatable {
    case announce(String)
    case maneuverChanged(Int?)
    case offRoute
    case arrived
}

/// Moteur de guidage pur : on lui donne des positions, il rend la progression
/// et les événements (annonces vocales, sortie de route, arrivée).
/// Aucune dépendance à l'interface, donc entièrement testable.
final class NavigationEngine {
    struct Config {
        /// Écart toléré avant de considérer qu'on a quitté la route.
        var offRouteDistance: Double = 40
        /// Nombre de positions consécutives hors route avant de recalculer.
        var offRouteConfirmations: Int = 3
        var arrivalRadius: Double = 30
    }

    let route: RoutePlan
    let config: Config

    private var lastSegment: Int?
    private var lastDistanceAlong: Double = 0
    private var offRouteCount = 0
    private var offRouteReported = false
    private var hasArrived = false
    private var currentManeuver: Int?
    /// Paliers déjà annoncés pour chaque manœuvre (0 = loin, 1 = proche, 2 = maintenant).
    private var announced: [Int: Set<Int>] = [:]
    private var lastHeading: Double = 0

    init(route: RoutePlan, config: Config = Config()) {
        self.route = route
        self.config = config
        if let first = route.path.points.first, route.path.points.count > 1 {
            lastHeading = Geo.bearing(from: first, to: route.path.points[1])
        }
    }

    /// Message de départ, prononcé au démarrage de la navigation.
    func departureAnnouncement() -> String {
        let total = "Itinéraire de \(NavFormat.spokenDistance(route.distance)), environ \(NavFormat.spokenDuration(route.expectedTravelTime))."
        if let first = firstUpcomingManeuver(after: 0), route.maneuvers[first].kind != .arrive {
            let m = route.maneuvers[first]
            let d = m.distanceFromStart
            if d < 60 { return "\(total) \(m.instruction)" }
            return "\(total) Dans \(NavFormat.spokenDistance(d)), \(NavFormat.lowercaseFirst(m.instruction))"
        }
        return total
    }

    func update(_ fix: PositionFix) -> (NavigationProgress, [NavigationEvent]) {
        var events: [NavigationEvent] = []
        let path = route.path
        let tolerance = config.offRouteDistance + min(max(fix.accuracy, 0), 35)

        let match = path.match(fix.point, hint: lastSegment)
            ?? path.match(fix.point)
        var onRoute = false
        var displayPoint = fix.point
        var heading = fix.course ?? lastHeading

        if let m = match, m.lateral <= tolerance {
            // La position recule rarement sur une route : on filtre le bruit GPS
            // en n'acceptant qu'un léger retour en arrière.
            let along = max(m.distanceAlong, lastDistanceAlong - 20)
            lastDistanceAlong = along
            lastSegment = path.segmentIndex(at: along)
            onRoute = true
            offRouteCount = 0
            offRouteReported = false
            displayPoint = path.point(at: along)
            heading = path.bearing(at: along)
        } else {
            offRouteCount += 1
            if offRouteCount >= config.offRouteConfirmations, !offRouteReported, !hasArrived {
                offRouteReported = true
                events.append(.offRoute)
            }
        }
        lastHeading = heading

        let along = lastDistanceAlong
        let remaining = max(0, path.length - along)

        // Arrivée : proche de la fin du tracé, ou du point d'arrivée lui-même.
        let nearEnd = path.end.map { Geo.distance($0, fix.point) <= config.arrivalRadius } ?? false
        if !hasArrived, (onRoute && remaining <= config.arrivalRadius) || nearEnd {
            hasArrived = true
            events.append(.arrived)
        }

        let next = hasArrived ? nil : firstUpcomingManeuver(after: along)
        if next != currentManeuver {
            currentManeuver = next
            events.append(.maneuverChanged(next))
        }
        let toManeuver = next.map { max(0, route.maneuvers[$0].distanceFromStart - along) } ?? remaining

        if onRoute, let i = next, !hasArrived {
            events.append(contentsOf: announcements(for: i, distance: toManeuver, speed: fix.speed))
        }

        let fraction = path.length > 0 ? min(1, along / path.length) : 1
        let remainingTime = hasArrived ? 0 : route.expectedTravelTime * (1 - fraction)

        let progress = NavigationProgress(
            distanceAlong: along,
            displayPoint: displayPoint,
            heading: heading,
            speed: max(0, fix.speed),
            isOnRoute: onRoute,
            nextManeuverIndex: next,
            distanceToNextManeuver: toManeuver,
            remainingDistance: hasArrived ? 0 : remaining,
            remainingTime: remainingTime,
            fraction: hasArrived ? 1 : fraction
        )
        return (progress, events)
    }

    private func firstUpcomingManeuver(after along: Double) -> Int? {
        route.maneuvers.indices.first { i in
            let m = route.maneuvers[i]
            return m.kind != .depart && m.distanceFromStart > along + 5
        }
    }

    /// Seuils d'annonce adaptés à la vitesse : plus on roule vite, plus on prévient tôt.
    static func thresholds(speed: Double) -> (far: Double, near: Double, now: Double) {
        switch speed {
        case 25...: return (2000, 600, 120)   // > 90 km/h
        case 15..<25: return (1000, 300, 70)  // 55 à 90 km/h
        default: return (500, 150, 40)        // ville
        }
    }

    private func announcements(for index: Int, distance: Double, speed: Double) -> [NavigationEvent] {
        let m = route.maneuvers[index]
        let t = Self.thresholds(speed: speed)
        var done = announced[index, default: []]
        var out: [NavigationEvent] = []

        if m.kind == .arrive {
            if distance <= t.near, !done.contains(1) {
                done.formUnion([0, 1])
                out.append(.announce("Dans \(NavFormat.spokenDistance(distance)), vous serez arrivé à destination."))
            }
        } else if distance <= t.now {
            if !done.contains(2) {
                done.formUnion([0, 1, 2])
                out.append(.announce(m.instruction))
            }
        } else if distance <= t.near {
            if !done.contains(1) {
                done.formUnion([0, 1])
                out.append(.announce("Dans \(NavFormat.spokenDistance(distance)), \(NavFormat.lowercaseFirst(m.instruction))"))
            }
        } else if distance <= t.far {
            // L'annonce lointaine n'a de sens que si la manœuvre est encore assez loin.
            if !done.contains(0), distance > t.near * 1.5 {
                done.insert(0)
                out.append(.announce("Dans \(NavFormat.spokenDistance(distance)), \(NavFormat.lowercaseFirst(m.instruction))"))
            }
        }
        announced[index] = done
        return out
    }
}
