import MapKit

struct RouteOptions: Equatable {
    var avoidTolls = false
    var avoidHighways = false
}

enum RouteError: LocalizedError {
    case noLocation, noRoute

    var errorDescription: String? {
        switch self {
        case .noLocation: return "Position GPS indisponible. Autorisez la localisation ou activez la simulation."
        case .noRoute: return "Aucun itinéraire en voiture trouvé vers cette destination."
        }
    }
}

/// Calcul d'itinéraires avec Apple Plans, convertis en `RoutePlan` (format du moteur).
enum RouteService {
    static func search(_ query: String, near region: MKCoordinateRegion?) async throws -> [MKMapItem] {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        request.resultTypes = [.address, .pointOfInterest]
        if let region { request.region = region }
        let response = try await MKLocalSearch(request: request).start()
        return Array(response.mapItems.prefix(6))
    }

    static func routes(from origin: CLLocationCoordinate2D,
                       to destination: MKMapItem,
                       options: RouteOptions,
                       alternatives: Bool = true) async throws -> [RoutePlan] {
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: origin))
        request.destination = destination
        request.transportType = .automobile
        request.requestsAlternateRoutes = alternatives
        request.tollPreference = options.avoidTolls ? .avoid : .any
        request.highwayPreference = options.avoidHighways ? .avoid : .any

        let response = try await MKDirections(request: request).calculate()
        let plans = response.routes.map(makePlan)
        guard !plans.isEmpty else { throw RouteError.noRoute }
        return plans
    }

    static func makePlan(_ route: MKRoute) -> RoutePlan {
        let path = RoutePath(points: coordinates(of: route.polyline).map(GeoPoint.init))

        var maneuvers: [RouteManeuver] = []
        var cumulative = 0.0
        var hint = 0
        let steps = route.steps
        for (i, step) in steps.enumerated() {
            let isLast = i == steps.count - 1
            // Position de la manœuvre : début du tracé de l'étape, accroché au trajet.
            var at = cumulative
            if let first = coordinates(of: step.polyline).first,
               let m = path.match(GeoPoint(first), hint: hint, behind: 2, ahead: 400) {
                at = m.distanceAlong
                hint = m.segment
            }
            let text = step.instructions.trimmingCharacters(in: .whitespacesAndNewlines)
            if i == 0 && (text.isEmpty || step.distance == 0) {
                maneuvers.append(RouteManeuver(instruction: text, distanceFromStart: 0, kind: .depart))
            } else if isLast {
                maneuvers.append(RouteManeuver(instruction: text.isEmpty ? "Vous êtes arrivé" : text,
                                               distanceFromStart: path.length, kind: .arrive))
            } else if !text.isEmpty {
                maneuvers.append(RouteManeuver(instruction: text, distanceFromStart: at,
                                               kind: ManeuverKind.from(instruction: text)))
            }
            cumulative += step.distance
        }

        return RoutePlan(name: route.name.isEmpty ? "Itinéraire" : route.name,
                         path: path,
                         maneuvers: maneuvers,
                         expectedTravelTime: route.expectedTravelTime,
                         notices: route.advisoryNotices)
    }

    static func coordinates(of polyline: MKPolyline) -> [CLLocationCoordinate2D] {
        var coords = [CLLocationCoordinate2D](repeating: kCLLocationCoordinate2DInvalid, count: polyline.pointCount)
        polyline.getCoordinates(&coords, range: NSRange(location: 0, length: polyline.pointCount))
        return coords
    }
}

extension RoutePlan {
    /// Tracé MapKit pour l'affichage.
    func makePolyline() -> MKPolyline {
        let coords = path.points.map(\.coordinate)
        return MKPolyline(coordinates: coords, count: coords.count)
    }
}
