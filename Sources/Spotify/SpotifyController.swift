import Foundation
import UIKit

/// État Spotify affiché dans le mini-lecteur de navigation.
/// Mises à jour optimistes : le bouton réagit tout de suite, l'API confirme ensuite.
@MainActor
final class SpotifyController: ObservableObject {
    struct NowPlaying: Equatable {
        var title: String
        var artist: String
        var artworkURL: URL?
        var isPlaying: Bool
        var deviceName: String?
    }

    @Published private(set) var isConnected: Bool
    @Published private(set) var nowPlaying: NowPlaying?
    @Published private(set) var playlists: [SpotifyPlaylist] = []
    @Published private(set) var trackResults: [SpotifyTrack] = []
    @Published private(set) var playlistResults: [SpotifyPlaylist] = []
    @Published var errorMessage: String?
    @Published private(set) var isWorking = false

    let isConfigured = AppConfig.isSpotifyConfigured
    private let api: SpotifyAPI
    private var pollTask: Task<Void, Never>?
    private var searchTask: Task<Void, Never>?
    private var isDemo = false

    init() {
        let token = SpotifyAuth.storedToken()
        api = SpotifyAPI(token: token)
        isConnected = token != nil && AppConfig.isSpotifyConfigured
    }

    // MARK: Connexion

    func connect() {
        guard isConfigured else {
            errorMessage = SpotifyAuthError.notConfigured.errorDescription
            return
        }
        Task {
            do {
                let token = try await SpotifyAuth.signIn()
                api.setToken(token)
                isConnected = true
                errorMessage = nil
                setActive(true)
                await loadPlaylists()
            } catch SpotifyAuthError.cancelled {
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    /// Mode démonstration (captures d'écran) : un titre fictif, aucun appel réseau.
    func startDemo() {
        isDemo = true
        pollTask?.cancel()
        isConnected = true
        nowPlaying = NowPlaying(title: "Nuit sur l'E19", artist: "AZZ Radio", artworkURL: nil,
                                isPlaying: true, deviceName: "iPhone")
    }

    func disconnect() {
        SpotifyAuth.store(nil)
        api.setToken(nil)
        isConnected = false
        nowPlaying = nil
        playlists = []
        setActive(false)
    }

    /// Interroge Spotify toutes les 5 s seulement quand l'app est au premier plan.
    func setActive(_ active: Bool) {
        pollTask?.cancel()
        pollTask = nil
        guard active, isConnected, !isDemo else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            }
        }
    }

    func refresh() async {
        guard isConnected else { return }
        do {
            if let p = try await api.playback(), let item = p.item {
                nowPlaying = NowPlaying(title: item.name, artist: item.artistLine, artworkURL: item.artworkURL,
                                        isPlaying: p.isPlaying, deviceName: p.device?.name)
            } else {
                nowPlaying = nil
            }
        } catch {
            handle(error, silent: true)
        }
    }

    // MARK: Commandes

    func togglePlayPause() {
        let wasPlaying = nowPlaying?.isPlaying ?? false
        nowPlaying?.isPlaying = !wasPlaying
        guard !isDemo else { return }
        run { [api] in
            if wasPlaying { try await api.pause() } else { try await api.play() }
        }
    }

    func next() { run { [api] in try await api.next() } }
    func previous() { run { [api] in try await api.previous() } }

    func play(playlist: SpotifyPlaylist) { run { [api] in try await api.play(contextURI: playlist.uri) } }
    func play(track: SpotifyTrack) { run { [api] in try await api.play(trackURIs: [track.uri]) } }

    func loadPlaylists() async {
        guard isConnected else { return }
        do { playlists = try await api.playlists() } catch { handle(error, silent: false) }
    }

    /// Recherche avec une courte temporisation pour ne pas lancer une requête par lettre.
    func search(_ query: String) {
        searchTask?.cancel()
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 2 else { trackResults = []; playlistResults = []; return }
        searchTask = Task { [weak self, api] in
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }
            do {
                let r = try await api.search(q)
                guard !Task.isCancelled else { return }
                self?.trackResults = r.tracks
                self?.playlistResults = r.playlists
            } catch {
                self?.handle(error, silent: false)
            }
        }
    }

    func openSpotifyApp() {
        if let url = URL(string: "spotify:") { UIApplication.shared.open(url) }
    }

    /// Exécute une commande ; si aucun appareil n'est actif, réveille ce téléphone
    /// (ou le premier appareil disponible) puis réessaie une fois.
    private func run(_ action: @escaping () async throws -> Void) {
        isWorking = true
        Task { [weak self, api] in
            defer { self?.isWorking = false }
            do {
                try await action()
            } catch SpotifyAPIError.noActiveDevice {
                do {
                    let devices = try await api.devices()
                    let target = devices.first { $0.type == "Smartphone" } ?? devices.first
                    guard let id = target?.id else { throw SpotifyAPIError.noActiveDevice }
                    try await api.transfer(to: id, play: false)
                    try await action()
                } catch {
                    self?.handle(error, silent: false)
                }
            } catch {
                self?.handle(error, silent: false)
            }
            try? await Task.sleep(nanoseconds: 450_000_000)
            await self?.refresh()
        }
    }

    private func handle(_ error: Error, silent: Bool) {
        if case SpotifyAPIError.notSignedIn = error { disconnect(); return }
        if error is CancellationError { return }
        if silent, (error as? URLError) != nil { return }
        errorMessage = error.localizedDescription
    }
}
