import CarPlay
import Combine
import MapKit
import UIKit

/// Écran CarPlay d'AZZ DRIVE : carte 3D, recherche, catégories, aperçu des
/// itinéraires et guidage virage par virage (bandeau de manœuvre CarPlay).
///
/// Il réutilise la même `NavigationSession` que l'iPhone : lancer un trajet sur
/// l'un l'affiche aussitôt sur l'autre.
///
/// CarPlay n'apparaît dans la voiture que si l'app est signée avec le droit
/// `com.apple.developer.carplay-maps` (accordé par Apple, voir README).
/// Sans ce droit, cette scène n'est simplement jamais ouverte.
@objc(CarPlaySceneDelegate)
@MainActor
final class CarPlaySceneDelegate: UIResponder, @preconcurrency CPTemplateApplicationSceneDelegate {
    private var interfaceController: CPInterfaceController?
    private var carWindow: CPWindow?
    private var mapController: CarPlayMapViewController?
    private let mapTemplate = CPMapTemplate()
    private var navSession: CPNavigationSession?
    private var currentTrip: CPTrip?
    private var currentManeuver: CPManeuver?
    private var currentManeuverIndex: Int?
    private var cancellables: Set<AnyCancellable> = []
    private var searchTask: Task<Void, Never>?
    private var lastEstimateUpdate = Date.distantPast

    private var model: AppModel { AppModel.shared }
    private var session: NavigationSession { model.session }

