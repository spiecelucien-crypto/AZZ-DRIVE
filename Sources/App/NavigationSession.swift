import Foundation
import MapKit
import QuartzCore
import UIKit

/// Données qui changent à chaque position (jusqu'à 10 fois par seconde).
/// Séparées de `NavigationSession` pour que seul le bandeau de guidage se
/// redessine, et pas la carte ni le reste de l'écran.
@MainActor
final class LiveGuidance: ObservableObject {
    @Published var progress: NavigationProgress?
    @Published var maneuver: RouteManeuver?
}

/// Chef d'orchestre du flux complet :
/// recherche → aperçu des itinéraires → démarrage → guidage → recalcul → arrivée.
@MainActor
final class NavigationSession: ObservableObject {
    enum Phase: Equatable { case explore, preview, navigating, arrived }

    @Published private(set) var phase: Phase = .explore
    @Published private(set) var searchResults: [MKMapItem] = []
    @Published private(set) var destination: MKMapItem?
    @Published private(set) var routes: [RoutePlan] = []
    @Published var selectedRouteID: UUID?
    @Published private(set) var activeRoute: RoutePlan?
    @Published private(set) var isBusy = false
    @Published private(set) var isRerouting = false
    @Published var message: String?
    /// La caméra suit le véhicule. Passe à `false` dès que l'utilisateur déplace la carte.
    @Published var isFollowing = true
    /// Incrémenté pour demander à la carte de se recentrer.
    @Published private(set) var recenterToken = 0
    @Published private(set) var isSimulating = false

    let live = LiveGuidance()
    let location: LocationService
    let settings: AppSettings
    let speech = SpeechService()
    /// Lus à chaque image par la carte (hors SwiftUI, pour la fluidité).
    let interpolator = PoseInterpolator()
    let cameraRig = CameraRig()

    /// Appelé à chaque progression et à l'arrivée : branche le partage aux proches.
    var onProgress: ((NavigationProgress, RoutePlan, MKMapItem?) -> Void)?
    var onNavigationEnded: ((_ arrived: Bool) -> Void)?

    private var engine: NavigationEngine?
    private var simulation: RouteDriveSimulation?
    private var simulationTask: Task<Void, Never>?
    private var lastRerouteTime: TimeInterval = -.infinity
    private var hasCenteredOnUser = false

    init(location: LocationService, settings: AppSettings) {
        self.location = location
        self.settings = settings
        location.onLocation = { [weak self] loc in
            MainActor.assumeIsolated { self?.handleRealLocation(loc) }
        }
    }

    var selectedRoute: RoutePlan? { routes.first { $0.id == selectedRouteID } ?? routes.first }

    // MARK: Recherche et aperçu

    func search(_ query: String) {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { searchResults = []; return }
        let region = location.lastLocation.map {
            MKCoordinateRegion(center: $0.coordinate, latitudinalMeters: 50_000, longitudinalMeters: 50_000)
        }
        isBusy = true
        Task { @MainActor in
            defer { isBusy = false }
            do {
                searchResults = try await RouteService.search(q, near: region)
                if searchResults.isEmpty { message = "Aucun résultat pour « \(q) »." }
            } catch {
                message = "Recherche impossible. Vérifiez la connexion."
            }
        }
    }

    func clearSearch() { searchResults = [] }

    func preview(_ item: MKMapItem) {
        searchResults = []
        destination = item
        guard let origin = location.lastLocation?.coordinate else {
            message = RouteError.noLocation.errorDescription
            location.requestAccess()
            return
        }
        isBusy = true
        Task { @MainActor in
            defer { isBusy = false }
            do {
                let plans = try await RouteService.routes(from: origin, to: item, options: settings.routeOptions)
                routes = plans
                selectedRouteID = plans.first?.id
                phase = .preview
            } catch {
                message = (error as? LocalizedError)?.errorDescription ?? "Itinéraire indisponible."
                phase = .explore
            }
        }
    }

    func cancelPreview() {
        routes = []
        destination = nil
        selectedRouteID = nil
        phase = .explore
    }

    // MARK: Navigation active

    func start() {
        guard let route = selectedRoute else { return }
        if !settings.simulateDrive && !location.isAuthorized {
            message = "Autorisez la localisation pour démarrer, ou activez la conduite simulée dans les réglages."
            location.requestAccess()
            return
        }
        begin(route: route, announce: true)
        UIApplication.shared.isIdleTimerDisabled = true
        location.beginNavigation()
        if settings.simulateDrive {
            startSimulation(on: route)
        } else if let loc = location.lastLocation {
            ingest(loc.positionFix(time: CACurrentMediaTime()))
        }
    }

