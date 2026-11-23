import SwiftUI
import UIKit

/// Largeurs des colonnes en paysage (partagées avec la carte pour centrer le véhicule entre elles).
enum DriveLayout {
    static let maneuverWidth: CGFloat = 310
    static let sideWidth: CGFloat = 260
}

/// Onglets de la barre du haut pendant la conduite.
enum DriveTab: Hashable { case navigation, musique, trajet }

/// Interface pendant la conduite, inspirée des écrans de voiture :
/// manœuvre en haut à gauche, musique et proches à droite, vitesse en bas.
///
/// Fluidité : panneaux opaques à 85 % sans flou (un flou sur une carte animée
/// à 60 images/s coûte cher au GPU), et chaque panneau n'observe que ses données.
struct NavigatingOverlay: View {
    @EnvironmentObject private var session: NavigationSession
    @EnvironmentObject private var spotify: SpotifyController
    @EnvironmentObject private var share: TripShareService
    @EnvironmentObject private var settings: AppSettings
    @Environment(\.verticalSizeClass) private var verticalSizeClass

    @State private var tab: DriveTab = .navigation
    @State private var showSpotify = false
    @State private var showTrip = false
    @State private var sharedLink: SharedLink?
    @State private var confirmStop = false

    private var landscape: Bool { verticalSizeClass == .compact }

    var body: some View {
        Group {
            if landscape { landscapeLayout } else { portraitLayout }
        }
        .statusBarHidden(true)
        .animation(.easeOut(duration: 0.2), value: session.isFollowing)
        .sheet(isPresented: $showSpotify, onDismiss: { tab = .navigation }) {
            SpotifyBrowserView().presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showTrip, onDismiss: { tab = .navigation }) {
            TripPanel(onShare: shareTrip).presentationDetents([.medium, .large])
        }
        .sheet(item: $sharedLink) { link in ActivityView(items: [link.message, link.url]).presentationDetents([.medium]) }
        .confirmationDialog("Arrêter la navigation ?", isPresented: $confirmStop, titleVisibility: .visible) {
            Button("Arrêter", role: .destructive) { session.stop() }
            Button("Continuer", role: .cancel) {}
        }
        .onChange(of: tab) { _, t in
            switch t {
            case .navigation: break
            case .musique: showSpotify = true
            case .trajet: showTrip = true
            }
        }
    }

    // MARK: Paysage (comme la maquette)

    private var landscapeLayout: some View {
        VStack(spacing: 8) {
            DriveTopBar(tab: $tab, showBrand: true)
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    ManeuverCard(compact: true).frame(width: DriveLayout.maneuverWidth)
                    StatusChips()
                    reactionToast
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 10) {
                    SpotifyCard(onOpen: { tab = .musique }).frame(width: DriveLayout.sideWidth)
                    TripCard(onTap: tripTapped).frame(width: DriveLayout.sideWidth)
                    Spacer(minLength: 0)
                }
            }
            HStack(alignment: .bottom) {
                CameraButton()
                Spacer()
                SpeedPill()
                Spacer()
                StopButton(short: false) { confirmStop = true }
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .padding(.bottom, 2)
    }

    // MARK: Portrait

