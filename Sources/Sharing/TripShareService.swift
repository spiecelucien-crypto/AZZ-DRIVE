import Foundation
import QuartzCore

/// Partage du trajet en direct avec les proches.
///
/// Choix techniques (volontairement simples) :
/// - Firebase Realtime Database via son API REST : aucun SDK à intégrer, pas de serveur à maintenir.
/// - L'app publie un petit instantané (≈ 300 octets) toutes les 5 à 15 s, jamais à chaque image.
/// - Les proches ouvrent une page web (GitHub Pages) qui reçoit les mises à jour en direct
///   (flux EventSource) et peuvent renvoyer des réactions.
/// - Le lien contient un identifiant aléatoire de 22 caractères : seul qui a le lien peut suivre.
@MainActor
final class TripShareService: ObservableObject {
    @Published private(set) var isSharing = false
    @Published private(set) var shareURL: URL?
    @Published private(set) var latestReaction: TripReaction?
    @Published private(set) var reactionCount = 0
    @Published var errorMessage: String?

    let isConfigured = AppConfig.isSharingConfigured

    private var tripID: String?
    private var throttle = ShareThrottle()
    private var auth: FirebaseAnonymousAuth?
    private var reactionsTask: Task<Void, Never>?
    private var lastReactionKey: String?
    private var lastSnapshot: TripSnapshot?
    private var publishing = false

    private var host: String? { AppConfig.firebaseDatabaseHost }

    /// Démarre le partage et renvoie le lien à envoyer.
    func start(route: RoutePlan, destinationName: String, driver: String, vehicle: String) async -> URL? {
        guard let host, let apiKey = AppConfig.firebaseAPIKey else {
            errorMessage = "Partage non configuré : renseignez FIREBASE_DATABASE_HOST et FIREBASE_API_KEY (voir README)."
            return nil
        }
        if isSharing, let shareURL { return shareURL }
        let auth = self.auth ?? FirebaseAnonymousAuth(apiKey: apiKey)
        self.auth = auth
        let id = TripID.make()
        do {
            let token = try await auth.idToken()
            let now = Self.nowMs()
            let preview = route.path.simplified(maxPoints: 150).map { [round6($0.latitude), round6($0.longitude)] }
            let body: [String: Any] = [
                "owner": auth.uid ?? "",
                "createdMs": now,
                "expiresMs": now + 12 * 3600 * 1000,
                "driver": driver,
                "destination": destinationName,
                "route": preview,
            ]
            try await request("PUT", host: host, path: "trips/\(id)", token: token, json: body)
            tripID = id
            isSharing = true
            throttle = ShareThrottle()
            reactionCount = 0
            lastReactionKey = nil
            var c = URLComponents(url: AppConfig.followPageURL!, resolvingAgainstBaseURL: false)!
            c.queryItems = [URLQueryItem(name: "trip", value: id),
                            URLQueryItem(name: "db", value: host),
                            URLQueryItem(name: "key", value: apiKey)]
            shareURL = c.url
            startReactionPolling()
            return shareURL
        } catch {
            errorMessage = "Impossible de démarrer le partage : \(error.localizedDescription)"
            return nil
        }
    }

    /// Appelé à chaque progression ; ne publie que si le limiteur l'autorise.
    func update(progress: NavigationProgress, destinationName: String, driver: String, vehicle: String,
                status: TripSnapshot.Status = .enRoute) {
        guard isSharing else { return }
        let now = CACurrentMediaTime()
        guard throttle.shouldPublish(point: progress.displayPoint, status: status, time: now) else { return }
        let snapshot = TripSnapshot(
            driver: driver, destination: destinationName,
            lat: round6(progress.displayPoint.latitude), lon: round6(progress.displayPoint.longitude),
            heading: progress.heading.rounded(), speedKmh: Int((progress.speed * 3.6).rounded()),
            remainingMeters: Int(progress.remainingDistance),
            etaMs: Self.nowMs() + Int64(progress.remainingTime * 1000),
            progress: (progress.fraction * 1000).rounded() / 1000,
            status: status, vehicle: vehicle, updatedMs: Self.nowMs())
        publish(snapshot)
    }

    /// Fin du trajet : statut « arrivé » ou « terminé », puis arrêt des requêtes.
    func finish(arrived: Bool) {
        guard isSharing else { return }
        if var s = lastSnapshot {
            s.status = arrived ? .arrive : .termine
            s.updatedMs = Self.nowMs()
            if arrived { s.progress = 1; s.remainingMeters = 0; s.etaMs = Self.nowMs() }
            publish(s, force: true)
        }
        reactionsTask?.cancel()
        reactionsTask = nil
        isSharing = false
        shareURL = nil
        tripID = nil
    }

    func dismissReaction() { latestReaction = nil }

    // MARK: Interne

