import Foundation

/// Pose affichée du véhicule à un instant donné.
struct VehiclePose: Equatable {
    var point: GeoPoint
    var heading: Double
    var speed: Double
}

/// Rend le mouvement fluide entre deux positions GPS (≈ 1 par seconde) :
/// à chaque image (30-60 fois par seconde) on prédit la position en avançant
/// le long de la route à la vitesse mesurée, puis on lisse l'écart.
/// Résultat : le véhicule glisse sur la route au lieu de sauter.
final class PoseInterpolator {
    private var path: RoutePath?
    private var anchorAlong: Double?
    private var anchorPoint: GeoPoint?
    private var anchorHeading: Double = 0
    private var anchorSpeed: Double = 0
    private var anchorTime: TimeInterval = 0

    private var displayedAlong: Double?
    private var displayedPoint: GeoPoint?
    private var displayedHeading: Double = 0
    private var lastTick: TimeInterval?

    /// Temps de réponse du lissage (secondes).
    var positionTau: Double = 0.35
    var headingTau: Double = 0.25
    /// Au-delà, on ne prédit plus (perte de signal, tunnel…).
    var maxExtrapolation: TimeInterval = 2.0

    var hasPose: Bool { displayedPoint != nil || anchorPoint != nil }

    func setPath(_ path: RoutePath?) {
        self.path = path
        displayedAlong = nil
        anchorAlong = nil
    }

    /// Nouvelle position mesurée. `distanceAlong` est fourni quand on est sur la route.
    func ingest(point: GeoPoint, distanceAlong: Double?, heading: Double, speed: Double, time: TimeInterval) {
        anchorPoint = point
        anchorAlong = path == nil ? nil : distanceAlong
        anchorHeading = heading
        anchorSpeed = max(0, speed)
        anchorTime = time
        if displayedPoint == nil {
            displayedPoint = point
            displayedHeading = heading
            displayedAlong = anchorAlong
        }
    }

    func pose(at time: TimeInterval) -> VehiclePose? {
        guard let anchorPoint else { return nil }
        let dt = lastTick.map { max(0, min(0.25, time - $0)) } ?? 0
        lastTick = time
        let elapsed = max(0, min(maxExtrapolation, time - anchorTime))
        let kPos = dt > 0 ? 1 - exp(-dt / positionTau) : 1
        let kHead = dt > 0 ? 1 - exp(-dt / headingTau) : 1

        if let path, let anchorAlong {
            // Sur la route : on avance le long du tracé, virages compris.
            let predicted = min(path.length, anchorAlong + anchorSpeed * elapsed)
            var along = displayedAlong ?? predicted
            if abs(predicted - along) > 150 { along = predicted } // saut (recalcul, reprise)
            along += (predicted - along) * kPos
            displayedAlong = along
            let p = path.point(at: along)
            displayedPoint = p
            let target = path.bearing(at: along)
            displayedHeading = Geo.normalize(displayedHeading + Geo.angleDelta(from: displayedHeading, to: target) * kHead)
            return VehiclePose(point: p, heading: displayedHeading, speed: anchorSpeed)
        }

        // Hors route : estimation par cap et vitesse (navigation à l'estime).
        displayedAlong = nil
        let predicted = Geo.destination(from: anchorPoint, bearing: anchorHeading, distance: anchorSpeed * elapsed)
        var current = displayedPoint ?? predicted
        if Geo.distance(current, predicted) > 150 { current = predicted }
        current = Geo.interpolate(current, predicted, kPos)
        displayedPoint = current
        displayedHeading = Geo.normalize(displayedHeading + Geo.angleDelta(from: displayedHeading, to: anchorHeading) * kHead)
        return VehiclePose(point: current, heading: displayedHeading, speed: anchorSpeed)
    }
}

/// Caméra de navigation : suit le véhicule par l'arrière, zoome selon la vitesse
/// et tourne avec un léger retard pour que les virages restent lisibles.
struct CameraState: Equatable {
    var center: GeoPoint
    var heading: Double
    var pitch: Double
    /// Distance de l'œil au centre (mètres), comme `MKMapCamera.centerCoordinateDistance`.
    var distance: Double
}

final class CameraRig {
    /// Deux cadrages : « poursuite » (au ras de la route, derrière la voiture, comme
    /// dans un jeu de course) et « vue d'ensemble » (plus haut, pour anticiper).
    enum Mode: String, CaseIterable, Codable { case chase, overview }

