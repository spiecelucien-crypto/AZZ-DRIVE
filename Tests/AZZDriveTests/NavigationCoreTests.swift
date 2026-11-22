import XCTest
@testable import AZZDrive

/// Itinéraire de test : 1 km plein nord, virage à droite, 500 m plein est.
private func lShapedRoute() -> RoutePlan {
    let start = GeoPoint(latitude: 51.2194, longitude: 4.4025) // Anvers
    let corner = Geo.destination(from: start, bearing: 0, distance: 1000)
    let end = Geo.destination(from: corner, bearing: 90, distance: 500)
    var pts: [GeoPoint] = []
    for i in 0...20 { pts.append(Geo.destination(from: start, bearing: 0, distance: Double(i) * 50)) }
    for i in 1...10 { pts.append(Geo.destination(from: corner, bearing: 90, distance: Double(i) * 50)) }
    pts[pts.count - 1] = end
    let path = RoutePath(points: pts)
    return RoutePlan(name: "Test", path: path, maneuvers: [
        RouteManeuver(instruction: "", distanceFromStart: 0, kind: .depart),
        RouteManeuver(instruction: "Tournez à droite sur Meir", distanceFromStart: 1000, kind: .right),
        RouteManeuver(instruction: "Vous êtes arrivé", distanceFromStart: path.length, kind: .arrive),
    ], expectedTravelTime: 180)
}

private func fix(_ p: GeoPoint, speed: Double = 13, t: TimeInterval = 0) -> PositionFix {
    PositionFix(point: p, course: nil, speed: speed, accuracy: 5, timestamp: t)
}

final class GeoTests: XCTestCase {
    func testDistanceAndBearing() {
        let a = GeoPoint(latitude: 51.0, longitude: 4.0)
        let b = Geo.destination(from: a, bearing: 45, distance: 1000)
        XCTAssertEqual(Geo.distance(a, b), 1000, accuracy: 0.5)
        XCTAssertEqual(Geo.bearing(from: a, to: b), 45, accuracy: 0.1)
    }

    func testAngleDeltaWrapsAround() {
        XCTAssertEqual(Geo.angleDelta(from: 350, to: 10), 20, accuracy: 1e-9)
        XCTAssertEqual(Geo.angleDelta(from: 10, to: 350), -20, accuracy: 1e-9)
    }
}

final class RoutePathTests: XCTestCase {
    func testLengthAndPointAtDistance() {
        let route = lShapedRoute()
        XCTAssertEqual(route.path.length, 1500, accuracy: 1)
        let mid = route.path.point(at: 500)
        let start = route.path.start!
        XCTAssertEqual(Geo.distance(start, mid), 500, accuracy: 1)
    }

    func testMatchSnapsNearbyPoint() {
        let route = lShapedRoute()
        let onRoad = route.path.point(at: 300)
        let offset = Geo.destination(from: onRoad, bearing: 90, distance: 12)
        let m = route.path.match(offset)!
        XCTAssertEqual(m.distanceAlong, 300, accuracy: 1)
        XCTAssertEqual(m.lateral, 12, accuracy: 0.5)
    }

    func testBearingFollowsTheTurn() {
        let route = lShapedRoute()
        XCTAssertEqual(route.path.bearing(at: 200), 0, accuracy: 1)
        XCTAssertEqual(route.path.bearing(at: 1300), 90, accuracy: 1)
    }

    func testSimplifiedKeepsEnds() {
        let route = lShapedRoute()
        let s = route.path.simplified(maxPoints: 5)
        XCTAssertEqual(s.count, 5)
        XCTAssertEqual(Geo.distance(s.last!, route.path.end!), 0, accuracy: 0.5)
    }
}

final class NavigationEngineTests: XCTestCase {
    func testProgressionAnnouncementsAndArrival() {
        let route = lShapedRoute()
        let engine = NavigationEngine(route: route)
        var spoken: [String] = []
        var arrived = false
        var d = 0.0
        var t = 0.0
        while d <= route.path.length {
            let (progress, events) = engine.update(fix(route.path.point(at: d), t: t))
            XCTAssertTrue(progress.isOnRoute)
            for e in events {
                if case .announce(let s) = e { spoken.append(s) }
                if case .arrived = e { arrived = true }
            }
            d += 13; t += 1
        }
        XCTAssertTrue(arrived)
        XCTAssertTrue(spoken.contains { $0.hasPrefix("Dans") && $0.contains("tournez à droite") }, "\(spoken)")
        XCTAssertTrue(spoken.contains("Tournez à droite sur Meir"), "\(spoken)")
        // Aucune annonce en double.
        XCTAssertEqual(spoken.count, Set(spoken).count, "\(spoken)")
    }

    func testNextManeuverAndRemaining() {
        let route = lShapedRoute()
        let engine = NavigationEngine(route: route)
        let (p, _) = engine.update(fix(route.path.point(at: 400)))
        XCTAssertEqual(p.nextManeuverIndex, 1)
        XCTAssertEqual(p.distanceToNextManeuver, 600, accuracy: 2)
        XCTAssertEqual(p.remainingDistance, 1100, accuracy: 2)
        XCTAssertEqual(p.remainingTime, 180 * 1100 / 1500, accuracy: 2)
    }

