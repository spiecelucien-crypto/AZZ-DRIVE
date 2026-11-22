import SceneKit
import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var spotify: SpotifyController
    @EnvironmentObject private var share: TripShareService
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Mon véhicule") {
                    VehiclePreview(style: settings.vehicleStyle)
                        .frame(height: 180)
                        .listRowInsets(EdgeInsets())
                    Picker("Modèle", selection: $settings.vehicleModel) {
                        ForEach(VehicleModel.allCases) { Text($0.displayName).tag($0) }
                    }
                    HStack(spacing: 12) {
                        ForEach(VehicleColor.all) { c in
                            Button { settings.vehicleColorID = c.id } label: {
                                Circle().fill(Color(uiColor: c.color))
                                    .frame(width: 34, height: 34)
                                    .overlay(Circle().stroke(settings.vehicleColorID == c.id ? Theme.cyan : Theme.line,
                                                             lineWidth: settings.vehicleColorID == c.id ? 3 : 1))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(c.name)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }

                Section("Itinéraire") {
                    Toggle("Éviter les péages", isOn: $settings.avoidTolls)
                    Toggle("Éviter les autoroutes", isOn: $settings.avoidHighways)
                }

                Section {
                    Toggle("Conduite simulée", isOn: $settings.simulateDrive)
                    if settings.simulateDrive {
                        Picker("Vitesse de simulation", selection: $settings.simulationSpeed) {
                            Text("×1").tag(1.0); Text("×2").tag(2.0); Text("×4").tag(4.0); Text("×8").tag(8.0)
                        }
                        .pickerStyle(.segmented)
                    }
                } header: {
                    Text("Test")
                } footer: {
                    Text("Le véhicule parcourt l'itinéraire tout seul : idéal sur simulateur ou pour vérifier le guidage sans conduire.")
                }

                Section("Voix") {
                    Toggle("Couper les annonces vocales", isOn: $settings.voiceMuted)
                }

                Section {
                    if !spotify.isConfigured {
                        Text("Ajoutez votre SPOTIFY_CLIENT_ID dans Config/Secrets.xcconfig pour activer Spotify.")
                            .foregroundStyle(Theme.muted)
                    } else if spotify.isConnected {
                        Label("Compte connecté", systemImage: "checkmark.circle.fill").foregroundStyle(Theme.green)
                        Button("Déconnecter Spotify", role: .destructive) { spotify.disconnect() }
                    } else {
                        Button("Connecter Spotify") { spotify.connect() }
                    }
                } header: {
                    Text("Spotify")
                } footer: {
                    Text("Le contrôle de la lecture demande un compte Spotify Premium.")
                }

                Section {
                    TextField("Votre prénom", text: $settings.driverName)
                    if !share.isConfigured {
                        Text("Partage non configuré : ajoutez FIREBASE_DATABASE_HOST et FIREBASE_API_KEY (voir README).")
                            .foregroundStyle(Theme.muted)
                    }
                } header: {
                    Text("Partage du trajet")
                } footer: {
                    Text("Vos proches voient votre position, votre heure d'arrivée et peuvent vous envoyer une réaction. Le partage s'arrête automatiquement à l'arrivée.")
                }
            }
            .navigationTitle("Réglages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } } }
        }
    }
}

/// Aperçu 3D tournant du véhicule choisi (rendu uniquement quand la feuille est ouverte).
private struct VehiclePreview: UIViewRepresentable {
    let style: VehicleStyle

    func makeUIView(context: Context) -> SCNView {
        let view = SCNView()
        view.backgroundColor = UIColor(Theme.background)
        view.antialiasingMode = .multisampling4X
        view.autoenablesDefaultLighting = true
        view.allowsCameraControl = true
        view.scene = SCNScene()
        let camera = SCNNode()
        camera.camera = SCNCamera()
        camera.camera?.fieldOfView = 35
        camera.position = SCNVector3(0, 4.5, 9)
        camera.look(at: SCNVector3(0, 0.6, 0))
        view.scene?.rootNode.addChildNode(camera)
        view.pointOfView = camera
        context.coordinator.holder.runAction(.repeatForever(.rotateBy(x: 0, y: .pi * 2, z: 0, duration: 10)))
        view.scene?.rootNode.addChildNode(context.coordinator.holder)
        return view
    }

    func updateUIView(_ view: SCNView, context: Context) {
        guard context.coordinator.style != style else { return }
        context.coordinator.style = style
        context.coordinator.holder.childNodes.forEach { $0.removeFromParentNode() }
        context.coordinator.holder.addChildNode(VehicleFactory.make(style).root)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        let holder = SCNNode()
        var style: VehicleStyle?
    }
}
