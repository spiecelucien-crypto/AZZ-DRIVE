import MapKit
import SwiftUI
import QuartzCore

/// Tracé MapKit qui garde l'identifiant de l'itinéraire, pour choisir sa couleur.
final class RoutePolyline: MKPolyline {
    var routeID: UUID?
}

/// Carte MapKit pilotée image par image.
///
/// Pourquoi `MKMapView` plutôt que `Map` SwiftUI : on règle la caméra à chaque image
/// sans animation implicite, et on peut convertir une coordonnée en point écran
/// exactement au même instant. C'est ce qui permet de poser le véhicule 3D
/// sur la route sans décalage ni à-coups.
struct NavigationMapView: UIViewRepresentable {
    @ObservedObject var session: NavigationSession
    let vehicleStyle: VehicleStyle
    var mapStyle: MapStyle = .nuit

    func makeCoordinator() -> Coordinator { Coordinator(session: session) }

    func makeUIView(context: Context) -> UIView {
        context.coordinator.container
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.sync(session: session, vehicleStyle: vehicleStyle, mapStyle: mapStyle)
    }

    static func dismantleUIView(_ uiView: UIView, coordinator: Coordinator) {
        coordinator.invalidate()
    }

    final class Coordinator: NSObject, MKMapViewDelegate, UIGestureRecognizerDelegate {
        let container = UIView()
        let mapView = MKMapView()
        let vehicleView = VehicleSceneView()
        private let session: NavigationSession
        private var displayLink: CADisplayLink?
        private var lastFrame: CFTimeInterval?

        private var shownRouteIDs: [UUID] = []
        private var shownSelectedID: UUID?
        private var shownDestination: MKMapItem?
        private var destinationAnnotation: MKPointAnnotation?
        private var shownPhase: NavigationSession.Phase?
        private var shownRecenterToken = 0
        private var shownMapStyle: MapStyle = .nuit
        private var navigating = false

