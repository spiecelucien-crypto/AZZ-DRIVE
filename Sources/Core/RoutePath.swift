import Foundation

/// Tracé d'un itinéraire avec distances cumulées.
/// Toutes les requêtes (position à une distance, cap, accrochage d'un point GPS)
/// sont en O(log n) ou limitées à une fenêtre autour du dernier segment connu.
struct RoutePath: Equatable {
    let points: [GeoPoint]
    /// Distance depuis le départ pour chaque point (même taille que `points`).
    let cumulative: [Double]

    var length: Double { cumulative.last ?? 0 }
    var start: GeoPoint? { points.first }
    var end: GeoPoint? { points.last }

    init(points raw: [GeoPoint]) {
        var pts: [GeoPoint] = []
        pts.reserveCapacity(raw.count)
        for p in raw where pts.last.map({ Geo.distance($0, p) > 0.05 }) ?? true {
            pts.append(p)
        }
        var cum: [Double] = []
        cum.reserveCapacity(pts.count)
        var total = 0.0
        for (i, p) in pts.enumerated() {
            if i > 0 { total += Geo.distance(pts[i - 1], p) }
            cum.append(total)
        }
        points = pts
        cumulative = cum
    }

    struct Match: Equatable {
        /// Distance parcourue le long du tracé jusqu'au point projeté.
        var distanceAlong: Double
        /// Écart en mètres entre la position et le tracé.
        var lateral: Double
        /// Index du segment (points[segment] → points[segment + 1]).
        var segment: Int
        var point: GeoPoint
    }

    /// Accroche une position au tracé.
    /// - Parameters:
    ///   - hint: dernier segment connu ; la recherche se limite alors à une fenêtre,
    ///     ce qui évite de « sauter » sur une portion parallèle ou une boucle.
    func match(_ p: GeoPoint, hint: Int? = nil, behind: Int = 3, ahead: Int = 60) -> Match? {
        guard points.count >= 2 else { return nil }
        let lastSegment = points.count - 2
        let range: ClosedRange<Int>
        if let hint {
            let h = max(0, min(lastSegment, hint))
            range = max(0, h - behind)...min(lastSegment, h + ahead)
        } else {
            range = 0...lastSegment
        }
        var best: Match?
        for i in range {
            let (t, lateral) = Geo.project(p, onSegment: points[i], points[i + 1])
            if best == nil || lateral < best!.lateral {
                let segLen = cumulative[i + 1] - cumulative[i]
                best = Match(distanceAlong: cumulative[i] + segLen * t,
                             lateral: lateral,
                             segment: i,
                             point: Geo.interpolate(points[i], points[i + 1], t))
            }
        }
        return best
    }

    /// Index du segment contenant la distance `d` (recherche dichotomique).
    func segmentIndex(at d: Double) -> Int {
        guard points.count >= 2 else { return 0 }
        if d <= 0 { return 0 }
        if d >= length { return points.count - 2 }
        var lo = 0, hi = cumulative.count - 1
        while hi - lo > 1 {
            let mid = (lo + hi) / 2
            if cumulative[mid] <= d { lo = mid } else { hi = mid }
        }
        return min(lo, points.count - 2)
    }

    func point(at d: Double) -> GeoPoint {
        guard points.count >= 2 else { return points.first ?? GeoPoint(latitude: 0, longitude: 0) }
        let clamped = max(0, min(length, d))
        let i = segmentIndex(at: clamped)
        let segLen = cumulative[i + 1] - cumulative[i]
        let t = segLen > 0 ? (clamped - cumulative[i]) / segLen : 0
        return Geo.interpolate(points[i], points[i + 1], t)
    }

    /// Cap lissé autour de la distance `d` (moyenne sur une petite fenêtre),
    /// pour que le véhicule tourne progressivement dans les virages.
    func bearing(at d: Double, window: Double = 12) -> Double {
        guard points.count >= 2 else { return 0 }
        let a = point(at: max(0, d - window / 2))
        let b = point(at: min(length, d + window / 2))
        if Geo.distance(a, b) < 0.5 {
            let i = segmentIndex(at: d)
            return Geo.bearing(from: points[i], to: points[i + 1])
        }
        return Geo.bearing(from: a, to: b)
    }

    /// Version allégée (échantillonnage à pas de distance régulier),
    /// utilisée pour envoyer un aperçu léger du trajet aux proches.
    func simplified(maxPoints: Int) -> [GeoPoint] {
        guard points.count > maxPoints, maxPoints >= 2, length > 0 else { return points }
        let step = length / Double(maxPoints - 1)
        return (0..<maxPoints).map { point(at: Double($0) * step) }
    }
}
