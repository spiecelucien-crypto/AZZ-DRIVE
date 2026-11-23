import SwiftUI
import UIKit

/// Assemble les services une seule fois et les relie entre eux.
@MainActor
final class AppModel: ObservableObject {
    /// Instance unique partagée par l'écran iPhone et l'écran CarPlay.
    static let shared = AppModel()

    let settings: AppSettings
    let location: LocationService
    let session: NavigationSession
    let spotify: SpotifyController
    let share: TripShareService
    let speedLimits: SpeedLimitService

    init() {
        let settings = AppSettings()
        let location = LocationService()
        let session = NavigationSession(location: location, settings: settings)
        let spotify = SpotifyController()
        let share = TripShareService()
        let speedLimits = SpeedLimitService()
        self.settings = settings
        self.location = location
        self.session = session
        self.spotify = spotify
        self.share = share
        self.speedLimits = speedLimits

        // Le partage reçoit la progression ; il décide lui-même quand publier.
        session.onProgress = { [weak share, weak settings, weak speedLimits] progress, _, destination in
            guard let settings else { return }
            if settings.showSpeedLimits {
                speedLimits?.update(point: progress.displayPoint, heading: progress.heading)
            }
            guard let share, share.isSharing else { return }
            share.update(progress: progress,
                         destinationName: destination?.name ?? "Destination",
                         driver: settings.driverName.isEmpty ? "Conducteur" : settings.driverName,
                         vehicle: settings.vehicleModel.rawValue)
        }
        session.onNavigationEnded = { [weak share, weak speedLimits] arrived in
            share?.finish(arrived: arrived)
            speedLimits?.reset()
        }
    }
}

/// Demande une orientation (utilisé par la démo pour les captures en paysage).
enum Orientation {
    @MainActor static func request(_ mask: UIInterfaceOrientationMask) {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return }
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { _ in }
    }
}

@main
struct AZZDriveApp: App {
    @StateObject private var model = AppModel.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model.settings)
                .environmentObject(model.session)
                .environmentObject(model.session.live)
                .environmentObject(model.spotify)
                .environmentObject(model.share)
                .environmentObject(model.location)
                .environmentObject(model.speedLimits)
                .preferredColorScheme(.dark)
                .tint(Theme.cyan)
                .onAppear {
                    model.location.requestAccess()
                    let args = ProcessInfo.processInfo.arguments
                    if args.contains("-AZZDemo") {
                        model.session.startDemo(autoStart: !args.contains("-AZZDemoPreview"))
                    }
                    if let i = args.firstIndex(of: "-AZZVehicle"), i + 1 < args.count,
                       let m = VehicleModel(rawValue: args[i + 1]) {
                        model.settings.vehicleModel = m
                    }
                    if let i = args.firstIndex(of: "-AZZMapStyle"), i + 1 < args.count,
                       let style = MapStyle(rawValue: args[i + 1]) {
                        model.settings.mapStyle = style
                    }
                    // Démo de l'interface complète (captures d'écran) : musique et proches fictifs.
                    if args.contains("-AZZDemoHUD") {
                        model.spotify.startDemo()
                        model.share.startDemo()
                        model.speedLimits.startDemo()
                    }
                    if args.contains("-AZZLandscape") {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { Orientation.request(.landscapeRight) }
                    }
                }
        }
        .onChange(of: scenePhase) { _, phase in
            // Pas d'appels Spotify en arrière-plan : économie de batterie et de quota.
            model.spotify.setActive(phase == .active)
        }
    }
}
