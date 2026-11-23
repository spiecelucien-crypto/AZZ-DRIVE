import SceneKit
import UIKit

final class VehicleSceneView: SCNView {
    private let vehicleHolder = SCNNode()
    private let bodyNode = SCNNode()
    private let cameraNode = SCNNode()
    private let contactShadow = SCNNode()
    private let brakeGlow = SCNNode()
    private var wheels: [SCNNode] = []
    private var currentStyle: VehicleStyle?
    private var lastYaw: Float = .nan
    private var lastPitch: Double = .nan
    private var wheelAngle: Float = 0
    private var smoothedYaw: Float = 0
    private var roll: Float = 0
    private var suspension: Float = 0
    private var cameraScale: Float = 3.0
    private var lastSpeed: Double = 0
    private var brakeIntensity: Float = 0

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

        let shadowGeometry = SCNPlane(width: 2.35, height: 4.65)
        shadowGeometry.cornerRadius = 0.55
        let shadowMaterial = SCNMaterial()
        shadowMaterial.isDoubleSided = true
        shadowMaterial.lightingModel = .constant
        shadowMaterial.diffuse.contents = UIColor(white: 0, alpha: 0.22)
        shadowMaterial.writesToDepthBuffer = false
        shadowGeometry.materials = [shadowMaterial]

        contactShadow.geometry = shadowGeometry
        contactShadow.eulerAngles = SCNVector3(-Float.pi / 2, 0, 0)
        contactShadow.position = SCNVector3(0, 0.005, 0)
        contactShadow.renderingOrder = -1
        vehicleHolder.addChildNode(contactShadow)
        vehicleHolder.addChildNode(bodyNode)

        // Halo rouge discret derrière le véhicule, visible uniquement lors d'une décélération.
        let glowGeometry = SCNPlane(width: 1.7, height: 0.5)
        glowGeometry.cornerRadius = 0.2
        let glowMaterial = SCNMaterial()
        glowMaterial.isDoubleSided = true
        glowMaterial.lightingModel = .constant
        glowMaterial.diffuse.contents = UIColor(red: 1, green: 0.08, blue: 0.08, alpha: 1)
        glowMaterial.writesToDepthBuffer = false
        glowGeometry.materials = [glowMaterial]

        brakeGlow.geometry = glowGeometry
        brakeGlow.eulerAngles = SCNVector3(-Float.pi / 2, 0, 0)
        brakeGlow.position = SCNVector3(0, 0.55, -2.1)
        brakeGlow.opacity = 0
        brakeGlow.renderingOrder = 2
        bodyNode.addChildNode(brakeGlow)

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

        let fill = SCNNode()
        fill.light = SCNLight()
        fill.light?.type = .directional
        fill.light?.intensity = 380
        fill.eulerAngles = SCNVector3(-Float.pi / 5, -Float.pi * 0.75, 0)
        scene.rootNode.addChildNode(fill)

        let rear = SCNNode()
        rear.light = SCNLight()
        rear.light?.type = .directional
        rear.light?.intensity = 520
        rear.eulerAngles = SCNVector3(-Float.pi / 7, 0, 0)
        scene.rootNode.addChildNode(rear)

        scene.lightingEnvironment.contents = Self.environmentImage
        scene.lightingEnvironment.intensity = 1.0

        self.scene = scene
        setPitch(60)
        configure(.default)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non utilisé") }

    private static let environmentImage: UIImage = {
        let size = CGSize(width: 128, height: 64)
        return UIGraphicsImageRenderer(size: size).image { ctx in
            let colors = [UIColor(red: 0.12, green: 0.15, blue: 0.24, alpha: 1).cgColor,
                          UIColor(red: 0.32, green: 0.36, blue: 0.46, alpha: 1).cgColor,
                          UIColor(red: 0.55, green: 0.55, blue: 0.6, alpha: 1).cgColor,
                          UIColor(red: 0.05, green: 0.05, blue: 0.06, alpha: 1).cgColor] as CFArray
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.38, 0.5, 0.56])!
            ctx.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 0, y: size.height), options: [])
        }
    }()

    func configure(_ style: VehicleStyle) {
        guard style != currentStyle else { return }
        currentStyle = style
        bodyNode.childNodes.forEach { $0.removeFromParentNode() }
        let built = VehicleFactory.make(style)
        bodyNode.addChildNode(built.root)
        wheels = built.wheels
        // Le halo de freinage doit rester au-dessus du modèle reconstruit.
        bodyNode.addChildNode(brakeGlow)
    }

    func setPitch(_ pitch: Double) {
        guard abs(pitch - lastPitch) > 0.5 || lastPitch.isNaN else { return }
        lastPitch = pitch
        let elevation = Float((90 - min(80, max(0, pitch))) * .pi / 180)
        let distance: Float = 20
        cameraNode.position = SCNVector3(0, distance * sin(elevation), distance * cos(elevation))
        cameraNode.eulerAngles = SCNVector3(-elevation, 0, 0)
    }

    func update(relativeHeading: Double, speed: Double, dt: Double) {
        let targetYaw = Float(-relativeHeading * .pi / 180)

        if lastYaw.isNaN {
            smoothedYaw = targetYaw
        } else {
            var difference = targetYaw - smoothedYaw
            while difference > .pi { difference -= 2 * .pi }
            while difference < -.pi { difference += 2 * .pi }
            let smoothing = min(1, max(0.08, dt * 7.5))
            smoothedYaw += difference * smoothing
        }

        var turnDelta: Float = 0
        if !lastYaw.isNaN {
            turnDelta = targetYaw - lastYaw
            while turnDelta > .pi { turnDelta -= 2 * .pi }
            while turnDelta < -.pi { turnDelta += 2 * .pi }
        }
        lastYaw = targetYaw

        let turnRate = abs(speed) > 0.2 ? abs(turnDelta / Float(max(dt, 0.001))) : 0
        let targetRoll = max(-0.075, min(0.075, turnRate * 0.055))
        roll += (targetRoll - roll) * Float(min(1, dt * 5.0))

        let speedFactor = Float(min(1, max(0, speed) / 28))
        let targetSuspension = sin(Float(CACurrentMediaTime() * 7.0)) * 0.006 * speedFactor
        suspension += (targetSuspension - suspension) * Float(min(1, dt * 9.0))

        let deceleration = max(0, lastSpeed - speed)
        let targetBrake = Float(min(1, deceleration * 2.2))
        brakeIntensity += (targetBrake - brakeIntensity) * Float(min(1, dt * 8.0))
        brakeGlow.opacity = CGFloat(brakeIntensity * 0.75)
        lastSpeed = speed

        let targetScale: Float = 3.0 + speedFactor * 0.35
        cameraScale += (targetScale - cameraScale) * Float(min(1, dt * 2.5))
        cameraNode.camera?.orthographicScale = cameraScale

        vehicleHolder.eulerAngles.y = smoothedYaw
        bodyNode.eulerAngles = SCNVector3(0, 0, roll)
        bodyNode.position = SCNVector3(0, suspension, 0)
        contactShadow.opacity = CGFloat(0.82 - speedFactor * 0.10)

        if speed > 0.5, !wheels.isEmpty {
            wheelAngle -= Float(speed * dt / 0.34)
            wheelAngle = wheelAngle.truncatingRemainder(dividingBy: 2 * .pi)
            for wheel in wheels { wheel.eulerAngles.x = wheelAngle }
        }
    }
}
