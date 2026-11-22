import CoreLocation
import Combine

/// Accès au GPS. Deux régimes :
/// - exploration : précision 10 m, filtre 10 m (économe en batterie) ;
/// - navigation : précision maximale, arrière-plan autorisé, pas de pause automatique.
final class LocationService: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var authorization: CLAuthorizationStatus
    @Published private(set) var lastLocation: CLLocation?

    /// Appelé à chaque nouvelle position (sur le fil principal).
    var onLocation: ((CLLocation) -> Void)?

    private let manager = CLLocationManager()
    private(set) var isNavigating = false

    override init() {
        authorization = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.activityType = .automotiveNavigation
        applyExploreMode()
    }

    var isAuthorized: Bool {
        authorization == .authorizedWhenInUse || authorization == .authorizedAlways
    }

    func requestAccess() {
        switch authorization {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse: manager.startUpdatingLocation()
        default: break
        }
    }

    func beginNavigation() {
        isNavigating = true
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.distanceFilter = kCLDistanceFilterNone
        manager.pausesLocationUpdatesAutomatically = false
        // Nécessite UIBackgroundModes = location (déclaré dans project.yml).
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        if isAuthorized { manager.startUpdatingLocation() }
    }

    func endNavigation() {
        isNavigating = false
        manager.allowsBackgroundLocationUpdates = false
        applyExploreMode()
    }

    private func applyExploreMode() {
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 10
        manager.pausesLocationUpdatesAutomatically = true
    }

    // MARK: CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorization = manager.authorizationStatus
        if isAuthorized { manager.startUpdatingLocation() }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations {
            // On ignore les positions trop imprécises ou trop anciennes.
            guard location.horizontalAccuracy >= 0, location.horizontalAccuracy < 100,
                  abs(location.timestamp.timeIntervalSinceNow) < 10 else { continue }
            lastLocation = location
            onLocation?(location)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Erreur transitoire (tunnel, intérieur) : le GPS réessaie seul.
    }
}

extension CLLocation {
    var geoPoint: GeoPoint { GeoPoint(latitude: coordinate.latitude, longitude: coordinate.longitude) }

    func positionFix(time: TimeInterval) -> PositionFix {
        PositionFix(point: geoPoint,
                    course: course >= 0 && speed > 1 ? course : nil,
                    speed: max(0, speed),
                    accuracy: horizontalAccuracy,
                    timestamp: time)
    }
}

extension GeoPoint {
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: latitude, longitude: longitude) }
    init(_ c: CLLocationCoordinate2D) { self.init(latitude: c.latitude, longitude: c.longitude) }
}
