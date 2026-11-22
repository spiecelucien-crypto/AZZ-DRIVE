import SwiftUI
import UIKit

/// Interface pendant la conduite : bandeau de manœuvre, barre d'arrivée,
/// mini-lecteur Spotify et partage. Gros boutons, peu de texte.
struct NavigatingOverlay: View {
    @EnvironmentObject private var session: NavigationSession
    @EnvironmentObject private var spotify: SpotifyController
    @EnvironmentObject private var share: TripShareService
    @EnvironmentObject private var settings: AppSettings
    @State private var showSpotify = false
    @State private var sharedLink: SharedLink?
    @State private var confirmStop = false

    var body: some View {
        VStack(spacing: 10) {
            ManeuverBanner()

            HStack {
                if session.isRerouting {
                    Label("Recalcul…", systemImage: "arrow.triangle.2.circlepath")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .panel(radius: 12)
                }
                if session.isSimulating {
                    Label("Simulation ×\(Int(settings.simulationSpeed))", systemImage: "play.circle.fill")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .panel(radius: 12)
                        .onTapGesture { cycleSimulationSpeed() }
                }
                Spacer()
                VStack(spacing: 10) {
                    RoundButton(systemName: settings.voiceMuted ? "speaker.slash.fill" : "speaker.wave.2.fill",
                                size: 46, label: settings.voiceMuted ? "Réactiver la voix" : "Couper la voix") {
                        session.toggleMute()
                    }
                    RoundButton(systemName: share.isSharing ? "person.2.wave.2.fill" : "person.2.fill",
                                tint: share.isSharing ? Theme.green : .white,
                                size: 46, label: "Partager le trajet") { shareTrip() }
                }
            }

            if let reaction = share.latestReaction {
                ReactionToast(reaction: reaction) { share.dismissReaction() }
            }

            Spacer()

            HStack {
                Spacer()
                if !session.isFollowing {
                    Button { session.recenter() } label: {
                        Label("Recentrer", systemImage: "location.north.line.fill")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 16).frame(height: 44)
                            .background(Theme.cyan, in: Capsule())
                            .foregroundStyle(Theme.background)
                    }
                    .buttonStyle(.plain)
                    .transition(.scale.combined(with: .opacity))
                }
            }

            if spotify.isConnected {
                SpotifyMiniPlayer(onExpand: { showSpotify = true })
            }

            TripBottomBar(onStop: { confirmStop = true })
        }
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .padding(.bottom, 8)
        .animation(.easeOut(duration: 0.2), value: session.isFollowing)
        .sheet(isPresented: $showSpotify) { SpotifyBrowserView().presentationDetents([.medium, .large]) }
        .sheet(item: $sharedLink) { link in ActivityView(items: [link.message, link.url]).presentationDetents([.medium]) }
        .confirmationDialog("Arrêter la navigation ?", isPresented: $confirmStop, titleVisibility: .visible) {
            Button("Arrêter", role: .destructive) { session.stop() }
            Button("Continuer", role: .cancel) {}
        }
    }

    private func cycleSimulationSpeed() {
        let speeds: [Double] = [1, 2, 4, 8]
        let i = speeds.firstIndex(of: settings.simulationSpeed) ?? 0
        settings.simulationSpeed = speeds[(i + 1) % speeds.count]
    }

    private func shareTrip() {
        guard let route = session.activeRoute else { return }
        let destination = session.destination?.name ?? "ma destination"
        let driver = settings.driverName.isEmpty ? "Conducteur" : settings.driverName
        Task {
            if let url = await share.start(route: route, destinationName: destination,
                                           driver: driver, vehicle: settings.vehicleModel.rawValue) {
                sharedLink = SharedLink(url: url, message: "Suivez mon trajet vers \(destination) en direct sur AZZ DRIVE :")
                // Publie tout de suite une première position, sans attendre la suivante.
                if let p = session.live.progress {
                    share.update(progress: p, destinationName: destination, driver: driver,
                                 vehicle: settings.vehicleModel.rawValue)
                }
            }
        }
    }
}

