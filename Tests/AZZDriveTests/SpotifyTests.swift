import XCTest
@testable import AZZDrive

final class SpotifyTests: XCTestCase {
    /// Vecteur de test officiel de la RFC 7636 (PKCE).
    func testPKCEChallengeMatchesRFC7636() {
        XCTAssertEqual(SpotifyAuth.challenge(for: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
                       "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuKEo2s4pzE")
    }

    func testVerifierLengthAndAlphabet() {
        let v = SpotifyAuth.makeVerifier()
        XCTAssertTrue((43...128).contains(v.count))
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        XCTAssertTrue(v.unicodeScalars.allSatisfy(allowed.contains))
    }

    func testPlaybackDecodingToleratesMissingFields() throws {
        let json = #"{"is_playing":true,"item":{"uri":"spotify:track:1","name":"Titre","artists":[{"name":"Artiste"}]}}"#
        let p = try JSONDecoder().decode(SpotifyPlayback.self, from: Data(json.utf8))
        XCTAssertTrue(p.isPlaying)
        XCTAssertEqual(p.item?.artistLine, "Artiste")
        XCTAssertNil(p.item?.artworkURL)
    }

    func testSnapshotEncodesCompactly() throws {
        let s = TripSnapshot(driver: "Lucien", destination: "Anvers", lat: 51.2, lon: 4.4, heading: 90,
                             speedKmh: 50, remainingMeters: 1200, etaMs: 0, progress: 0.5,
                             status: .enRoute, vehicle: "suv", updatedMs: 0)
        let data = try JSONEncoder().encode(s)
        XCTAssertLessThan(data.count, 400)
        XCTAssertTrue(String(data: data, encoding: .utf8)!.contains("\"en_route\""))
    }
}
