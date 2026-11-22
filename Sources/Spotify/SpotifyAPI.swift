import Foundation

// MARK: Modèles (champs optionnels : l'API retire parfois des champs, cf. changements de février 2026)

struct SpotifyImage: Decodable { let url: String; let width: Int?; let height: Int? }
struct SpotifyArtist: Decodable { let name: String }
struct SpotifyAlbum: Decodable { let name: String?; let images: [SpotifyImage]? }

struct SpotifyTrack: Decodable, Identifiable {
    let id: String?
    let uri: String
    let name: String
    let durationMs: Int?
    let artists: [SpotifyArtist]?
    let album: SpotifyAlbum?
    /// Les épisodes de podcast ont une `show` à la place de l'album.
    let show: SpotifyShow?

    var stableID: String { id ?? uri }
    var artistLine: String { artists?.map(\.name).joined(separator: ", ") ?? show?.name ?? "" }
    var artworkURL: URL? {
        let images = album?.images ?? show?.images ?? []
        // La plus petite image suffit pour une vignette : moins de données, affichage plus rapide.
        return (images.min { ($0.width ?? 0) < ($1.width ?? 0) } ?? images.first).flatMap { URL(string: $0.url) }
    }

    enum CodingKeys: String, CodingKey { case id, uri, name, artists, album, show; case durationMs = "duration_ms" }
}

struct SpotifyShow: Decodable { let name: String?; let images: [SpotifyImage]? }

struct SpotifyDevice: Decodable {
    let id: String?
    let isActive: Bool
    let name: String
    let type: String
    enum CodingKeys: String, CodingKey { case id, name, type; case isActive = "is_active" }
}

struct SpotifyPlayback: Decodable {
    let isPlaying: Bool
    let progressMs: Int?
    let item: SpotifyTrack?
    let device: SpotifyDevice?
    enum CodingKeys: String, CodingKey { case item, device; case isPlaying = "is_playing"; case progressMs = "progress_ms" }
}

struct SpotifyPlaylist: Decodable, Identifiable {
    let id: String
    let uri: String
    let name: String
    let images: [SpotifyImage]?
    var artworkURL: URL? { (images?.last ?? images?.first).flatMap { URL(string: $0.url) } }
}

private struct Paging<T: Decodable>: Decodable { let items: [T?] }
private struct DevicesResponse: Decodable { let devices: [SpotifyDevice] }
private struct SearchResponse: Decodable {
    let tracks: Paging<SpotifyTrack>?
    let playlists: Paging<SpotifyPlaylist>?
}

enum SpotifyAPIError: LocalizedError, Equatable {
    case notSignedIn, noActiveDevice, premiumRequired, rateLimited, http(Int, String)

    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "Connectez votre compte Spotify."
        case .noActiveDevice: return "Aucun appareil Spotify actif. Ouvrez Spotify une fois sur ce téléphone."
        case .premiumRequired: return "Le contrôle de la lecture demande Spotify Premium (et un compte autorisé dans le tableau de bord développeur)."
        case .rateLimited: return "Spotify limite temporairement les requêtes. Réessayez dans un instant."
        case .http(let code, let body): return "Erreur Spotify \(code). \(body.prefix(120))"
        }
    }
}

/// Client minimal de l'API Web Spotify : uniquement ce dont la navigation a besoin.
final class SpotifyAPI {
    private var token: SpotifyToken?
    private let base = URL(string: "https://api.spotify.com/v1")!
    private let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 8
        c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }()

    init(token: SpotifyToken?) { self.token = token }

    var isSignedIn: Bool { token != nil }
    func setToken(_ t: SpotifyToken?) { token = t }

    // MARK: Lecture

    func playback() async throws -> SpotifyPlayback? {
        let data = try await send("GET", "me/player", query: [URLQueryItem(name: "additional_types", value: "track,episode")])
        guard let data, !data.isEmpty else { return nil } // 204 : rien en cours
        return try JSONDecoder().decode(SpotifyPlayback.self, from: data)
    }

    func play(contextURI: String? = nil, trackURIs: [String]? = nil, deviceID: String? = nil) async throws {
        var body: [String: Any] = [:]
        if let contextURI { body["context_uri"] = contextURI }
        if let trackURIs { body["uris"] = trackURIs }
        let q = deviceID.map { [URLQueryItem(name: "device_id", value: $0)] } ?? []
        _ = try await send("PUT", "me/player/play", query: q, json: body.isEmpty ? nil : body)
    }

    func pause() async throws { _ = try await send("PUT", "me/player/pause") }
    func next() async throws { _ = try await send("POST", "me/player/next") }
    func previous() async throws { _ = try await send("POST", "me/player/previous") }

    func devices() async throws -> [SpotifyDevice] {
        guard let data = try await send("GET", "me/player/devices") else { return [] }
        return try JSONDecoder().decode(DevicesResponse.self, from: data).devices
    }

    func transfer(to deviceID: String, play: Bool) async throws {
        _ = try await send("PUT", "me/player", json: ["device_ids": [deviceID], "play": play])
    }

    // MARK: Bibliothèque et recherche

    func playlists() async throws -> [SpotifyPlaylist] {
        guard let data = try await send("GET", "me/playlists", query: [URLQueryItem(name: "limit", value: "30")]) else { return [] }
        return try JSONDecoder().decode(Paging<SpotifyPlaylist>.self, from: data).items.compactMap { $0 }
    }

    /// Recherche rapide (limite de 10 résultats par type imposée par Spotify).
    func search(_ q: String) async throws -> (tracks: [SpotifyTrack], playlists: [SpotifyPlaylist]) {
        let data = try await send("GET", "search", query: [
            URLQueryItem(name: "q", value: q),
            URLQueryItem(name: "type", value: "track,playlist"),
            URLQueryItem(name: "limit", value: "10"),
        ])
        guard let data else { return ([], []) }
        let r = try JSONDecoder().decode(SearchResponse.self, from: data)
        return (r.tracks?.items.compactMap { $0 } ?? [], r.playlists?.items.compactMap { $0 } ?? [])
    }

    // MARK: Transport

    @discardableResult
    private func send(_ method: String, _ path: String, query: [URLQueryItem] = [],
                      json: [String: Any]? = nil, retried: Bool = false) async throws -> Data? {
        guard var token else { throw SpotifyAPIError.notSignedIn }
        if token.isExpired {
            token = try await SpotifyAuth.refresh(token)
            self.token = token
        }
        var c = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { c.queryItems = query }
        var req = URLRequest(url: c.url!)
        req.httpMethod = method
        req.setValue("Bearer \(token.accessToken)", forHTTPHeaderField: "Authorization")
        if let json {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: json)
        } else if method != "GET" {
            req.setValue("0", forHTTPHeaderField: "Content-Length")
        }

        let (data, response) = try await session.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        switch code {
        case 200..<300: return code == 204 ? nil : data
        case 401 where !retried:
            self.token = try await SpotifyAuth.refresh(token)
            return try await send(method, path, query: query, json: json, retried: true)
        case 401: throw SpotifyAPIError.notSignedIn
        case 403: throw SpotifyAPIError.premiumRequired
        case 404: throw SpotifyAPIError.noActiveDevice
        case 429: throw SpotifyAPIError.rateLimited
        default: throw SpotifyAPIError.http(code, String(data: data, encoding: .utf8) ?? "")
        }
    }
}
