import XCTest
@testable import AZZDrive

final class DriveHUDTests: XCTestCase {
    func testStreetNameFrenchAndEnglish() {
        XCTAssertEqual(ManeuverText.streetName(from: "Tournez à droite sur Rue de Mons"), "Rue de Mons")
        XCTAssertEqual(ManeuverText.streetName(from: "Tournez à gauche dans la Rue Neuve"), "Rue Neuve")
        XCTAssertEqual(ManeuverText.streetName(from: "Turn right onto Meir"), "Meir")
        XCTAssertEqual(ManeuverText.streetName(from: "Prenez la sortie vers Bruxelles, puis continuez"), "Bruxelles")
        XCTAssertNil(ManeuverText.streetName(from: "Tournez à droite"))
        XCTAssertEqual(ManeuverKind.right.shortLabel, "Tournez à droite")
    }

    func testSpeedLimitParsing() {
        XCTAssertEqual(SpeedLimit.parse("50"), 50)
        XCTAssertEqual(SpeedLimit.parse("30 mph"), 48)
        XCTAssertEqual(SpeedLimit.parse("BE-VLG:urban"), 50)
        XCTAssertEqual(SpeedLimit.parse("BE-WAL:rural"), 90)
        XCTAssertEqual(SpeedLimit.parse("FR:motorway"), 130)
        XCTAssertEqual(SpeedLimit.parse("70;50"), 50)
        XCTAssertNil(SpeedLimit.parse("none"))
        XCTAssertNil(SpeedLimit.parse("bizarre"))
    }

    func testSpeedLimitMatchesRoadInDrivingDirection() {
        let p = GeoPoint(latitude: 51.2194, longitude: 4.4025)
        // Route nord-sud à 50, rue est-ouest à 30 qui croise au même endroit.
        let ns = SpeedLimit.Way(limitKmh: 50, geometry: [Geo.destination(from: p, bearing: 180, distance: 100),
                                                         Geo.destination(from: p, bearing: 0, distance: 100)], oneway: false)
        let ew = SpeedLimit.Way(limitKmh: 30, geometry: [Geo.destination(from: p, bearing: 270, distance: 100),
                                                         Geo.destination(from: p, bearing: 90, distance: 100)], oneway: false)
        XCTAssertEqual(SpeedLimit.match(ways: [ns, ew], at: p, heading: 2), 50)
        XCTAssertEqual(SpeedLimit.match(ways: [ns, ew], at: p, heading: 268), 30)
        // Sens unique dans l'autre sens : ignoré.
        let oneway = SpeedLimit.Way(limitKmh: 70, geometry: ns.geometry.reversed(), oneway: true)
        XCTAssertNil(SpeedLimit.match(ways: [oneway], at: p, heading: 0))
        // Trop loin : ignoré.
        let far = Geo.destination(from: p, bearing: 90, distance: 80)
        XCTAssertNil(SpeedLimit.match(ways: [ns], at: far, heading: 0))
    }

    func testOverpassDecoding() {
        let json = #"{"elements":[{"type":"way","tags":{"highway":"primary","maxspeed":"BE-VLG:urban"},"geometry":[{"lat":51.0,"lon":4.0},{"lat":51.001,"lon":4.0}]},{"type":"way","tags":{"highway":"residential"},"geometry":[{"lat":51.0,"lon":4.0},{"lat":51.0,"lon":4.001}]}]}"#
        let ways = SpeedLimit.ways(fromOverpass: Data(json.utf8))
        XCTAssertEqual(ways.count, 1)
        XCTAssertEqual(ways.first?.limitKmh, 50)
    }

    func testSpeedLimitQueryThrottle() {
        var t = SpeedLimit.QueryThrottle()
        let p = GeoPoint(latitude: 51.2194, longitude: 4.4025)
        XCTAssertTrue(t.shouldQuery(at: p, time: 0))
        XCTAssertFalse(t.shouldQuery(at: Geo.destination(from: p, bearing: 0, distance: 500), time: 3))
        XCTAssertFalse(t.shouldQuery(at: Geo.destination(from: p, bearing: 0, distance: 50), time: 10))
        XCTAssertTrue(t.shouldQuery(at: Geo.destination(from: p, bearing: 0, distance: 200), time: 12))
        XCTAssertTrue(t.shouldQuery(at: Geo.destination(from: p, bearing: 0, distance: 200), time: 60))
    }

    func testViewers() {
        let now: Int64 = 1_000_000
        let v = ["a": TripViewer(name: "Marie Dupont", seenMs: now - 10_000),
                 "b": TripViewer(name: "léa", seenMs: now - 30_000),
                 "c": TripViewer(name: "Parti", seenMs: now - 600_000)]
        let active = TripViewers.active(v, nowMs: now)
        XCTAssertEqual(active.map(\.name), ["léa", "Marie Dupont"])
        XCTAssertEqual(TripViewers.initials("Marie Dupont"), "MD")
        XCTAssertEqual(TripViewers.initials("léa"), "L")
        XCTAssertEqual(TripViewers.summary(count: 2), "2 personnes suivent ce trajet")
        XCTAssertEqual(TripViewers.summary(count: 1), "1 personne suit ce trajet")
    }

    func testCameraAnchorCorrectionConverges() {
        let rig = CameraRig()
        rig.lookAheadFactor = 0
        // Véhicule affiché trop haut (40 %) alors qu'on le veut à 70 % : la caméra avance.
        for _ in 0..<200 { rig.correctAnchor(observedScreenRatio: 0.4, target: 0.7) }
        XCTAssertGreaterThan(rig.lookAheadFactor, 0.1)
        XCTAssertLessThanOrEqual(rig.lookAheadFactor, rig.maxLookAhead)
    }
}