    private var portraitLayout: some View {
        VStack(spacing: 10) {
            DriveTopBar(tab: $tab, showBrand: false)
            ManeuverCard(compact: true)
            HStack { StatusChips(); Spacer() }
            reactionToast
            Spacer()
            HStack {
                Spacer()
                TripCard(onTap: tripTapped, compact: true)
            }
            SpotifyCard(onOpen: { tab = .musique }, compact: true)
            HStack(alignment: .center) {
                CameraButton()
                Spacer()
                SpeedPill()
                Spacer()
                StopButton(short: true) { confirmStop = true }
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .padding(.bottom, 8)
    }

    @ViewBuilder private var reactionToast: some View {
        if let reaction = share.latestReaction {
            ReactionToast(reaction: reaction) { share.dismissReaction() }
        }
    }

    private func tripTapped() {
        if share.isSharing { tab = .trajet } else { shareTrip() }
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

// MARK: Style commun

/// Panneau sombre translucide, sans flou (léger pour le GPU).
struct DriveCard: ViewModifier {
    var radius: CGFloat = 22
    func body(content: Content) -> some View {
        content
            .background(Theme.hud.opacity(0.86), in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
            .shadow(color: .black.opacity(0.35), radius: 10, y: 4)
    }
}

extension View {
    func driveCard(radius: CGFloat = 22) -> some View { modifier(DriveCard(radius: radius)) }
}

// MARK: Barre du haut

private struct DriveTopBar: View {
    @Binding var tab: DriveTab
    let showBrand: Bool
    private var compactTabs: Bool { !showBrand }
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var session: NavigationSession

    var body: some View {
        HStack(spacing: 12) {
            if showBrand {
                HStack(spacing: 10) {
                    AZZLogo().stroke(.white, style: StrokeStyle(lineWidth: 3.2, lineJoin: .round)).frame(width: 30, height: 24)
                    Text("AZZ DRIVE").font(.system(size: 19, weight: .heavy)).italic().fixedSize()
                }
                .frame(minWidth: 150, alignment: .leading)
            }
            Spacer(minLength: 0)
            HStack(spacing: 4) {
                tabButton(.navigation, "Navigation", "location.north.fill")
                tabButton(.musique, "Musique", "music.note")
                tabButton(.trajet, "Trajet", "person.2.fill")
            }
            .padding(.horizontal, 6)
            .driveCard(radius: 18)
            Spacer(minLength: 0)
            HStack(spacing: 14) {
                Button { session.toggleMute() } label: {
                    Image(systemName: settings.voiceMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(settings.voiceMuted ? Theme.danger : .white)
                        .frame(width: 36, height: 36)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(settings.voiceMuted ? "Réactiver la voix" : "Couper la voix")
                if showBrand {
                    TimelineView(.everyMinute) { ctx in
                        Text(ctx.date, format: .dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
                            .font(.system(size: 20, weight: .semibold)).monospacedDigit()
                    }
                }
            }
            .frame(minWidth: showBrand ? 150 : 0, alignment: .trailing)
        }
    }

    private func tabButton(_ t: DriveTab, _ title: String, _ icon: String) -> some View {
        let selected = tab == t
        return Button { tab = t } label: {
            VStack(spacing: 6) {
                Label(title, systemImage: icon)
                    .font(.system(size: compactTabs ? 13 : 15, weight: .semibold))
                    .labelStyle(.titleAndIcon)
                    .lineLimit(1)
                    .fixedSize()
                    .foregroundStyle(selected ? Color.white : Color.white.opacity(0.6))
                Capsule().fill(selected ? Color.white : .clear).frame(height: 3)
            }
            .padding(.horizontal, compactTabs ? 8 : 12)
            .padding(.top, showBrand ? 8 : 10)
            .padding(.bottom, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// Logo « A » d'AZZ DRIVE.
private struct AZZLogo: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.maxY))
        p.addLine(to: CGPoint(x: r.midX, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        p.move(to: CGPoint(x: r.minX + r.width * 0.3, y: r.maxY - r.height * 0.28))
        p.addLine(to: CGPoint(x: r.maxX - r.width * 0.12, y: r.maxY))
        return p
    }
}

// MARK: Manœuvre

/// Seul élément redessiné à chaque position (il observe `LiveGuidance`, pas la session entière).
private struct ManeuverCard: View {
    @EnvironmentObject private var live: LiveGuidance
    let compact: Bool

    var body: some View {
        let kind = live.maneuver?.kind ?? .straight
        let instruction = live.maneuver?.instruction ?? ""
        let street = ManeuverText.streetName(from: instruction)
        let detailed: Set<ManeuverKind> = [.roundabout, .exitLeft, .exitRight, .merge, .ferry]
        let subtitle: String? = detailed.contains(kind) && !instruction.isEmpty ? instruction : street
        let p = live.progress

        VStack(spacing: 0) {
            HStack(spacing: compact ? 14 : 18) {
                Image(systemName: kind.symbolName)
                    .font(.system(size: compact ? 44 : 58, weight: .bold))
                    .frame(width: compact ? 60 : 80, height: compact ? 60 : 80)
                    .foregroundStyle(.white)
                VStack(alignment: .leading, spacing: 2) {
                    Text(NavFormat.distance(p?.distanceToNextManeuver ?? 0))
                        .font(.system(size: compact ? 34 : 42, weight: .bold, design: .rounded))
                        .monospacedDigit()
                    Text(kind.shortLabel)
                        .font(.system(size: compact ? 19 : 23, weight: .semibold))
                        .lineLimit(1).minimumScaleFactor(0.8)
                    if let subtitle {
                        Text(subtitle)
                            .font(.system(size: compact ? 16 : 19))
                            .foregroundStyle(Color.white.opacity(0.65))
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, compact ? 12 : 16)

            Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1).padding(.horizontal, 16)

            HStack(spacing: 0) {
                stat("timer", NavFormat.duration(p?.remainingTime ?? 0))
                divider
                stat("flag.checkered", NavFormat.distance(p?.remainingDistance ?? 0))
                divider
                stat("clock", ETAFormat.arrival(in: p?.remainingTime ?? 0), tint: Theme.green)
            }
            .padding(.vertical, compact ? 10 : 12)
        }
        .driveCard()
        // Progression du trajet, discrète, en bas du panneau.
        .overlay(alignment: .bottom) {
            GeometryReader { g in
                Capsule().fill(Theme.cyan.opacity(0.9))
                    .frame(width: max(6, (g.size.width - 40) * CGFloat(p?.fraction ?? 0)), height: 3)
                    .offset(x: 20)
            }
            .frame(height: 3)
            .padding(.bottom, 3)
        }
        .accessibilityElement(children: .combine)
    }

    private var divider: some View {
        Rectangle().fill(Color.white.opacity(0.12)).frame(width: 1, height: 26)
    }

    private func stat(_ icon: String, _ value: String, tint: Color = .white) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 19, weight: .medium)).foregroundStyle(Color.white.opacity(0.8))
            Text(value).font(.system(size: 20, weight: .medium)).monospacedDigit().foregroundStyle(tint)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }
}

/// Recalcul en cours, simulation : petites pastilles sous la manœuvre.
private struct StatusChips: View {
    @EnvironmentObject private var session: NavigationSession
    @EnvironmentObject private var settings: AppSettings

    var body: some View {
        HStack(spacing: 8) {
            if session.isRerouting {
                chip("Recalcul…", "arrow.triangle.2.circlepath")
            }
            if session.isSimulating {
                chip("Simulation ×\(Int(settings.simulationSpeed))", "play.circle.fill")
                    .onTapGesture {
                        let speeds: [Double] = [1, 2, 4, 8]
                        let i = speeds.firstIndex(of: settings.simulationSpeed) ?? 0
                        settings.simulationSpeed = speeds[(i + 1) % speeds.count]
                    }
            }
        }
    }

    private func chip(_ text: String, _ icon: String) -> some View {
        Label(text, systemImage: icon)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 12).padding(.vertical, 8)
            .driveCard(radius: 12)
    }
}

// MARK: Vitesse

private struct SpeedPill: View {
    @EnvironmentObject private var live: LiveGuidance
    @EnvironmentObject private var limits: SpeedLimitService
    @EnvironmentObject private var settings: AppSettings

    var body: some View {
        let speed = Int(((live.progress?.speed ?? 0) * 3.6).rounded())
        let limit = settings.showSpeedLimits ? limits.limitKmh : nil
        let over = limit.map { speed > $0 + 3 } ?? false
        HStack(spacing: 22) {
            VStack(spacing: -2) {
                Text("\(speed)")
                    .font(.system(size: 40, weight: .bold, design: .rounded)).monospacedDigit()
                    .foregroundStyle(over ? Theme.danger : .white)
                    .contentTransition(.numericText())
                Text("km/h").font(.system(size: 15, weight: .medium)).foregroundStyle(Color.white.opacity(0.75))
            }
            .frame(minWidth: 76)
            if let limit {
                Rectangle().fill(Color.white.opacity(0.15)).frame(width: 1, height: 44)
                SpeedLimitSign(limit: limit, size: 52)
            }
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 8)
        .driveCard(radius: 26)
        .animation(.easeOut(duration: 0.2), value: limit)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Vitesse \(speed) kilomètres heure" + (limit.map { ", limitée à \($0)" } ?? ""))
    }
}

/// Panneau de limitation européen : cercle rouge, chiffre noir.
struct SpeedLimitSign: View {
    let limit: Int
    var size: CGFloat = 58

    var body: some View {
        ZStack {
            Circle().fill(.white)
            Circle().strokeBorder(Color(red: 0.85, green: 0.1, blue: 0.12), lineWidth: size * 0.12)
            Text("\(limit)")
                .font(.system(size: size * (limit >= 100 ? 0.36 : 0.42), weight: .bold, design: .rounded))
                .foregroundStyle(.black)
        }
        .frame(width: size, height: size)
    }
}

// MARK: Boutons du bas

/// Recentre la carte ; quand elle suit déjà, bascule poursuite ↔ vue d'ensemble.
private struct CameraButton: View {
    @EnvironmentObject private var session: NavigationSession
    @EnvironmentObject private var settings: AppSettings

    var body: some View {
        let following = session.isFollowing
        Button {
            if following { session.toggleCameraMode() } else { session.recenter() }
        } label: {
            Image(systemName: following ? (settings.cameraMode == .chase ? "location.north.fill" : "view.3d")
                                        : "location.north.line.fill")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(following ? .white : Theme.cyan)
                .frame(width: 62, height: 62)
                .background(Theme.hud.opacity(0.86), in: Circle())
                .overlay(Circle().stroke(following ? Color.white.opacity(0.08) : Theme.cyan, lineWidth: following ? 1 : 2))
                .shadow(color: .black.opacity(0.35), radius: 10, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(following ? "Changer de vue" : "Recentrer")
    }
}

private struct StopButton: View {
    let short: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                RoundedRectangle(cornerRadius: 3).fill(Theme.danger).frame(width: 20, height: 20)
                Text(short ? "Arrêter" : "Arrêter la navigation")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(Theme.danger)
            }
            .padding(.horizontal, short ? 18 : 26)
            .frame(height: 58)
            .background(Theme.hud.opacity(0.9), in: Capsule())
            .overlay(Capsule().stroke(Theme.danger.opacity(0.85), lineWidth: 1.5))
            .shadow(color: .black.opacity(0.35), radius: 10, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Arrêter la navigation")
    }
}

// MARK: Spotify

private struct SpotifyCard: View {
    @EnvironmentObject private var spotify: SpotifyController
    let onOpen: () -> Void
    var compact = false

    var body: some View {
        Group {
            if compact { compactBody } else { fullBody }
        }
        .driveCard()
    }

    private var fullBody: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                SpotifyBadge(size: 28)
                Text("Spotify").font(.system(size: 17, weight: .semibold))
                Spacer()
            }
            if spotify.isConnected {
                Button(action: onOpen) {
                    HStack(spacing: 12) {
                        artwork(40)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(spotify.nowPlaying?.title ?? "Choisir une musique")
                                .font(.system(size: 16, weight: .medium)).lineLimit(1)
                            Text(spotify.nowPlaying?.artist ?? "Playlists et recherche")
                                .font(.system(size: 14)).foregroundStyle(Color.white.opacity(0.6)).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ouvrir la musique")
                controls
            } else {
                connectPrompt
            }
        }
        .padding(10)
    }

    private var compactBody: some View {
        HStack(spacing: 10) {
            if spotify.isConnected {
                Button(action: onOpen) {
                    HStack(spacing: 10) {
                        artwork(44)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(spotify.nowPlaying?.title ?? "Spotify").font(.subheadline.weight(.semibold)).lineLimit(1)
                            Text(spotify.nowPlaying?.artist ?? "Choisir une musique")
                                .font(.caption).foregroundStyle(Color.white.opacity(0.6)).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ouvrir la musique")
                controls.frame(width: 160)
            } else {
                SpotifyBadge(size: 30)
                connectPrompt
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
    }

    private var controls: some View {
        HStack {
            control("backward.end.fill", "Morceau précédent", size: 20) { spotify.previous() }
            Spacer()
            Button { spotify.togglePlayPause() } label: {
                Image(systemName: spotify.nowPlaying?.isPlaying == true ? "pause.fill" : "play.fill")
                    .font(.system(size: compact ? 18 : 20, weight: .bold))
                    .frame(width: compact ? 44 : 48, height: compact ? 44 : 48)
                    .overlay(Circle().stroke(Color.white.opacity(0.7), lineWidth: 1.5))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(spotify.nowPlaying?.isPlaying == true ? "Pause" : "Lecture")
            Spacer()
            control("forward.end.fill", "Morceau suivant", size: 20) { spotify.next() }
        }
        .padding(.horizontal, compact ? 0 : 12)
    }

    @ViewBuilder private var connectPrompt: some View {
        if spotify.isConfigured {
            Button { spotify.connect() } label: {
                Text("Connecter Spotify")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Theme.spotify, in: Capsule())
                    .foregroundStyle(.black)
            }
            .buttonStyle(.plain)
        } else {
            Text("Ajoutez SPOTIFY_CLIENT_ID (voir README) pour piloter la musique ici.")
                .font(.footnote).foregroundStyle(Color.white.opacity(0.6))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func artwork(_ size: CGFloat) -> some View {
        AsyncImage(url: spotify.nowPlaying?.artworkURL) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            Image(systemName: "music.note").font(.system(size: size * 0.4)).foregroundStyle(Theme.spotify)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(LinearGradient(colors: [Color(white: 0.2), Color(white: 0.08)], startPoint: .top, endPoint: .bottom))
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private func control(_ symbol: String, _ label: String, size: CGFloat, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: size, weight: .bold))
                .frame(width: 44, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// Pastille verte « ondes » (on n'embarque pas le logo officiel).
struct SpotifyBadge: View {
    var size: CGFloat = 32
    var body: some View {
        Image(systemName: "dot.radiowaves.right")
            .font(.system(size: size * 0.45, weight: .bold))
            .foregroundStyle(.black)
            .frame(width: size, height: size)
            .background(Theme.spotify, in: Circle())
            .accessibilityHidden(true)
    }
}

// MARK: Trajet partagé

private struct TripCard: View {
    @EnvironmentObject private var share: TripShareService
    let onTap: () -> Void
    var compact = false

    var body: some View {
        Button(action: onTap) {
            if compact { compactBody } else { fullBody }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(share.isSharing ? "Trajet partagé, \(TripViewers.summary(count: share.viewers.count))" : "Partager le trajet")
    }

    private var fullBody: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 10) {
                Image(systemName: share.isSharing ? "person.2.fill" : "square.and.arrow.up")
                    .font(.system(size: 17, weight: .semibold))
                Text(share.isSharing ? "Trajet partagé" : "Partager le trajet")
                    .font(.system(size: 17, weight: .semibold))
                if share.isSharing { Circle().fill(Theme.green).frame(width: 9, height: 9) }
                Spacer(minLength: 0)
            }
            Text(share.isSharing ? TripViewers.summary(count: share.viewers.count) : "Vos proches suivent votre arrivée")
                .font(.system(size: 14)).foregroundStyle(Color.white.opacity(0.65)).lineLimit(1)
            HStack {
                ViewerAvatars(viewers: share.viewers, size: 30)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.white.opacity(0.7))
            }
            .frame(minHeight: 30)
        }
        .padding(10)
        .driveCard()
    }

    private var compactBody: some View {
        HStack(spacing: 8) {
            if share.isSharing {
                Circle().fill(Theme.green).frame(width: 8, height: 8)
                ViewerAvatars(viewers: share.viewers, size: 26)
                Text(share.viewers.isEmpty ? "Partagé" : "\(share.viewers.count) suivent")
                    .font(.subheadline.weight(.semibold))
            } else {
                Image(systemName: "person.2.fill")
                Text("Partager").font(.subheadline.weight(.semibold))
            }
            Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(Color.white.opacity(0.6))
        }
        .padding(.horizontal, 12).frame(height: 42)
        .driveCard(radius: 21)
    }
}

struct ViewerAvatars: View {
    let viewers: [TripViewer]
    var size: CGFloat = 36
    private static let palette: [Color] = [Color(red: 0.95, green: 0.55, blue: 0.4), Color(red: 0.55, green: 0.6, blue: 0.98),
                                           Color(red: 0.4, green: 0.82, blue: 0.7), Color(red: 0.95, green: 0.75, blue: 0.35)]

    var body: some View {
        HStack(spacing: -size * 0.28) {
            ForEach(Array(viewers.prefix(4).enumerated()), id: \.offset) { i, v in
                Text(TripViewers.initials(v.name))
                    .font(.system(size: size * 0.38, weight: .bold))
                    .foregroundStyle(.black.opacity(0.8))
                    .frame(width: size, height: size)
                    .background(Self.palette[i % Self.palette.count], in: Circle())
                    .overlay(Circle().stroke(Theme.hud, lineWidth: 2))
            }
            if viewers.count > 4 {
                Text("+\(viewers.count - 4)").font(.caption.weight(.bold))
                    .frame(width: size, height: size)
                    .background(Color(white: 0.25), in: Circle())
            }
        }
    }
}

/// Détail du partage : lien, proches connectés, arrêt.
private struct TripPanel: View {
    @EnvironmentObject private var share: TripShareService
    @Environment(\.dismiss) private var dismiss
    let onShare: () -> Void

    var body: some View {
        NavigationStack {
            List {
                if share.isSharing {
                    Section {
                        if let url = share.shareURL {
                            ShareLink(item: url, message: Text("Suivez mon trajet en direct sur AZZ DRIVE")) {
                                Label("Renvoyer le lien", systemImage: "square.and.arrow.up")
                            }
                        }
                        Label("\(share.reactionCount) signe(s) reçu(s)", systemImage: "hand.wave.fill")
                    } footer: {
                        Text("Vos proches voient votre position, votre heure d'arrivée et peuvent vous envoyer un signe. Le lien expire après 12 h.")
                    }
                    Section(TripViewers.summary(count: share.viewers.count)) {
                        ForEach(Array(share.viewers.enumerated()), id: \.offset) { _, v in
                            HStack(spacing: 12) {
                                ViewerAvatars(viewers: [v], size: 32)
                                Text(v.name)
                            }
                        }
                    }
                    Section {
                        Button("Arrêter le partage", role: .destructive) { share.finish(arrived: false); dismiss() }
                    }
                } else {
                    Section {
                        Button { dismiss(); onShare() } label: {
                            Label("Partager mon trajet en direct", systemImage: "person.2.wave.2.fill")
                        }
                    } footer: {
                        Text("Envoyez un lien : vos proches suivent votre progression sur une carte, sans installer d'application.")
                    }
                }
            }
            .navigationTitle("Trajet")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } } }
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
        .driveCard(radius: 16)
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
