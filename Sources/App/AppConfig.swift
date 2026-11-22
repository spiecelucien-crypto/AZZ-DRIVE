import Foundation

/// Paramètres lus dans Info.plist (remplis depuis Config/Secrets.xcconfig).
/// Une valeur vide désactive proprement la fonction correspondante.
enum AppConfig {
    private static func value(_ key: String) -> String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: key) as? String else { return nil }
        let v = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return v.isEmpty || v.hasPrefix("$(") ? nil : v
    }

    static var spotifyClientID: String? { value("SpotifyClientID") }
    static let spotifyRedirectURI = "azzdrive-spotify://callback"
    static let spotifyCallbackScheme = "azzdrive-spotify"

    static var firebaseDatabaseHost: String? { value("FirebaseDatabaseHost") }
    static var firebaseAPIKey: String? { value("FirebaseAPIKey") }
    static var followPageURL: URL? {
        value("FollowPageURL").flatMap(URL.init(string:))
            ?? URL(string: "https://spiecelucien-crypto.github.io/AZZ-DRIVE/suivi.html")
    }

    static var isSpotifyConfigured: Bool { spotifyClientID != nil }
    static var isSharingConfigured: Bool { firebaseDatabaseHost != nil && firebaseAPIKey != nil }
}