    private func begin(route: RoutePlan, announce: Bool) {
        let engine = NavigationEngine(route: route)
        self.engine = engine
        activeRoute = route
        routes = [route]
        selectedRouteID = route.id
        interpolator.setPath(route.path)
        if let lastPoint = live.progress?.displayPoint ?? location.lastLocation?.geoPoint ?? route.path.start {
            interpolator.ingest(point: lastPoint, distanceAlong: route.path.match(lastPoint)?.distanceAlong ?? 0,
                                heading: route.path.bearing(at: 0), speed: 0, time: CACurrentMediaTime())
        }
        cameraRig.reset()
        isFollowing = true
        phase = .navigating
        speech.isMuted = settings.voiceMuted
        if announce { speech.speak(engine.departureAnnouncement()) }
    }

    func stop() {
        endNavigation(arrived: false)
        cancelPreview()
    }

    func recenter() {
        isFollowing = true
        recenterToken += 1
    }

    func toggleMute() {
        settings.voiceMuted.toggle()
        speech.isMuted = settings.voiceMuted
        if settings.voiceMuted { speech.stop() }
    }

    private func endNavigation(arrived: Bool) {
        simulationTask?.cancel()
        simulationTask = nil
        simulation = nil
        isSimulating = false
        engine = nil
        activeRoute = nil
        live.progress = nil
        live.maneuver = nil
        interpolator.setPath(nil)
        if let loc = location.lastLocation {
            interpolator.ingest(point: loc.geoPoint, distanceAlong: nil, heading: max(0, loc.course),
                                speed: 0, time: CACurrentMediaTime())
        }
        location.endNavigation()
        UIApplication.shared.isIdleTimerDisabled = false
        if !arrived { speech.stop() }
        onNavigationEnded?(arrived)
    }

    // MARK: Positions

    private func handleRealLocation(_ loc: CLLocation) {
        let now = CACurrentMediaTime()
        if !hasCenteredOnUser {
            hasCenteredOnUser = true
            recenterToken += 1
        }
        if phase == .navigating {
            // Pendant une simulation, le vrai GPS est ignoré.
            if simulation == nil { ingest(loc.positionFix(time: now)) }
        } else {
            interpolator.ingest(point: loc.geoPoint, distanceAlong: nil,
                                heading: loc.course >= 0 ? loc.course : 0,
                                speed: max(0, loc.speed), time: now)
        }
    }

    private func ingest(_ fix: PositionFix) {
        guard let engine else { return }
        let (progress, events) = engine.update(fix)
        interpolator.ingest(point: progress.displayPoint,
                            distanceAlong: progress.isOnRoute ? progress.distanceAlong : nil,
                            heading: progress.heading, speed: progress.speed, time: fix.timestamp)
        live.progress = progress
        let maneuver = progress.nextManeuverIndex.map { engine.route.maneuvers[$0] }
        if live.maneuver != maneuver { live.maneuver = maneuver }
        onProgress?(progress, engine.route, destination)

        for event in events {
            switch event {
            case .announce(let text): speech.speak(text)
            case .offRoute: reroute(from: fix)
            case .arrived: arrive()
            case .maneuverChanged: break
            }
        }
    }

    private func arrive() {
        speech.speak("Vous êtes arrivé à destination.", interrupt: true)
        phase = .arrived
        endNavigation(arrived: true)
        phase = .arrived
    }

    func dismissArrival() {
        cancelPreview()
    }

    /// Recalcul automatique après une sortie d'itinéraire (au plus une fois toutes les 8 s).
    private func reroute(from fix: PositionFix) {
        let now = CACurrentMediaTime()
        guard !isRerouting, now - lastRerouteTime > 8, let destination else { return }
        lastRerouteTime = now
        isRerouting = true
        speech.speak("Recalcul de l'itinéraire.")
        Task { @MainActor in
            defer { isRerouting = false }
            guard phase == .navigating else { return }
            do {
                let plans = try await RouteService.routes(from: fix.point.coordinate, to: destination,
                                                          options: settings.routeOptions, alternatives: false)
                guard phase == .navigating, let route = plans.first else { return }
                begin(route: route, announce: false)
                speech.speak("Nouvel itinéraire. \(engine?.departureAnnouncement() ?? "")")
            } catch {
                message = "Recalcul impossible pour l'instant. Nouvel essai dans quelques secondes."
            }
        }
    }

    // MARK: Simulation

    private func startSimulation(on route: RoutePlan) {
        let sim = RouteDriveSimulation(path: route.path,
                                       maneuverDistances: route.maneuvers.map(\.distanceFromStart),
                                       cruiseSpeed: 50 / 3.6)
        sim.speedMultiplier = settings.simulationSpeed
        simulation = sim
        isSimulating = true
        simulationTask?.cancel()
        simulationTask = Task { @MainActor [weak self] in
            var last = CACurrentMediaTime()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 100_000_000)
                guard let self, let sim = self.simulation, self.phase == .navigating else { return }
                let now = CACurrentMediaTime()
                sim.speedMultiplier = self.settings.simulationSpeed
                let fix = sim.step(dt: min(0.5, now - last), time: now)
                last = now
                self.ingest(fix)
                if sim.isFinished, self.phase == .navigating { self.arrive() }
            }
        }
    }
}