    private func publish(_ snapshot: TripSnapshot, force: Bool = false) {
        guard let host, let tripID, let auth else { return }
        lastSnapshot = snapshot
        // Une seule requête à la fois : si le réseau est lent, on saute une mise à jour plutôt que d'empiler.
        guard force || !publishing else { return }
        publishing = true
        Task {
            defer { publishing = false }
            do {
                let token = try await auth.idToken()
                let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(snapshot))
                try await request("PUT", host: host, path: "trips/\(tripID)/snapshot", token: token, json: json)
            } catch {
                // Réseau perdu : la prochaine mise à jour réessaiera.
            }
        }
    }

    private func startReactionPolling() {
        reactionsTask?.cancel()
        reactionsTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 12_000_000_000)
                await self?.pollReactions()
            }
        }
    }

    private func pollReactions() async {
        guard let host, let tripID, let auth else { return }
        do {
            let token = try await auth.idToken()
            var query = [URLQueryItem(name: "orderBy", value: "\"$key\"")]
            if let lastReactionKey { query.append(URLQueryItem(name: "startAt", value: "\"\(lastReactionKey)\"")) }
            guard let data = try await request("GET", host: host, path: "trips/\(tripID)/reactions",
                                               token: token, query: query),
                  let dict = try? JSONDecoder().decode([String: TripReaction].self, from: data) else { return }
            let fresh = dict.filter { $0.key != lastReactionKey }.sorted { $0.key < $1.key }
            guard let last = fresh.last else { return }
            lastReactionKey = last.key
            reactionCount += fresh.count
            latestReaction = last.value
        } catch {}
    }

    @discardableResult
    private func request(_ method: String, host: String, path: String, token: String,
                         query: [URLQueryItem] = [], json: Any? = nil) async throws -> Data? {
        var c = URLComponents()
        c.scheme = "https"
        c.host = host
        c.path = "/\(path).json"
        c.queryItems = [URLQueryItem(name: "auth", value: token)] + query
        var req = URLRequest(url: c.url!)
        req.httpMethod = method
        req.timeoutInterval = 10
        if let json {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw NSError(domain: "TripShare", code: code,
                          userInfo: [NSLocalizedDescriptionKey: String(data: data, encoding: .utf8) ?? "HTTP \(code)"])
        }
        return data
    }

    private static func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
}

private func round6(_ v: Double) -> Double { (v * 1_000_000).rounded() / 1_000_000 }

/// Connexion anonyme Firebase par REST : donne un identifiant stable à l'appareil,
/// utilisé par les règles de sécurité (seul le conducteur peut modifier son trajet).
final class FirebaseAnonymousAuth {
    private let apiKey: String
    private(set) var uid: String?
    private var idTokenValue: String?
    private var refreshToken: String?
    private var expiresAt = Date.distantPast
    private static let account = "firebase.anon"

    private struct Stored: Codable { let uid: String; let refreshToken: String }

    init(apiKey: String) {
        self.apiKey = apiKey
        if let data = Keychain.load(account: Self.account),
           let s = try? JSONDecoder().decode(Stored.self, from: data) {
            uid = s.uid
            refreshToken = s.refreshToken
        }
    }

    func idToken() async throws -> String {
        if let idTokenValue, Date() < expiresAt.addingTimeInterval(-120) { return idTokenValue }
        if let refreshToken {
            do { return try await refresh(refreshToken) } catch { self.refreshToken = nil }
        }
        return try await signUp()
    }

    private func signUp() async throws -> String {
        struct R: Decodable { let idToken: String; let refreshToken: String; let expiresIn: String; let localId: String }
        var req = URLRequest(url: URL(string: "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=\(apiKey)")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = #"{"returnSecureToken":true}"#.data(using: .utf8)
        let (data, response) = try await URLSession.shared.data(for: req)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw NSError(domain: "FirebaseAuth", code: 1, userInfo: [NSLocalizedDescriptionKey:
                "Connexion anonyme Firebase refusée. Activez « Anonyme » dans Authentication > Sign-in method."])
        }
        let r = try JSONDecoder().decode(R.self, from: data)
        save(uid: r.localId, idToken: r.idToken, refresh: r.refreshToken, expiresIn: Double(r.expiresIn) ?? 3600)
        return r.idToken
    }

    private func refresh(_ token: String) async throws -> String {
        struct R: Decodable { let id_token: String; let refresh_token: String; let expires_in: String; let user_id: String }
        var req = URLRequest(url: URL(string: "https://securetoken.googleapis.com/v1/token?key=\(apiKey)")!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = "grant_type=refresh_token&refresh_token=\(token)".data(using: .utf8)
        let (data, response) = try await URLSession.shared.data(for: req)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw NSError(domain: "FirebaseAuth", code: 2)
        }
        let r = try JSONDecoder().decode(R.self, from: data)
        save(uid: r.user_id, idToken: r.id_token, refresh: r.refresh_token, expiresIn: Double(r.expires_in) ?? 3600)
        return r.id_token
    }

    private func save(uid: String, idToken: String, refresh: String, expiresIn: Double) {
        self.uid = uid
        idTokenValue = idToken
        refreshToken = refresh
        expiresAt = Date().addingTimeInterval(expiresIn)
        if let data = try? JSONEncoder().encode(Stored(uid: uid, refreshToken: refresh)) {
            Keychain.save(data, account: Self.account)
        }
    }
}
