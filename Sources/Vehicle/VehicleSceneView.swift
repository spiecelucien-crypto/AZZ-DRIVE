import SceneKit
import UIKit

/// Petite vue SceneKit transparente posée au-dessus de la carte, à l'emplacement
/// du véhicule. Seul le véhicule est rendu en 3D (pas toute la carte) :
/// c'est la clé de la fluidité. La caméra SceneKit reprend l'inclinaison
/// de la carte pour que le véhicule semble posé sur la route.
final class VehicleSceneView: SCNView {
    private let vehicleHolder = SCNNode()
    private let cameraNode = SCNNode()
    private var wheels: [SCNNode] = []
    private var currentStyle: VehicleStyle?
    private var lastYaw: Float = .nan
    private var lastPitch: Double = .nan
    private var wheelAngle: Float = 0

    /// Taille du véhicule à l'écran (le cadre fait ~3 fois la longueur d'une voiture).
    static let sideLength: CGFloat = 150

    init() {
        super.init(frame: CGRect(x: 0, y: 0, width: Self.sideLength, height: Self.sideLength), options: nil)
        backgroundColor = .clear
        isOpaque = false
        isUserInteractionEnabled = false
        antialiasingMode = .multisampling2X
        preferredFramesPerSecond = 60
        rendersContinuously = false
        isJitteringEnabled = false

        let scene = SCNScene()
        scene.background.contents = UIColor.clear
        scene.rootNode.addChildNode(vehicleHolder)

        let camera = SCNCamera()
        camera.usesOrthographicProjection = true
        camera.orthographicScale = 3.0
        camera.zNear = 0.1
        camera.zFar = 100
        cameraNode.camera = camera
        scene.rootNode.addChildNode(cameraNode)

        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light?.type = .ambient
        ambient.light?.intensity = 260
        scene.rootNode.addChildNode(ambient)

        let sun = SCNNode()
        sun.light = SCNLight()
        sun.light?.type = .directional
        sun.light?.intensity = 1100
        sun.eulerAngles = SCNVector3(-Float.pi / 2.6, Float.pi / 4, 0)
        scene.rootNode.addChildNode(sun)

        // Lumière d'appoint de l'autre côté : les flancs restent lisibles.
        let fill = SCNNode()
        fill.light = SCNLight()
        fill.light?.type = .directional
        fill.light?.intensity = 380
        fill.eulerAngles = SCNVector3(-Float.pi / 5, -Float.pi * 0.75, 0)
        scene.rootNode.addChildNode(fill)

        self.scene = scene
        setPitch(60)
        configure(.default)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non utilisé") }

    func configure(_ style: VehicleStyle) {
        guard style != currentStyle else { return }
        currentStyle = style
        vehicleHolder.childNodes.forEach { $0.removeFromParentNode() }
        let built = VehicleFactory.make(style)
        vehicleHolder.addChildNode(built.root)
        wheels = built.wheels
    }

    /// Inclinaison de la carte en degrés (0 = vue du dessus).
    func setPitch(_ pitch: Double) {
        guard abs(pitch - lastPitch) > 0.5 || lastPitch.isNaN else { return }
        lastPitch = pitch
        // La caméra regarde le véhicule depuis l'arrière, avec le même angle que la carte.
        let elevation = Float((90 - min(80, max(0, pitch))) * .pi / 180)
        let distance: Float = 20
        cameraNode.position = SCNVector3(0, distance * sin(elevation), distance * cos(elevation))
        cameraNode.eulerAngles = SCNVector3(-elevation, 0, 0)
    }

    /// - Parameters:
    ///   - relativeHeading: cap du véhicule moins cap de la carte (degrés, sens horaire).
    ///   - speed: vitesse en m/s, pour faire tourner les roues.
    func update(relativeHeading: Double, speed: Double, dt: Double) {
        let yaw = Float(-relativeHeading * .pi / 180)
        if lastYaw.isNaN || abs(yaw - lastYaw) > 0.002 {
            lastYaw = yaw
            vehicleHolder.eulerAngles.y = yaw
        }
        if speed > 0.5, !wheels.isEmpty {
            wheelAngle -= Float(speed * dt / 0.34)
            wheelAngle = wheelAngle.truncatingRemainder(dividingBy: 2 * .pi)
            for w in wheels { w.eulerAngles.x = wheelAngle }
        }
    }
}