    var pitch: Double = 60
    var minDistance: Double = 320
    var maxDistance: Double = 1100
    var distancePerMps: Double = 22
    var headingTau: Double = 0.55
    var zoomTau: Double = 1.2
    /// Décalage du centre vers l'avant (fraction de la distance caméra). Corrigé en continu
    /// par `correctAnchor` pour garder le véhicule à la hauteur voulue de l'écran.
    var lookAheadFactor: Double = 0.13
    let maxLookAhead: Double = 0.9

    private(set) var mode: Mode = .overview
    private(set) var heading: Double?
    private(set) var distance: Double?
    private var lastTick: TimeInterval?

    init(mode: Mode = .overview) { apply(mode) }

    func apply(_ mode: Mode) {
        self.mode = mode
        switch mode {
        case .chase:
            pitch = 75; minDistance = 110; maxDistance = 420; distancePerMps = 8; headingTau = 0.45
        case .overview:
            pitch = 60; minDistance = 320; maxDistance = 1100; distancePerMps = 22; headingTau = 0.55
        }
    }

    func reset() { heading = nil; distance = nil; lastTick = nil }

    func targetDistance(speed: Double) -> Double {
        // Poursuite : 110 m à l'arrêt → ~400 m sur autoroute. Vue d'ensemble : 320 m → ~1 100 m.
        min(maxDistance, max(minDistance, minDistance + speed * distancePerMps))
    }

    /// Asservissement doux : `observedScreenRatio` est la position verticale réelle du véhicule
    /// à l'écran (0 = haut, 1 = bas). On ajuste l'avance de la caméra jusqu'à atteindre `target`.
    /// Fonctionne quel que soit l'écran, l'orientation ou l'inclinaison réellement acceptée par la carte.
    func correctAnchor(observedScreenRatio: Double, target: Double, gain: Double = 0.04) {
        guard observedScreenRatio.isFinite else { return }
        let error = max(-0.5, min(0.5, target - observedScreenRatio))
        lookAheadFactor = max(-0.2, min(maxLookAhead, lookAheadFactor + error * gain))
    }

    func update(pose: VehiclePose, time: TimeInterval) -> CameraState {
        let dt = lastTick.map { max(0, min(0.25, time - $0)) } ?? 0
        lastTick = time
        let kHead = dt > 0 ? 1 - exp(-dt / headingTau) : 1
        let kZoom = dt > 0 ? 1 - exp(-dt / zoomTau) : 1

        let h = heading.map { Geo.normalize($0 + Geo.angleDelta(from: $0, to: pose.heading) * kHead) } ?? pose.heading
        let targetD = targetDistance(speed: pose.speed)
        let d = distance.map { $0 + (targetD - $0) * kZoom } ?? targetD
        heading = h
        distance = d

        let ahead = d * lookAheadFactor
        let center = Geo.destination(from: pose.point, bearing: h, distance: ahead)
        return CameraState(center: center, heading: h, pitch: pitch, distance: d)
    }
}

/// Conduite simulée le long d'un tracé : utile sur simulateur, en démo,
/// ou pour tester le guidage sans prendre la voiture.
final class RouteDriveSimulation {
    let path: RoutePath
    let maneuverDistances: [Double]
    var cruiseSpeed: Double     // m/s
    var speedMultiplier: Double = 1
    private(set) var distanceAlong: Double = 0
    private(set) var speed: Double = 0

    var isFinished: Bool { distanceAlong >= path.length }

    init(path: RoutePath, maneuverDistances: [Double], cruiseSpeed: Double = 50 / 3.6) {
        self.path = path
        self.maneuverDistances = maneuverDistances.sorted()
        self.cruiseSpeed = cruiseSpeed
    }

    /// Avance de `dt` secondes et renvoie la position simulée.
    func step(dt: TimeInterval, time: TimeInterval) -> PositionFix {
        // Ralentit à l'approche des manœuvres et de l'arrivée, comme un conducteur.
        let nextManeuver = maneuverDistances.first { $0 > distanceAlong + 1 } ?? path.length
        let toManeuver = nextManeuver - distanceAlong
        let target: Double
        if toManeuver < 40 { target = min(cruiseSpeed, 6) }
        else if toManeuver < 120 { target = min(cruiseSpeed, 10) }
        else { target = cruiseSpeed }
        let accel = target > speed ? 2.5 : 4.0
        let delta = max(-accel * dt, min(accel * dt, target - speed))
        speed = max(1, speed + delta)

        distanceAlong = min(path.length, distanceAlong + speed * dt * speedMultiplier)
        let p = path.point(at: distanceAlong)
        return PositionFix(point: p, course: path.bearing(at: distanceAlong),
                           speed: speed * speedMultiplier, accuracy: 5, timestamp: time)
    }
}