struct SharedLink: Identifiable {
    let url: URL
    let message: String
    var id: String { url.absoluteString }
}

/// Bandeau de manœuvre : seul élément redessiné à chaque position.
private struct ManeuverBanner: View {
    @EnvironmentObject private var live: LiveGuidance

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: live.maneuver?.kind.symbolName ?? "arrow.up")
                .font(.system(size: 34, weight: .bold))
                .frame(width: 56, height: 56)
                .background(Theme.cyan.opacity(0.18), in: RoundedRectangle(cornerRadius: 14))
                .foregroundStyle(Theme.cyan)
            VStack(alignment: .leading, spacing: 2) {
                Text(NavFormat.distance(live.progress?.distanceToNextManeuver ?? 0))
                    .font(.system(size: 30, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                Text(live.maneuver?.instruction.isEmpty == false ? live.maneuver!.instruction : "Suivez l'itinéraire")
                    .font(.headline)
                    .lineLimit(2)
                    .foregroundStyle(.white.opacity(0.9))
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Theme.panel.opacity(0.95), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Theme.line, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

/// Heure d'arrivée, temps et distance restants, vitesse, bouton d'arrêt.
private struct TripBottomBar: View {
    @EnvironmentObject private var live: LiveGuidance
    let onStop: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            Button(action: onStop) {
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .bold))
                    .frame(width: 48, height: 48)
                    .background(Theme.danger.opacity(0.9), in: Circle())
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Arrêter la navigation")

            let p = live.progress
            VStack(alignment: .leading, spacing: 2) {
                Text(ETAFormat.arrival(in: p?.remainingTime ?? 0))
                    .font(.system(size: 24, weight: .heavy, design: .rounded)).monospacedDigit()
                    .foregroundStyle(Theme.green)
                Text("Arrivée").font(.caption2).foregroundStyle(Theme.muted)
            }
            Divider().frame(height: 34).overlay(Theme.line)
            VStack(alignment: .leading, spacing: 2) {
                Text(NavFormat.duration(p?.remainingTime ?? 0)).font(.headline).monospacedDigit()
                Text(NavFormat.distance(p?.remainingDistance ?? 0)).font(.caption).foregroundStyle(Theme.muted).monospacedDigit()
            }
            Spacer()
            VStack(spacing: 0) {
                Text("\(Int(((p?.speed ?? 0) * 3.6).rounded()))")
                    .font(.system(size: 22, weight: .heavy, design: .rounded)).monospacedDigit()
                Text("km/h").font(.caption2).foregroundStyle(Theme.muted)
            }
            .frame(width: 60, height: 52)
            .background(Theme.background.opacity(0.6), in: RoundedRectangle(cornerRadius: 12))
        }
        .padding(12)
        .background(Theme.panel.opacity(0.95), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Theme.line, lineWidth: 1))
        // Barre de progression du trajet.
        .overlay(alignment: .top) {
            GeometryReader { g in
                Capsule().fill(Theme.cyan)
                    .frame(width: max(8, g.size.width * CGFloat(live.progress?.fraction ?? 0)), height: 3)
            }
            .frame(height: 3)
            .padding(.horizontal, 22)
        }
    }
}

private struct ReactionToast: View {
    let reaction: TripReaction
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Text(reaction.emoji).font(.system(size: 28))
            VStack(alignment: .leading, spacing: 0) {
                Text(reaction.from).font(.subheadline.weight(.semibold))
                Text("suit votre trajet").font(.caption).foregroundStyle(Theme.muted)
            }
            Spacer()
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .panel(radius: 16)
        .frame(maxWidth: 260)
        .frame(maxWidth: .infinity, alignment: .leading)
        .transition(.move(edge: .leading).combined(with: .opacity))
        .task(id: reaction.atMs) {
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            onDismiss()
        }
    }
}

/// Feuille de partage système (Messages, WhatsApp, etc.).
struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}