    // MARK: Connexion

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didConnect interfaceController: CPInterfaceController,
                                  to window: CPWindow) {
        self.interfaceController = interfaceController
        carWindow = window
        let map = CarPlayMapViewController(session: session)
        mapController = map
        window.rootViewController = map

        mapTemplate.mapDelegate = self
        mapTemplate.automaticallyHidesNavigationBar = true
        mapTemplate.guidanceBackgroundColor = UIColor(red: 0.04, green: 0.07, blue: 0.12, alpha: 1)
        mapTemplate.tripEstimateStyle = .dark
        configureButtons()
        interfaceController.setRootTemplate(mapTemplate, animated: false, completion: nil)
        model.location.requestAccess()
        observeSession()
    }

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didDisconnect interfaceController: CPInterfaceController,
                                  from window: CPWindow) {
        cancellables.removeAll()
        navSession = nil
        currentTrip = nil
        self.interfaceController = nil
        carWindow = nil
        mapController = nil
    }

    // MARK: Boutons

    private func configureButtons() {
        let search = CPBarButton(image: UIImage(systemName: "magnifyingglass")!) { [weak self] _ in
            self?.showSearch()
        }
        let places = CPBarButton(title: "Lieux") { [weak self] _ in self?.showCategories() }
        mapTemplate.leadingNavigationBarButtons = [search, places]

        let mute = CPBarButton(image: UIImage(systemName: session.speech.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")!) { [weak self] _ in
            self?.session.toggleMute()
            self?.configureButtons()
        }
        mapTemplate.trailingNavigationBarButtons = [mute]

        let recenter = CPMapButton { [weak self] _ in
            self?.session.recenter()
            self?.mapController?.recenter()
        }
        recenter.image = UIImage(systemName: "location.fill")
        let zoomIn = CPMapButton { [weak self] _ in self?.mapController?.zoom(by: 0.5) }
        zoomIn.image = UIImage(systemName: "plus")
        let zoomOut = CPMapButton { [weak self] _ in self?.mapController?.zoom(by: 2) }
        zoomOut.image = UIImage(systemName: "minus")
        mapTemplate.mapButtons = [recenter, zoomIn, zoomOut]
    }

    // MARK: Recherche et lieux

    private func showSearch() {
        let template = CPSearchTemplate()
        template.delegate = self
        interfaceController?.pushTemplate(template, animated: true, completion: nil)
    }

    private func showCategories() {
        let categories: [(String, String, String)] = [
            ("Station-service", "fuelpump.fill", "station-service"),
            ("Recharge électrique", "bolt.car.fill", "borne de recharge"),
            ("Parking", "parkingsign.circle.fill", "parking"),
            ("Restaurant", "fork.knife", "restaurant"),
            ("Café", "cup.and.saucer.fill", "café"),
            ("Supermarché", "cart.fill", "supermarché"),
            ("Hôpital", "cross.case.fill", "hôpital"),
        ]
        let items: [CPListItem] = categories.map { title, symbol, query in
            let item = CPListItem(text: title, detailText: nil, image: UIImage(systemName: symbol))
            item.accessoryType = .disclosureIndicator
            item.handler = { [weak self] _, completion in
                self?.showResults(title: title, query: query)
                completion()
            }
            return item
        }
        let list = CPListTemplate(title: "Lieux à proximité", sections: [CPListSection(items: items)])
        interfaceController?.pushTemplate(list, animated: true, completion: nil)
    }

    private func showResults(title: String, query: String) {
        Task { @MainActor in
            let found = await search(query)
            let items = found.isEmpty
                ? [CPListItem(text: "Aucun résultat", detailText: "Essayez une autre recherche")]
                : found.map(listItem(for:))
            let list = CPListTemplate(title: title, sections: [CPListSection(items: items)])
            self.interfaceController?.pushTemplate(list, animated: true, completion: nil)
        }
    }

    private func listItem(for item: MKMapItem) -> CPListItem {
        var detail = item.placemark.title ?? ""
        if let here = model.location.lastLocation, let loc = item.placemark.location {
            detail = "\(NavFormat.distance(here.distance(from: loc))) · " + detail
        }
        let row = CPListItem(text: item.name ?? "Lieu", detailText: detail)
        row.handler = { [weak self] _, completion in
            self?.go(to: item)
            completion()
        }
        return row
    }

    fileprivate func search(_ text: String) async -> [MKMapItem] {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = text
        request.resultTypes = [.pointOfInterest, .address]
        if let loc = model.location.lastLocation {
            request.region = MKCoordinateRegion(center: loc.coordinate, latitudinalMeters: 20_000, longitudinalMeters: 20_000)
        }
        let response = try? await MKLocalSearch(request: request).start()
        let items = response?.mapItems ?? []
        guard let here = model.location.lastLocation else { return Array(items.prefix(12)) }
        return Array(items.sorted {
            ($0.placemark.location?.distance(from: here) ?? .infinity) < ($1.placemark.location?.distance(from: here) ?? .infinity)
        }.prefix(12))
    }

    fileprivate func go(to item: MKMapItem) {
        interfaceController?.popToRootTemplate(animated: true, completion: nil)
        if session.phase == .navigating { session.stop() }
        session.preview(item)
    }

    // MARK: Synchronisation avec la session iPhone

    private func observeSession() {
        cancellables.removeAll()
        session.$phase.removeDuplicates()
            .combineLatest(session.$routes)
            .receive(on: RunLoop.main)
            .sink { [weak self] phase, routes in self?.apply(phase: phase, routes: routes) }
            .store(in: &cancellables)

        session.live.$maneuver
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.updateManeuver() }
            .store(in: &cancellables)

        session.live.$progress
            .compactMap { $0 }
            .receive(on: RunLoop.main)
            .sink { [weak self] progress in self?.update(progress: progress) }
            .store(in: &cancellables)

        session.$message
            .compactMap { $0 }
            .receive(on: RunLoop.main)
            .sink { [weak self] text in self?.showAlert(text) }
            .store(in: &cancellables)
    }

    private func apply(phase: NavigationSession.Phase, routes: [RoutePlan]) {
        mapController?.refreshRoutes()
        switch phase {
        case .explore:
            endGuidance(arrived: false)
            mapTemplate.hideTripPreviews()
        case .preview:
            guard !routes.isEmpty, let trip = makeTrip(routes: routes) else { return }
            currentTrip = trip
            let text = CPTripPreviewTextConfiguration(startButtonTitle: "Démarrer",
                                                      additionalRoutesButtonTitle: "Autres itinéraires",
                                                      overviewButtonTitle: "Aperçu")
            mapTemplate.showTripPreviews([trip], textConfiguration: text)
        case .navigating:
            mapTemplate.hideTripPreviews()
            beginGuidance()
        case .arrived:
            endGuidance(arrived: true)
        }
    }

    private func makeTrip(routes: [RoutePlan]) -> CPTrip? {
        guard let first = routes.first, let start = first.path.start, let end = first.path.end else { return nil }
        let origin = MKMapItem(placemark: MKPlacemark(coordinate: start.coordinate))
        origin.name = "Position actuelle"
        let destination = session.destination ?? MKMapItem(placemark: MKPlacemark(coordinate: end.coordinate))
        let choices: [CPRouteChoice] = routes.map { plan in
            let summary = "\(NavFormat.duration(plan.expectedTravelTime)) · \(NavFormat.distance(plan.distance))"
            let choice = CPRouteChoice(summaryVariants: [plan.name.isEmpty ? summary : plan.name],
                                       additionalInformationVariants: [summary] + plan.notices,
                                       selectionSummaryVariants: [summary])
            choice.userInfo = plan.id
            return choice
        }
        let trip = CPTrip(origin: origin, destination: destination, routeChoices: choices)
        trip.userInfo = routes.first?.id
        return trip
    }

    private func beginGuidance() {
        guard navSession == nil, let route = session.activeRoute else { return }
        let trip = currentTrip ?? makeTrip(routes: [route])
        guard let trip else { return }
        currentTrip = trip
        navSession = mapTemplate.startNavigationSession(for: trip)
        currentManeuverIndex = nil
        updateManeuver()
    }

    private func endGuidance(arrived: Bool) {
        guard let nav = navSession else { currentTrip = nil; return }
        if arrived { nav.finishTrip() } else { nav.cancelTrip() }
        navSession = nil
        currentTrip = nil
        currentManeuver = nil
        currentManeuverIndex = nil
    }

    private func updateManeuver() {
        guard let nav = navSession, let route = session.activeRoute else { return }
        let index = session.live.progress?.nextManeuverIndex
        guard index != currentManeuverIndex || currentManeuver == nil else { return }
        currentManeuverIndex = index
        guard let index, index < route.maneuvers.count else {
            nav.upcomingManeuvers = []
            return
        }
        var upcoming: [CPManeuver] = []
        for i in index..<min(index + 2, route.maneuvers.count) {
            upcoming.append(makeManeuver(route.maneuvers[i]))
        }
        currentManeuver = upcoming.first
        nav.upcomingManeuvers = upcoming
    }

    private func makeManeuver(_ m: RouteManeuver) -> CPManeuver {
        let man = CPManeuver()
        let text = m.instruction.isEmpty ? "Continuez" : m.instruction
        man.instructionVariants = [text]
        let config = UIImage.SymbolConfiguration(pointSize: 44, weight: .bold)
        man.symbolImage = UIImage(systemName: m.kind.symbolName, withConfiguration: config)?
            .withTintColor(.white, renderingMode: .alwaysOriginal)
        if let p = session.live.progress {
            let d = max(0, m.distanceFromStart - p.distanceAlong)
            man.initialTravelEstimates = CPTravelEstimates(distanceRemaining: Measurement(value: d, unit: UnitLength.meters),
                                                           timeRemaining: p.speed > 1 ? d / p.speed : d / 12)
        }
        return man
    }

    private func update(progress: NavigationProgress) {
        // Les estimations CarPlay n'ont pas besoin d'être mises à jour 10 fois par seconde.
        guard Date().timeIntervalSince(lastEstimateUpdate) > 1 else { return }
        lastEstimateUpdate = Date()
        if let nav = navSession, let man = currentManeuver {
            let d = progress.distanceToNextManeuver
            nav.updateEstimates(CPTravelEstimates(distanceRemaining: Measurement(value: d, unit: UnitLength.meters),
                                                  timeRemaining: progress.speed > 1 ? d / progress.speed : d / 12),
                                for: man)
        }
        if let trip = currentTrip {
            mapTemplate.updateEstimates(CPTravelEstimates(distanceRemaining: Measurement(value: progress.remainingDistance, unit: UnitLength.meters),
                                                          timeRemaining: progress.remainingTime),
                                        for: trip)
        }
    }

    private func showAlert(_ text: String) {
        let alert = CPNavigationAlert(titleVariants: [text], subtitleVariants: [], image: nil,
                                      primaryAction: CPAlertAction(title: "OK", style: .default) { _ in },
                                      secondaryAction: nil, duration: 6)
        mapTemplate.present(navigationAlert: alert, animated: true)
    }
}

