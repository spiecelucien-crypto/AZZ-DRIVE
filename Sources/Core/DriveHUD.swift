import Foundation

// Logique pure de l'interface de conduite : textes de manœuvre, limitations de vitesse
// (OpenStreetMap) et proches qui suivent le trajet. Sans UIKit, donc testable sous Linux.

// MARK: Textes de manœuvre

extension ManeuverKind {
    /// Consigne courte affichée en gros : « Tournez à droite ».
    var shortLabel: String {
        switch self {
        case .depart: return "Départ"
        case .straight: return "Continuez tout droit"
        case .left: return "Tournez à gauche"
        case .right: return "Tournez à droite"
        case .slightLeft: return "Légèrement à gauche"
        case .slightRight: return "Légèrement à droite"
        case .sharpLeft: return "Virage serré à gauche"
        case .sharpRight: return "Virage serré à droite"
        case .uTurn: return "Faites demi-tour"
        case .roundabout: return "Au rond-point"
        case .merge: return "Insérez-vous"
        case .exitLeft: return "Sortie à gauche"
        case .exitRight: return "Sortie à droite"
        case .ferry: return "Prenez le ferry"
        case .arrive: return "Arrivée"
        }
    }
}

enum ManeuverText {
    /// Extrait le nom de la rue d'une instruction Apple Plans
    /// (« Tournez à droite sur Rue de Mons » → « Rue de Mons »). `nil` si introuvable.
    static func streetName(from instruction: String) -> String? {
        let text = instruction.trimmingCharacters(in: .whitespacesAndNewlines)
        // Ordre important : les marqueurs les plus précis d'abord.
        let markers = [" pour rejoindre ", " pour prendre ", " sur ", " dans ", " onto ", " on ", " vers ",
                       " toward ", " towards ", " en direction de ", " direction "]
        let lower = text.lowercased()
        var best: Range<String.Index>?
        for m in markers {
            if let r = lower.range(of: m), best == nil || r.lowerBound < best!.lowerBound { best = r }
        }
        guard let best else { return nil }
        let offset = lower.distance(from: lower.startIndex, to: best.upperBound)
        var street = String(text[text.index(text.startIndex, offsetBy: offset)...])
        for stop in [", puis ", ", then ", " puis ", ". "] {
            if let r = street.range(of: stop) { street = String(street[..<r.lowerBound]) }
        }
        street = street.trimmingCharacters(in: CharacterSet(charactersIn: " .,"))
        if street.lowercased().hasPrefix("la ") || street.lowercased().hasPrefix("le ") {
            // « sur la Rue de Mons » → « Rue de Mons » si la suite commence par une majuscule.
            let rest = street.dropFirst(3)
            if rest.first?.isUppercase == true { street = String(rest) }
        }
        return street.isEmpty || street.count > 60 ? nil : street
    }
}

// MARK: Limitations de vitesse (OpenStreetMap)

enum SpeedLimit {
    /// Convertit une étiquette `maxspeed` OSM en km/h : « 50 », « 30 mph »,
    /// « BE-VLG:urban », « FR:rural »… `nil` si inconnue ou sans limite.
    static func parse(_ raw: String) -> Int? {
        let s = raw.trimmingCharacters(in: .whitespaces).lowercased()
        if s.isEmpty || s == "none" || s == "signals" || s == "variable" { return nil }
        if s.hasSuffix("mph"), let v = Double(s.dropLast(3).trimmingCharacters(in: .whitespaces)) {
            return Int((v * 1.609344).rounded())
        }
        if let v = Int(s) { return (5...160).contains(v) ? v : nil }
        if s.contains(";") { return s.split(separator: ";").compactMap { parse(String($0)) }.min() }
        // Valeurs implicites par pays/région (zone:type).
        let implicit: [String: Int] = [
            "be-vlg:urban": 50, "be-vlg:rural": 70, "be-vlg:motorway": 120,
            "be-wal:urban": 50, "be-wal:rural": 90, "be-wal:motorway": 120,
            "be-bru:urban": 30, "be-bru:rural": 70, "be-bru:motorway": 120,
            "be:urban": 50, "be:rural": 70, "be:motorway": 120, "be:zone30": 30, "be:living_street": 20,
            "fr:urban": 50, "fr:rural": 80, "fr:motorway": 130, "fr:zone30": 30, "fr:walk": 6,
            "nl:urban": 50, "nl:rural": 80, "nl:motorway": 100,
            "de:urban": 50, "de:rural": 100, "de:zone30": 30,
            "lu:urban": 50, "lu:rural": 90, "lu:motorway": 130,
            "ch:urban": 50, "ch:rural": 80, "ch:motorway": 120,
        ]
        return implicit[s]
    }

