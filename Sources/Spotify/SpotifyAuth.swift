import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

struct SpotifyToken: Codable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date

    var isExpired: Bool { Date() > expiresAt.addingTimeInterval(-60) }
}

enum SpotifyAuthError: LocalizedError {
    case notConfigured, cancelled, invalidCallback, tokenRequestFailed(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Spotify n'est pas configuré (SPOTIFY_CLIENT_ID manquant)."
        case .cancelled: return "Connexion Spotify annulée."
        case .invalidCallback: return "Réponse de Spotify invalide."
        case .tokenRequestFailed(let s): return "Connexion Spotify refusée : \(s)"
        }
    }
}

/// Connexion Spotify par « Authorization Code + PKCE » : le flux recommandé pour une
/// app mobile, sans secret client embarqué. La page de connexion s'ouvre dans une
/// feuille système, l'utilisateur ne quitte pas l'app.
enum SpotifyAuth {
    static let scopes = [
        "user-read-playback-state",
        "user-modify-playback-state",
        "user-read-currently-playing",
        "playlist-read-private",
        "playlist-read-collaborative",
    ]
    private static let keychainAccount = "spotify.token"
    /// La session de connexion doit rester en mémoire pendant qu'elle est affichée.
    @MainActor private static var activeSession: ASWebAuthenticationSession?

    // MARK: PKCE

    static func makeVerifier() -> String {
        let chars = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        var g = SystemRandomNumberGenerator()
        return String((0..<64).map { _ in chars[Int(g.next() % UInt64(chars.count))] })
    }

    static func challenge(for verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    // MARK: Stockage

    static func storedToken() -> SpotifyToken? {
        Keychain.load(account: keychainAccount).flatMap { try? JSONDecoder().decode(SpotifyToken.self, from: $0) }
    }

    static func store(_ token: SpotifyToken?) {
        if let token, let data = try? JSONEncoder().encode(token) {
            Keychain.save(data, account: keychainAccount)
        } else {
            Keychain.delete(account: keychainAccount)
        }
    }

    // MARK: Flux de connexion

    @MainActor
    static func signIn() async throws -> SpotifyToken {
        guard let clientID = AppConfig.spotifyClientID else { throw SpotifyAuthError.notConfigured }
        let verifier = makeVerifier()
        let state = UUID().uuidString
        var c = URLComponents(string: "https://accounts.spotify.com/authorize")!
        c.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "redirect_uri", value: AppConfig.spotifyRedirectURI),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "code_challenge", value: challenge(for: verifier)),
            URLQueryItem(name: "scope", value: scopes.joined(separator: " ")),
            URLQueryItem(name: "state", value: state),
        ]

        let callback: URL = try await withCheckedThrowingContinuation { cont in
            let session = ASWebAuthenticationSession(url: c.url!, callbackURLScheme: AppConfig.spotifyCallbackScheme) { url, error in
                if let url { cont.resume(returning: url) }
                else if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                    cont.resume(throwing: SpotifyAuthError.cancelled)
                } else { cont.resume(throwing: error ?? SpotifyAuthError.invalidCallback) }
            }
            session.presentationContextProvider = AuthAnchor.shared
            session.prefersEphemeralWebBrowserSession = false
            activeSession = session
            session.start()
        }

        activeSession = nil
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard items.first(where: { $0.name == "state" })?.value == state,
              let code = items.first(where: { $0.name == "code" })?.value else {
            throw SpotifyAuthError.invalidCallback
        }
        let token = try await requestToken([
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": AppConfig.spotifyRedirectURI,
            "client_id": clientID,
            "code_verifier": verifier,
        ], previousRefresh: nil)
        store(token)
        return token
    }

    static func refresh(_ token: SpotifyToken) async throws -> SpotifyToken {
        guard let clientID = AppConfig.spotifyClientID else { throw SpotifyAuthError.notConfigured }
        let new = try await requestToken([
            "grant_type": "refresh_token",
            "refresh_token": token.refreshToken,
            "client_id": clientID,
        ], previousRefresh: token.refreshToken)
        store(new)
        return new
    }

    private struct TokenResponse: Decodable {
        let access_token: String
        let refresh_token: String?
        let expires_in: Double
    }

    private static func requestToken(_ form: [String: String], previousRefresh: String?) async throws -> SpotifyToken {
        var req = URLRequest(url: URL(string: "https://accounts.spotify.com/api/token")!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        req.httpBody = form.map { k, v in
            "\(k)=\(v.addingPercentEncoding(withAllowedCharacters: allowed) ?? v)"
        }.joined(separator: "&").data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: req)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw SpotifyAuthError.tokenRequestFailed(String(data: data, encoding: .utf8) ?? "erreur inconnue")
        }
        let r = try JSONDecoder().decode(TokenResponse.self, from: data)
        guard let refresh = r.refresh_token ?? previousRefresh else { throw SpotifyAuthError.invalidCallback }
        return SpotifyToken(accessToken: r.access_token, refreshToken: refresh,
                            expiresAt: Date().addingTimeInterval(r.expires_in))
    }
}

/// Fenêtre d'ancrage pour la feuille de connexion.
private final class AuthAnchor: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = AuthAnchor()

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}