// MARK: - Aperçu et démarrage depuis l'écran de la voiture

extension CarPlaySceneDelegate: @preconcurrency CPMapTemplateDelegate {
    func mapTemplate(_ mapTemplate: CPMapTemplate, selectedPreviewFor trip: CPTrip, using routeChoice: CPRouteChoice) {
        if let id = routeChoice.userInfo as? UUID { session.selectedRouteID = id }
        mapController?.refreshRoutes()
    }

    func mapTemplate(_ mapTemplate: CPMapTemplate, startedTrip trip: CPTrip, using routeChoice: CPRouteChoice) {
        if let id = routeChoice.userInfo as? UUID { session.selectedRouteID = id }
        mapTemplate.hideTripPreviews()
        session.start()
    }

    func mapTemplateDidCancelNavigation(_ mapTemplate: CPMapTemplate) {
        session.stop()
    }

    func mapTemplate(_ mapTemplate: CPMapTemplate, displayStyleFor maneuver: CPManeuver) -> CPManeuverDisplayStyle {
        .leadingSymbol
    }
}

extension CarPlaySceneDelegate: @preconcurrency CPSearchTemplateDelegate {
    func searchTemplate(_ searchTemplate: CPSearchTemplate, updatedSearchText searchText: String,
                        completionHandler: @escaping ([CPListItem]) -> Void) {
        searchTask?.cancel()
        let text = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.count >= 2 else { completionHandler([]); return }
        searchTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            let found = await self.search(text)
            guard !Task.isCancelled else { return }
            completionHandler(found.map { item in
                let row = CPListItem(text: item.name ?? "Lieu", detailText: item.placemark.title)
                row.userInfo = item
                return row
            })
        }
    }

    func searchTemplate(_ searchTemplate: CPSearchTemplate, selectedResult item: CPListItem,
                        completionHandler: @escaping () -> Void) {
        if let mapItem = item.userInfo as? MKMapItem { go(to: mapItem) }
        completionHandler()
    }
}

