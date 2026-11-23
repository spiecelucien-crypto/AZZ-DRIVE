import Foundation

/// Coordonnée géographique indépendante de CoreLocation.
/// Le cœur de navigation (`Sources/Core`) n'utilise que Foundation :
/// il est testable partout et ne dépend d'aucun framework d'interface.
struct GeoPoint: Equatable, Codable, Hashable {
    var latitude: Double
    var longitude: Double

    init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }
}

enum Geo {
    static let earthRadius = 6_371_008.8

    @inline(__always) static func radians(_ degrees: Double) -> Double { degrees * .pi / 180 }
    @inline(__always) static func degrees(_ radians: Double) -> Double { radians * 180 / .pi }

    /// Distance en mètres (formule de haversine).
    static func distance(_ a: GeoPoint, _ b: GeoPoint) -> Double {
        let lat1 = radians(a.latitude), lat2 = radians(b.latitude)
        let dLat = lat2 - lat1
        let dLon = radians(b.longitude - a.longitude)
        let h = sin(dLat / 2) * sin(dLat / 2) + cos(lat1) * cos(lat2) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * earthRadius * asin(min(1, sqrt(h)))
    }

    /// Cap initial de `a` vers `b`, en degrés (0 = nord, sens horaire).
    static func bearing(from a: GeoPoint, to b: GeoPoint) -> Double {
        let lat1 = radians(a.latitude), lat2 = radians(b.latitude)
        let dLon = radians(b.longitude - a.longitude)
        let y = sin(dLon) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
        return normalize(degrees(atan2(y, x)))
    }

    /// Point situé à `distance` mètres de `origin` selon `bearing`.
    static func destination(from origin: GeoPoint, bearing: Double, distance: Double) -> GeoPoint {
        let delta = distance / earthRadius
        let theta = radians(bearing)
        let lat1 = radians(origin.latitude), lon1 = radians(origin.longitude)
        let lat2 = asin(sin(lat1) * cos(delta) + cos(lat1) * sin(delta) * cos(theta))
        let lon2 = lon1 + atan2(sin(theta) * sin(delta) * cos(lat1), cos(delta) - sin(lat1) * sin(lat2))
        return GeoPoint(latitude: degrees(lat2), longitude: normalizeLongitude(degrees(lon2)))
    }

    /// Interpolation linéaire, suffisante pour des segments de route courts.
    static func interpolate(_ a: GeoPoint, _ b: GeoPoint, _ t: Double) -> GeoPoint {
        GeoPoint(latitude: a.latitude + (b.latitude - a.latitude) * t,
                 longitude: a.longitude + (b.longitude - a.longitude) * t)
    }

    /// Ramène un angle dans [0, 360).
    static func normalize(_ degrees: Double) -> Double {
        let r = degrees.truncatingRemainder(dividingBy: 360)
        return r < 0 ? r + 360 : r
    }

    static func normalizeLongitude(_ lon: Double) -> Double {
        var l = lon
        while l > 180 { l -= 360 }
        while l < -180 { l += 360 }
        return l
    }

    /// Plus petit écart signé de `from` vers `to`, dans [-180, 180].
    static func angleDelta(from: Double, to: Double) -> Double {
        var d = normalize(to) - normalize(from)
        if d > 180 { d -= 360 }
        if d < -180 { d += 360 }
        return d
    }

    /// Projection de `p` sur le segment [a, b] dans un repère local plan (mètres).
    /// Retourne la fraction du segment (0...1) et la distance latérale.
    static func project(_ p: GeoPoint, onSegment a: GeoPoint, _ b: GeoPoint) -> (t: Double, lateral: Double) {
        let k = cos(radians(a.latitude)) * radians(1) * earthRadius
        let m = radians(1) * earthRadius
        let bx = (b.longitude - a.longitude) * k, by = (b.latitude - a.latitude) * m
        let px = (p.longitude - a.longitude) * k, py = (p.latitude - a.latitude) * m
        let len2 = bx * bx + by * by
        let t = len2 > 0 ? max(0, min(1, (px * bx + py * by) / len2)) : 0
        let dx = px - bx * t, dy = py - by * t
        return (t, sqrt(dx * dx + dy * dy))
    }
}