        init(session: NavigationSession) {
            self.session = session
            super.init()
            container.backgroundColor = .black
            mapView.frame = container.bounds
            mapView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            mapView.delegate = self
            mapView.showsUserLocation = false // remplacé par le véhicule 3D
            mapView.showsCompass = false
            mapView.showsScale = false
            mapView.isPitchEnabled = true
            mapView.isRotateEnabled = true
            mapView.preferredConfiguration = Self.configuration(navigating: false, style: .nuit)
            mapView.overrideUserInterfaceStyle = .dark
            container.addSubview(mapView)
            container.addSubview(vehicleView)
            vehicleView.isHidden = true

            // Toute manipulation de la carte par l'utilisateur coupe le suivi automatique.
            for g in [UIPanGestureRecognizer(), UIPinchGestureRecognizer(), UIRotationGestureRecognizer()] as [UIGestureRecognizer] {
                g.addTarget(self, action: #selector(userGesture(_:)))
                g.delegate = self
                mapView.addGestureRecognizer(g)
            }

            let link = CADisplayLink(target: WeakTarget(self), selector: #selector(WeakTarget.tick(_:)))
            link.preferredFrameRateRange = CAFrameRateRange(minimum: 15, maximum: 30, preferred: 30)
            link.add(to: .main, forMode: .common)
            displayLink = link
        }

        func invalidate() {
            displayLink?.invalidate()
            displayLink = nil
        }

        /// Relief et bâtiments 3D partout (`.realistic`). En conduite : points d'intérêt réduits
        /// à l'essentiel pour une carte calme et rapide à dessiner.
        private static func configuration(navigating: Bool, style: MapStyle) -> MKMapConfiguration {
            let filter = navigating ? MKPointOfInterestFilter(including: [.gasStation, .evCharger, .parking]) : MKPointOfInterestFilter.includingAll
            switch style {
            case .satellite3D:
                let c = MKHybridMapConfiguration(elevationStyle: .realistic)
                c.pointOfInterestFilter = filter
                c.showsTraffic = true
                return c
            case .nuit, .jour:
                let c = MKStandardMapConfiguration(elevationStyle: .realistic,
                                                   emphasisStyle: navigating ? .muted : .default)
                c.pointOfInterestFilter = filter
                c.showsTraffic = true
                return c
            }
        }

        // MARK: Synchronisation avec l'état SwiftUI (peu fréquente)

        func sync(session: NavigationSession, vehicleStyle: VehicleStyle, mapStyle: MapStyle) {
            vehicleView.configure(vehicleStyle)
            if mapStyle != shownMapStyle {
                shownMapStyle = mapStyle
                mapView.preferredConfiguration = Self.configuration(navigating: navigating, style: mapStyle)
                mapView.overrideUserInterfaceStyle = mapStyle == .jour ? .light : .dark
            }

            if session.phase != shownPhase {
                let wasNavigating = shownPhase == .navigating
                shownPhase = session.phase
                let navigating = session.phase == .navigating
                self.navigating = navigating
                if navigating != wasNavigating {
                    shownRouteIDs = [] // redessine le tracé avec le style de conduite
                    mapView.preferredConfiguration = Self.configuration(navigating: navigating, style: shownMapStyle)
                    // 60 images/s en conduite, 30 en exploration pour économiser la batterie.
                    displayLink?.preferredFrameRateRange = navigating
                        ? CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
                        : CAFrameRateRange(minimum: 15, maximum: 30, preferred: 30)
                }
                if !navigating, wasNavigating {
                    // Retour en vue d'ensemble.
                    let cam = mapView.camera.copy() as! MKMapCamera
                    cam.pitch = 0
                    cam.centerCoordinateDistance = max(cam.centerCoordinateDistance, 1500)
                    mapView.setCamera(cam, animated: true)
                }
            }

            syncRoutes(session)
            syncDestination(session.destination)

            if session.recenterToken != shownRecenterToken {
                shownRecenterToken = session.recenterToken
                if session.phase != .navigating, let pose = session.interpolator.pose(at: CACurrentMediaTime()) {
                    let cam = MKMapCamera(lookingAtCenter: pose.point.coordinate, fromDistance: 2500,
                                          pitch: 0, heading: 0)
                    mapView.setCamera(cam, animated: true)
                }
            }
        }

        private func syncRoutes(_ session: NavigationSession) {
            let ids = session.routes.map(\.id)
            let selected = session.selectedRoute?.id
            guard ids != shownRouteIDs || selected != shownSelectedID else { return }
            let routesChanged = ids != shownRouteIDs
            shownRouteIDs = ids
            shownSelectedID = selected

            mapView.removeOverlays(mapView.overlays)
            // L'itinéraire sélectionné est ajouté en dernier pour passer au-dessus.
            let ordered = session.routes.filter { $0.id != selected } + session.routes.filter { $0.id == selected }
            for route in ordered {
                let coords = route.path.points.map(\.coordinate)
                let line = RoutePolyline(coordinates: coords, count: coords.count)
                line.routeID = route.id
                mapView.addOverlay(line, level: .aboveRoads)
            }

            if routesChanged, session.phase == .preview, !session.routes.isEmpty {
                let rect = mapView.overlays.reduce(MKMapRect.null) { $0.union($1.boundingMapRect) }
                mapView.setVisibleMapRect(rect, edgePadding: UIEdgeInsets(top: 170, left: 50, bottom: 340, right: 50),
                                          animated: true)
            }
        }

        private func syncDestination(_ item: MKMapItem?) {
            guard item !== shownDestination else { return }
            shownDestination = item
            if let a = destinationAnnotation { mapView.removeAnnotation(a) }
            destinationAnnotation = nil
            if let item {
                let a = MKPointAnnotation()
                a.coordinate = item.placemark.coordinate
                a.title = item.name
                mapView.addAnnotation(a)
                destinationAnnotation = a
            }
        }

        // MARK: Boucle d'image (30-60 Hz)

        fileprivate func renderFrame(_ link: CADisplayLink) {
            let now = CACurrentMediaTime()
            let dt = lastFrame.map { now - $0 } ?? 0
            lastFrame = now

            guard let pose = session.interpolator.pose(at: now) else {
                vehicleView.isHidden = true
                return
            }

            let following = session.phase == .navigating && session.isFollowing
            let chase = following && session.cameraRig.mode == .chase
            if following {
                let cam = session.cameraRig.update(pose: pose, time: now)
                let camera = MKMapCamera(lookingAtCenter: cam.center.coordinate,
                                         fromDistance: cam.distance, pitch: cam.pitch, heading: cam.heading)
                mapView.setCamera(camera, animated: false)
            }

            // Taille du véhicule : grand en poursuite (vu de derrière), discret sinon.
            let bounds = container.bounds
            let side = chase ? max(150, min(bounds.width, bounds.height) * 0.6) : VehicleSceneView.sideLength
            if abs(vehicleView.bounds.width - side) > 1 {
                vehicleView.bounds = CGRect(x: 0, y: 0, width: side, height: side)
            }

            let point = mapView.convert(pose.point.coordinate, toPointTo: container)
            if following, bounds.height > 0 {
                // Garde le véhicule aux deux tiers bas de l'écran, quel que soit l'appareil.
                let landscape = bounds.width > bounds.height
                let target = chase ? (landscape ? 0.70 : 0.68) : 0.66
                session.cameraRig.correctAnchor(observedScreenRatio: Double(point.y / bounds.height), target: target)
            }
            let visible = bounds.insetBy(dx: -80, dy: -80).contains(point)
            vehicleView.isHidden = !visible
            guard visible else { return }
            vehicleView.center = point
            vehicleView.setPitch(Double(mapView.camera.pitch))
            vehicleView.update(relativeHeading: pose.heading - mapView.camera.heading, speed: pose.speed, dt: dt)
        }

        @objc private func userGesture(_ g: UIGestureRecognizer) {
            guard g.state == .began, session.phase == .navigating, session.isFollowing else { return }
            session.isFollowing = false
            session.cameraRig.reset()
        }

        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            true
        }

        // MARK: MKMapViewDelegate

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let line = overlay as? RoutePolyline else { return MKOverlayRenderer(overlay: overlay) }
            let r = MKPolylineRenderer(polyline: line)
            let isSelected = line.routeID == session.selectedRoute?.id
            r.strokeColor = isSelected ? UIColor(red: 0.15, green: 0.84, blue: 0.91, alpha: navigating ? 0.75 : 1)
                                       : UIColor(white: 0.55, alpha: 0.85)
            r.lineWidth = isSelected ? (navigating ? 12 : 9) : 6
            r.lineCap = .round
            r.lineJoin = .round
            return r
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard annotation is MKPointAnnotation else { return nil }
            let v = mapView.dequeueReusableAnnotationView(withIdentifier: "dest") as? MKMarkerAnnotationView
                ?? MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: "dest")
            v.annotation = annotation
            v.markerTintColor = .systemRed
            v.glyphImage = UIImage(systemName: "flag.checkered")
            return v
        }
    }
}

/// Évite que le CADisplayLink retienne le coordinateur (cycle de références).
private final class WeakTarget: NSObject {
    weak var target: NavigationMapView.Coordinator?
    init(_ target: NavigationMapView.Coordinator) { self.target = target }

    @objc func tick(_ link: CADisplayLink) {
        guard let target else { link.invalidate(); return }
        MainActor.assumeIsolated { target.renderFrame(link) }
    }
}