    struct Way: Equatable {
        var limitKmh: Int
        var geometry: [GeoPoint]
        var oneway: Bool
    }

    /// Choisit la route la plus proche dont l'orientation correspond au cap du véhicule.
    static func match(ways: [Way], at point: GeoPoint, heading: Double, maxDistance: Double = 30) -> Int? {
        var best: (score: Double, limit: Int)?
        for way in ways where way.geometry.count >= 2 {
            for i in 0..<(way.geometry.count - 1) {
                let a = way.geometry[i], b = way.geometry[i + 1]
                let proj = Geo.project(point, onSegment: a, b)
                guard proj.lateral <= maxDistance else { continue }
                let bearing = Geo.bearing(from: a, to: b)
                var diff = abs(Geo.angleDelta(from: heading, to: bearing))
                if !way.oneway { diff = min(diff, 180 - diff) }
                guard diff <= 50 else { continue }
                let score = proj.lateral + diff * 0.3
                if best == nil || score < best!.score { best = (score, way.limitKmh) }
            }
        }
        return best?.limit
    }

    /// Décode la réponse JSON de l'API Overpass (`out tags geom`).
    static func ways(fromOverpass data: Data) -> [Way] {
        struct Response: Decodable {
            struct Element: Decodable {
                struct Node: Decodable { let lat: Double; let lon: Double }
                let tags: [String: String]?
                let geometry: [Node]?
            }
            let elements: [Element]
        }
        guard let r = try? JSONDecoder().decode(Response.self, from: data) else { return [] }
        return r.elements.compactMap { e in
            guard let tags = e.tags, let raw = tags["maxspeed"], let limit = parse(raw),
                  let geom = e.geometry, geom.count >= 2 else { return nil }
            let oneway = tags["oneway"] == "yes" || tags["junction"] == "roundabout" || tags["highway"] == "motorway"
            return Way(limitKmh: limit, geometry: geom.map { GeoPoint(latitude: $0.lat, longitude: $0.lon) }, oneway: oneway)
        }
    }

    /// Décide quand interroger OpenStreetMap : rarement, pour rester léger.
    struct QueryThrottle {
        var minDistance: Double = 120
        var minInterval: TimeInterval = 8
        var maxInterval: TimeInterval = 45
        private var lastPoint: GeoPoint?
        private var lastTime: TimeInterval?

        init() {}

        mutating func shouldQuery(at point: GeoPoint, time: TimeInterval) -> Bool {
            guard let lastPoint, let lastTime else { return commit(point, time) }
            let elapsed = time - lastTime
            guard elapsed >= minInterval else { return false }
            if Geo.distance(lastPoint, point) >= minDistance || elapsed >= maxInterval { return commit(point, time) }
            return false
        }

        mutating func reset() { lastPoint = nil; lastTime = nil }

        private mutating func commit(_ p: GeoPoint, _ t: TimeInterval) -> Bool {
            lastPoint = p; lastTime = t
            return true
        }
    }
}

// MARK: Proches qui suivent le trajet

struct TripViewer: Codable, Equatable {
    var name: String
    var seenMs: Int64
}

enum TripViewers {
    /// Proches ayant ouvert la page récemment (les autres ont fermé l'onglet).
    static func active(_ viewers: [String: TripViewer], nowMs: Int64, windowMs: Int64 = 120_000) -> [TripViewer] {
        viewers.values
            .filter { nowMs - $0.seenMs <= windowMs }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// Initiales pour les pastilles : « Marie Dupont » → « MD », « léa » → « L ».
    static func initials(_ name: String) -> String {
        let parts = name.split(whereSeparator: { $0 == " " || $0 == "-" }).prefix(2)
        let s = parts.compactMap { $0.first.map { String($0).uppercased() } }.joined()
        return s.isEmpty ? "?" : s
    }

    /// « 2 personnes suivent ce trajet ».
    static func summary(count: Int) -> String {
        switch count {
        case 0: return "En attente de vos proches"
        case 1: return "1 personne suit ce trajet"
        default: return "\(count) personnes suivent ce trajet"
        }
    }
}
