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

        // Lumière venant de la caméra (derrière la voiture) : l'arrière reste lisible,
        // même pour une carrosserie noire sur une carte de nuit.
        let rear = SCNNode()
        rear.light = SCNLight()
        rear.light?.type = .directional
        rear.light?.intensity = 520
        rear.eulerAngles = SCNVector3(-Float.pi / 7, 0, 0)
        scene.rootNode.addChildNode(rear)

        // Environnement de reflets (ciel de crépuscule) pour le vernis et les vitres.
        scene.lightingEnvironment.contents = Self.environmentImage
        scene.lightingEnvironment.intensity = 1.0

        self.scene = scene
        setPitch(60)
        configure(.default)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non utilisé") }

    /// Dégradé ciel bleu nuit → horizon gris clair → sol sombre (projection équirectangulaire).
    private static let environmentImage: UIImage = {
        let size = CGSize(width: 128, height: 64)
        return UIGraphicsImageRenderer(size: size).image { ctx in
            let colors = [UIColor(red: 0.12, green: 0.15, blue: 0.24, alpha: 1).cgColor,
                          UIColor(red: 0.32, green: 0.36, blue: 0.46, alpha: 1).cgColor,
                          UIColor(red: 0.55, green: 0.55, blue: 0.6, alpha: 1).cgColor,
                          UIColor(red: 0.05, green: 0.05, blue: 0.06, alpha: 1).cgColor] as CFArray
            let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.38, 0.5, 0.56])!
            ctx.cgContext.drawLinearGradient(g, start: .zero, end: CGPoint(x: 0, y: size.height), options: [])
        }
    }()

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
