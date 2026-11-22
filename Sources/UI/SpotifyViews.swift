import SwiftUI

/// Mini-lecteur affiché pendant la conduite : grosses cibles tactiles, aucune navigation.
struct SpotifyMiniPlayer: View {
    @EnvironmentObject private var spotify: SpotifyController
    var onExpand: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 10) {
            Button { onExpand?() } label: {
                HStack(spacing: 10) {
                    AsyncImage(url: spotify.nowPlaying?.artworkURL) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Image(systemName: "music.note").foregroundStyle(Theme.green)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .background(Theme.background)
                    }
                    .frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                    VStack(alignment: .leading, spacing: 1) {
                        Text(spotify.nowPlaying?.title ?? "Spotify")
                            .font(.subheadline.weight(.semibold)).lineLimit(1)
                        Text(spotify.nowPlaying?.artist ?? "Choisir une musique")
                            .font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Ouvrir Spotify")

            control("backward.fill", "Morceau précédent") { spotify.previous() }
            control(spotify.nowPlaying?.isPlaying == true ? "pause.fill" : "play.fill",
                    spotify.nowPlaying?.isPlaying == true ? "Pause" : "Lecture", big: true) { spotify.togglePlayPause() }
            control("forward.fill", "Morceau suivant") { spotify.next() }
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .panel(radius: 18)
    }

    private func control(_ symbol: String, _ label: String, big: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: big ? 22 : 17, weight: .bold))
                .frame(width: big ? 46 : 38, height: 46)
                .background(big ? Theme.green : Color.clear, in: Circle())
                .foregroundStyle(big ? Theme.background : .white)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// Playlists et recherche rapide, en feuille à moitié d'écran pour garder la carte visible.
struct SpotifyBrowserView: View {
    @EnvironmentObject private var spotify: SpotifyController
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    var body: some View {
        NavigationStack {
            List {
                if !spotify.isConnected {
                    Button("Connecter Spotify") { spotify.connect() }
                } else if query.count >= 2 {
                    if !spotify.trackResults.isEmpty {
                        Section("Titres") {
                            ForEach(spotify.trackResults, id: \.stableID) { track in
                                row(title: track.name, subtitle: track.artistLine, artwork: track.artworkURL) {
                                    spotify.play(track: track); dismiss()
                                }
                            }
                        }
                    }
                    if !spotify.playlistResults.isEmpty {
                        Section("Playlists") {
                            ForEach(spotify.playlistResults) { p in
                                row(title: p.name, subtitle: "Playlist", artwork: p.artworkURL) {
                                    spotify.play(playlist: p); dismiss()
                                }
                            }
                        }
                    }
                } else {
                    Section("Mes playlists") {
                        if spotify.playlists.isEmpty {
                            Text("Aucune playlist").foregroundStyle(Theme.muted)
                        }
                        ForEach(spotify.playlists) { p in
                            row(title: p.name, subtitle: "Playlist", artwork: p.artworkURL) {
                                spotify.play(playlist: p); dismiss()
                            }
                        }
                    }
                    Section {
                        Button("Ouvrir l'app Spotify") { spotify.openSpotifyApp() }
                    } footer: {
                        Text("Si aucun son ne sort, lancez Spotify une fois sur ce téléphone pour l'activer comme appareil de lecture.")
                    }
                }
            }
            .searchable(text: $query, prompt: "Titre, artiste, playlist")
            .onChange(of: query) { _, q in spotify.search(q) }
            .navigationTitle("Musique")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } } }
            .task { await spotify.loadPlaylists() }
        }
    }

    private func row(title: String, subtitle: String, artwork: URL?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                AsyncImage(url: artwork) { $0.resizable().scaledToFill() } placeholder: { Theme.panel }
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                VStack(alignment: .leading) {
                    Text(title).lineLimit(1)
                    Text(subtitle).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                }
            }
        }
        .foregroundStyle(.white)
    }
}