    func testOffRouteNeedsConfirmations() {
        let route = lShapedRoute()
        let engine = NavigationEngine(route: route)
        _ = engine.update(fix(route.path.point(at: 200)))
        let far = Geo.destination(from: route.path.point(at: 250), bearing: 270, distance: 200)
        var offRouteEvents = 0
        for i in 0..<5 {
            let (p, events) = engine.update(fix(far, t: Double(i)))
            XCTAssertFalse(p.isOnRoute)
            offRouteEvents += events.filter { $0 == .offRoute }.count
        }
        XCTAssertEqual(offRouteEvents, 1, "Un seul recalcul demandé")
    }

    func testGpsJitterBackwardsIsIgnored() {
        let route = lShapedRoute()
        let engine = NavigationEngine(route: route)
        _ = engine.update(fix(route.path.point(at: 500)))
        let (p, _) = engine.update(fix(route.path.point(at: 490)))
        XCTAssertGreaterThanOrEqual(p.distanceAlong, 489)
    }
}

final class MotionTests: XCTestCase {
    func testInterpolatorAdvancesAlongRoute() {
        let route = lShapedRoute()
        let interp = PoseInterpolator()
        interp.setPath(route.path)
        interp.ingest(point: route.path.point(at: 100), distanceAlong: 100, heading: 0, speed: 10, time: 0)
        var pose: VehiclePose?
        var t = 0.0
        while t < 1.0 { pose = interp.pose(at: t); t += 1.0 / 60 }
        let along = route.path.match(pose!.point)!.distanceAlong
        XCTAssertGreaterThan(along, 100)
        XCTAssertLessThan(along, 111)
    }

    func testCameraZoomsOutWithSpeed() {
        let rig = CameraRig()
        XCTAssertLessThan(rig.targetDistance(speed: 5), rig.targetDistance(speed: 30))
        let pose = VehiclePose(point: GeoPoint(latitude: 51, longitude: 4), heading: 90, speed: 10)
        let cam = rig.update(pose: pose, time: 0)
        XCTAssertEqual(cam.heading, 90, accuracy: 0.01)
        // Le centre de la caméra est devant le véhicule.
        XCTAssertEqual(Geo.bearing(from: pose.point, to: cam.center), 90, accuracy: 1)
    }

    func testSimulationReachesTheEnd() {
        let route = lShapedRoute()
        let sim = RouteDriveSimulation(path: route.path, maneuverDistances: [1000])
        sim.speedMultiplier = 4
        var t = 0.0
        while !sim.isFinished && t < 600 { _ = sim.step(dt: 0.1, time: t); t += 0.1 }
        XCTAssertTrue(sim.isFinished)
    }
}

final class FormattingTests: XCTestCase {
    func testDistances() {
        XCTAssertEqual(NavFormat.distance(84), "80 m")
        XCTAssertEqual(NavFormat.distance(340), "350 m")
        XCTAssertEqual(NavFormat.distance(1234), "1,2 km")
        XCTAssertEqual(NavFormat.distance(15400), "15 km")
        XCTAssertEqual(NavFormat.spokenDistance(310), "300 mètres")
        XCTAssertEqual(NavFormat.spokenDistance(2000), "2 kilomètres")
        XCTAssertEqual(NavFormat.spokenDistance(1500), "1,5 kilomètres")
        XCTAssertEqual(NavFormat.duration(65 * 60), "1 h 05")
        XCTAssertEqual(NavFormat.spokenDuration(12 * 60), "12 minutes")
    }

    func testManeuverParsing() {
        XCTAssertEqual(ManeuverKind.from(instruction: "Tournez à gauche sur la Rue Haute"), .left)
        XCTAssertEqual(ManeuverKind.from(instruction: "Serrez à droite"), .slightRight)
        XCTAssertEqual(ManeuverKind.from(instruction: "Au rond-point, prenez la 2e sortie"), .roundabout)
        XCTAssertEqual(ManeuverKind.from(instruction: "Prenez la sortie 5 vers Gand"), .exitRight)
        XCTAssertEqual(ManeuverKind.from(instruction: "Turn left onto Main St"), .left)
        XCTAssertEqual(ManeuverKind.from(instruction: "Faites demi-tour"), .uTurn)
        XCTAssertEqual(ManeuverKind.from(instruction: "x", isLast: true), .arrive)
    }
}

final class ShareThrottleTests: XCTestCase {
    func testThrottle() {
        var th = ShareThrottle(minInterval: 5, maxInterval: 15, distanceTrigger: 300)
        let a = GeoPoint(latitude: 51, longitude: 4)
        XCTAssertTrue(th.shouldPublish(point: a, status: .enRoute, time: 0))
        XCTAssertFalse(th.shouldPublish(point: a, status: .enRoute, time: 3))
        XCTAssertFalse(th.shouldPublish(point: a, status: .enRoute, time: 10))
        XCTAssertTrue(th.shouldPublish(point: a, status: .enRoute, time: 16))
        let far = Geo.destination(from: a, bearing: 0, distance: 400)
        XCTAssertTrue(th.shouldPublish(point: far, status: .enRoute, time: 22))
        XCTAssertTrue(th.shouldPublish(point: far, status: .arrive, time: 23), "Un changement de statut part tout de suite")
    }

    func testTripIDIsLongAndUnique() {
        let a = TripID.make(), b = TripID.make()
        XCTAssertEqual(a.count, 22)
        XCTAssertNotEqual(a, b)
    }
}