// MARK: - Carte affichée sur l'écran de la voiture

/// Carte MapKit en perspective 3D (bâtiments en relief), qui suit la voiture
/// et trace l'itinéraire en cyan comme sur l'iPhone.
@MainActor
final class CarPlayMapViewController: UIViewController, @preconcurrency MKMapViewDelegate {
    private let session: NavigationSession
    private let mapView = MKMapView()
    private var cancellables: Set<AnyCancellable> = []
    private var distance: CLLocationDistance = 700

    init(session: NavigationSession) {
        self.session = session
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non utilisé") }

    override func viewDidLoad() {
        super.viewDidLoad()
        overrideUserInterfaceStyle = .dark
        mapView.frame = view.bounds
        mapView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        mapView.delegate = self
        let config = MKStandardMapConfiguration(elevationStyle: .realistic, emphasisStyle: .default)
        config.pointOfInterestFilter = .includingAll
        config.showsTraffic = true
        mapView.preferredConfiguration = config
        mapView.showsUserLocation = true
        mapView.showsBuildings = true
        mapView.isPitchEnabled = true
        view.addSubview(mapView)

        session.live.$progress
            .compactMap { $0 }
            .throttle(for: .milliseconds(250), scheduler: RunLoop.main, latest: true)
            .sink { [weak self] p in self?.follow(point: p.displayPoint, heading: p.heading) }
            .store(in: &cancellables)
        recenter()
    }

    func recenter() {
        if let p = session.live.progress, session.phase == .navigating {
            follow(point: p.displayPoint, heading: p.heading)
        } else {
            mapView.setUserTrackingMode(.followWithHeading, animated: true)
        }
    }

    func zoom(by factor: Double) {
        distance = min(20_000, max(250, distance * factor))
        let cam = mapView.camera.copy() as! MKMapCamera
        cam.centerCoordinateDistance = distance
        mapView.setCamera(cam, animated: true)
    }

    private func follow(point: GeoPoint, heading: Double) {
        guard session.isFollowing else { return }
        let cam = MKMapCamera(lookingAtCenter: point.coordinate, fromDistance: distance, pitch: 62, heading: heading)
        mapView.setCamera(cam, animated: true)
    }

    func refreshRoutes() {
        mapView.removeOverlays(mapView.overlays)
        let plans: [RoutePlan] = session.phase == .navigating ? [session.activeRoute].compactMap { $0 } : session.routes
        let selectedID = session.activeRoute?.id ?? session.selectedRoute?.id
        // Itinéraire choisi dessiné en dernier, donc au-dessus des autres.
        for plan in plans.filter({ $0.id != selectedID }) + plans.filter({ $0.id == selectedID }) {
            let coords = plan.path.points.map(\.coordinate)
            let line = RoutePolyline(coordinates: coords, count: coords.count)
            line.routeID = plan.id
            mapView.addOverlay(line, level: .aboveRoads)
        }
        if session.phase == .preview, let r = mapView.overlays.first?.boundingMapRect {
            let all = mapView.overlays.reduce(r) { $0.union($1.boundingMapRect) }
            mapView.setVisibleMapRect(all, edgePadding: UIEdgeInsets(top: 60, left: 260, bottom: 40, right: 40), animated: true)
        }
    }

    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        guard let line = overlay as? RoutePolyline else { return MKOverlayRenderer(overlay: overlay) }
        let r = MKPolylineRenderer(polyline: line)
        let selected = line.routeID == (session.activeRoute?.id ?? session.selectedRoute?.id)
        r.strokeColor = selected ? UIColor(red: 0.15, green: 0.84, blue: 0.91, alpha: 1) : UIColor(white: 0.6, alpha: 0.8)
        r.lineWidth = selected ? 9 : 6
        r.lineCap = .round
        r.lineJoin = .round
        return r
    }
}
