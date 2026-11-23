import SwiftUI

enum Theme {
    static let background = Color(red: 0.035, green: 0.051, blue: 0.071)
    static let panel = Color(red: 0.067, green: 0.098, blue: 0.137)
    static let line = Color(red: 0.149, green: 0.2, blue: 0.259)
    static let cyan = Color(red: 0.153, green: 0.843, blue: 0.91)
    static let green = Color(red: 0.557, green: 0.89, blue: 0.365)
    static let muted = Color(red: 0.569, green: 0.631, blue: 0.702)
    static let danger = Color(red: 0.95, green: 0.3, blue: 0.3)
    /// Fond des panneaux de conduite (gris anthracite, comme un écran de voiture).
    static let hud = Color(red: 0.075, green: 0.08, blue: 0.095)
    static let spotify = Color(red: 0.12, green: 0.84, blue: 0.38)
}

/// Carte translucide commune à tous les panneaux.
struct PanelStyle: ViewModifier {
    var radius: CGFloat = 20
    func body(content: Content) -> some View {
        content
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Theme.line.opacity(0.7), lineWidth: 1))
    }
}

extension View {
    func panel(radius: CGFloat = 20) -> some View { modifier(PanelStyle(radius: radius)) }
}

/// Bouton rond utilisé sur la carte.
struct RoundButton: View {
    let systemName: String
    var tint: Color = .white
    var background: Color? = nil
    var size: CGFloat = 52
    var label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: size * 0.38, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: size, height: size)
                .background {
                    if let background { Circle().fill(background) } else { Circle().fill(.ultraThinMaterial) }
                }
                .overlay(Circle().stroke(Theme.line.opacity(0.7), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// Heure d'arrivée au format « 14:32 ».
enum ETAFormat {
    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "HH:mm"
        return f
    }()

    static func arrival(in seconds: TimeInterval) -> String {
        formatter.string(from: Date().addingTimeInterval(seconds))
    }
}
