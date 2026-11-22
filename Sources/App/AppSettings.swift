import Foundation
import Combine

/// Préférences de l'utilisateur, enregistrées dans UserDefaults.
@MainActor
final class AppSettings: ObservableObject {
    private let defaults = UserDefaults.standard

    @Published var vehicleModel: VehicleModel { didSet { defaults.set(vehicleModel.rawValue, forKey: "vehicleModel") } }
    @Published var vehicleColorID: String { didSet { defaults.set(vehicleColorID, forKey: "vehicleColor") } }
    /// Conduite simulée le long de l'itinéraire (démo, simulateur, tests).
    @Published var simulateDrive: Bool { didSet { defaults.set(simulateDrive, forKey: "simulateDrive") } }
    @Published var simulationSpeed: Double { didSet { defaults.set(simulationSpeed, forKey: "simulationSpeed") } }
    @Published var avoidTolls: Bool { didSet { defaults.set(avoidTolls, forKey: "avoidTolls") } }
    @Published var avoidHighways: Bool { didSet { defaults.set(avoidHighways, forKey: "avoidHighways") } }
    @Published var voiceMuted: Bool { didSet { defaults.set(voiceMuted, forKey: "voiceMuted") } }
    @Published var driverName: String { didSet { defaults.set(driverName, forKey: "driverName") } }

    init() {
        vehicleModel = VehicleModel(rawValue: defaults.string(forKey: "vehicleModel") ?? "") ?? .citadine
        vehicleColorID = defaults.string(forKey: "vehicleColor") ?? "cyan"
        #if targetEnvironment(simulator)
        simulateDrive = defaults.object(forKey: "simulateDrive") as? Bool ?? true
        #else
        simulateDrive = defaults.object(forKey: "simulateDrive") as? Bool ?? false
        #endif
        simulationSpeed = defaults.object(forKey: "simulationSpeed") as? Double ?? 1
        avoidTolls = defaults.bool(forKey: "avoidTolls")
        avoidHighways = defaults.bool(forKey: "avoidHighways")
        voiceMuted = defaults.bool(forKey: "voiceMuted")
        driverName = defaults.string(forKey: "driverName") ?? ""
    }

    var vehicleStyle: VehicleStyle { VehicleStyle(model: vehicleModel, colorID: vehicleColorID) }
    var routeOptions: RouteOptions { RouteOptions(avoidTolls: avoidTolls, avoidHighways: avoidHighways) }
}
