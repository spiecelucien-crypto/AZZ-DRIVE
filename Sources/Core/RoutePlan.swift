import Foundation

/// Type de manœuvre, déduit du texte d'instruction (Apple Plans le fournit
/// dans la langue de l'appareil ; on reconnaît le français et l'anglais).
enum ManeuverKind: String, Codable, Equatable {
    case depart, straight, left, right, slightLeft, slightRight, sharpLeft, sharpRight
    case uTurn, roundabout, merge, exitLeft, exitRight, ferry, arrive

    /// Nom de symbole SF Symbols pour la bannière de guidage.
    var symbolName: String {
        switch self {
        case .depart: return "location.north.line.fill"
        case .straight: return "arrow.up"
        case .left: return "arrow.turn.up.left"
        case .right: return "arrow.turn.up.right"
        case .slightLeft: return "arrow.up.left"
        case .slightRight: return "arrow.up.right"
        case .sharpLeft: return "arrow.turn.left.down"
        case .sharpRight: return "arrow.turn.right.down"
        case .uTurn: return "arrow.uturn.down"
        case .roundabout: return "arrow.triangle.2.circlepath"
        case .merge: return "arrow.merge"
        case .exitLeft: return "arrow.up.left"
        case .exitRight: return "arrow.up.right"
        case .ferry: return "ferry.fill"
        case .arrive: return "flag.checkered"
        }
    }

    static func from(instruction raw: String, isLast: Bool = false) -> ManeuverKind {
        if isLast { return .arrive }
        let s = raw.lowercased().folding(options: .diacriticInsensitive, locale: Locale(identifier: "fr_FR"))
        func has(_ words: String...) -> Bool { words.contains { s.contains($0) } }

        if has("destination", "arrive", "arrivee") { return .arrive }
        if has("demi-tour", "u-turn", "make a u") { return .uTurn }
        if has("rond-point", "rond point", "giratoire", "roundabout", "traffic circle") { return .roundabout }
        if has("ferry", "bac ") { return .ferry }
        if has("sortie", "exit", "bretelle", "ramp") {
            return has("gauche", "left") ? .exitLeft : .exitRight
        }
        if has("insere", "rejoignez", "merge") { return .merge }
        let left = has("gauche", "left")
        let right = has("droite", "right")
        let slight = has("legerement", "serrez", "slight", "keep", "bear")
        let sharp = has("forte", "brusquement", "sharp")
        if left { return slight ? .slightLeft : (sharp ? .sharpLeft : .left) }
        if right { return slight ? .slightRight : (sharp ? .sharpRight : .right) }
        if has("continuez", "tout droit", "continue", "straight", "suivez", "head", "dirigez") { return .straight }
        return .straight
    }
}

struct RouteManeuver: Equatable, Codable {
    var instruction: String
    /// Position de la manœuvre le long du tracé (mètres depuis le départ).
    var distanceFromStart: Double
    var kind: ManeuverKind
}

/// Itinéraire calculé, indépendant de MapKit.
struct RoutePlan: Identifiable, Equatable {
    let id: UUID
    var name: String
    var path: RoutePath
    var maneuvers: [RouteManeuver]
    /// Durée prévue par le calculateur d'itinéraire (secondes).
    var expectedTravelTime: TimeInterval
    var notices: [String]

    init(id: UUID = UUID(), name: String, path: RoutePath, maneuvers: [RouteManeuver],
         expectedTravelTime: TimeInterval, notices: [String] = []) {
        self.id = id
        self.name = name
        self.path = path
        self.maneuvers = maneuvers.sorted { $0.distanceFromStart < $1.distanceFromStart }
        self.expectedTravelTime = expectedTravelTime
        self.notices = notices
    }

    var distance: Double { path.length }
}

/// Formatage français des distances et durées.
enum NavFormat {
    /// Distance affichée : « 80 m », « 350 m », « 1,2 km », « 14 km ».
    static func distance(_ meters: Double) -> String {
        if meters < 1000 {
            let step: Double = meters < 100 ? 10 : 50
            let rounded = max(0, (meters / step).rounded() * step)
            return rounded >= 1000 ? "1 km" : "\(Int(rounded)) m"
        }
        let km = meters / 1000
        if km < 10 {
            return String(format: "%.1f km", km).replacingOccurrences(of: ".", with: ",")
        }
        return "\(Int(km.rounded())) km"
    }

    /// Distance prononcée : « 300 mètres », « 1,5 kilomètre », « 2 kilomètres ».
    static func spokenDistance(_ meters: Double) -> String {
        if meters < 1000 {
            let step: Double = meters < 300 ? 50 : 100
            let rounded = max(step, (meters / step).rounded() * step)
            if rounded >= 1000 { return "1 kilomètre" }
            return "\(Int(rounded)) mètres"
        }
        let km = (meters / 100).rounded() / 10
        if km == km.rounded() {
            let n = Int(km)
            return n == 1 ? "1 kilomètre" : "\(n) kilomètres"
        }
        return String(format: "%.1f", km).replacingOccurrences(of: ".", with: ",") + " kilomètres"
    }

    /// Durée : « 4 min », « 1 h 05 ».
    static func duration(_ seconds: TimeInterval) -> String {
        let minutes = Int((seconds / 60).rounded())
        if minutes < 60 { return "\(max(1, minutes)) min" }
        return String(format: "%d h %02d", minutes / 60, minutes % 60)
    }

    /// Durée prononcée : « 12 minutes », « 1 heure 5 ».
    static func spokenDuration(_ seconds: TimeInterval) -> String {
        let minutes = max(1, Int((seconds / 60).rounded()))
        if minutes < 60 { return minutes == 1 ? "1 minute" : "\(minutes) minutes" }
        let h = minutes / 60, m = minutes % 60
        let hours = h == 1 ? "1 heure" : "\(h) heures"
        return m == 0 ? hours : "\(hours) \(m)"
    }

    /// Met la première lettre en minuscule pour l'enchaîner après « Dans 300 mètres, ».
    static func lowercaseFirst(_ s: String) -> String {
        guard let first = s.first else { return s }
        return first.lowercased() + s.dropFirst()
    }
}
