import SwiftUI

/// Assemble les services une seule fois et les relie entre eux.
@MainActor
final class AppModel: ObservableObject {
    let settings: AppSettings
    let location: LocationService
    let session: NavigationSession
    let spotify: SpotifyController
    let share: TripShareService

    init() {
        let settings = AppSettings()
        let location = LocationService()
        let session = NavigationSession(location: location, settings: settings)
        let spotify = SpotifyController()
        let share = TripShareService()
        self.settings = settings
        self.location = location
        self.session = session
        self.spotify = spotify
        self.share = share

        // Le partage reçoit la progression ; il décide lui-même quand publier.
        session.onProgress = { [weak share, weak settings] progress, _, destination in
            guard let share, let settings, share.isSharing else { return }
            share.update(progress: progress,
                         destinationName: destination?.name ?? "Destination",
                         driver: settings.driverName.isEmpty ? "Conducteur" : settings.driverName,
                         vehicle: settings.vehicleModel.rawValue)
        }
        session.onNavigationEnded = { [weak share] arrived in
            share?.finish(arrived: arrived)
        }
    }
}

@main
struct AZZDriveApp: App {
    @StateObject private var model = AppModel()
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
                }
        }
        .onChange(of: scenePhase) { _, phase in
            // Pas d'appels Spotify en arrière-plan : économie de batterie et de quota.
            model.spotify.setActive(phase == .active)
        }
    }
}
