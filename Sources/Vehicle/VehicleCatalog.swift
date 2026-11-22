import SceneKit
import UIKit

/// Véhicules disponibles. Les modèles sont construits en code (quelques centaines
/// de triangles) : aucun fichier 3D à charger, rendu instantané et très léger.
/// Pour un modèle détaillé, déposez `<id>.usdz` dans Sources/Vehicle/Models :
/// il remplacera automatiquement la version en code.
enum VehicleModel: String, CaseIterable, Identifiable, Codable {
    case citadine, berline, suv, sportive, utilitaire

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .citadine: return "Citadine"
        case .berline: return "Berline"
        case .suv: return "SUV"
        case .sportive: return "Sportive"
        case .utilitaire: return "Utilitaire"
        }
    }
}

struct VehicleColor: Identifiable, Equatable {
    let id: String
    let name: String
    let color: UIColor

    static let all: [VehicleColor] = [
        VehicleColor(id: "cyan", name: "Cyan AZZ", color: UIColor(red: 0.15, green: 0.84, blue: 0.91, alpha: 1)),
        VehicleColor(id: "rouge", name: "Rouge", color: UIColor(red: 0.86, green: 0.13, blue: 0.17, alpha: 1)),
        VehicleColor(id: "blanc", name: "Blanc", color: UIColor(white: 0.94, alpha: 1)),
        VehicleColor(id: "noir", name: "Noir", color: UIColor(white: 0.12, alpha: 1)),
        VehicleColor(id: "jaune", name: "Jaune", color: UIColor(red: 0.98, green: 0.78, blue: 0.12, alpha: 1)),
        VehicleColor(id: "vert", name: "Vert", color: UIColor(red: 0.56, green: 0.89, blue: 0.36, alpha: 1)),
    ]

    static func named(_ id: String) -> VehicleColor { all.first { $0.id == id } ?? all[0] }
}

struct VehicleStyle: Equatable {
    var model: VehicleModel
    var colorID: String

    static let `default` = VehicleStyle(model: .citadine, colorID: "cyan")
}

/// Construction des nœuds 3D. Repère : l'avant du véhicule pointe vers -Z,
/// le haut vers +Y, 1 unité = 1 mètre.
enum VehicleFactory {
    struct Built {
        let root: SCNNode
        let wheels: [SCNNode]
    }

    private struct Dimensions {
        var length: Float, width: Float, bodyHeight: Float, clearance: Float
        var cabinLength: Float, cabinHeight: Float, cabinOffset: Float
        var wheelRadius: Float, spoiler = false
    }

    private static func dimensions(_ model: VehicleModel) -> Dimensions {
        switch model {
        case .citadine: return Dimensions(length: 3.7, width: 1.7, bodyHeight: 0.6, clearance: 0.18,
                                          cabinLength: 2.0, cabinHeight: 0.6, cabinOffset: 0.25, wheelRadius: 0.32)
        case .berline: return Dimensions(length: 4.6, width: 1.8, bodyHeight: 0.55, clearance: 0.16,
                                         cabinLength: 2.3, cabinHeight: 0.5, cabinOffset: 0.2, wheelRadius: 0.34)
        case .suv: return Dimensions(length: 4.6, width: 1.9, bodyHeight: 0.8, clearance: 0.28,
                                     cabinLength: 2.7, cabinHeight: 0.62, cabinOffset: 0.35, wheelRadius: 0.4)
        case .sportive: return Dimensions(length: 4.4, width: 1.9, bodyHeight: 0.45, clearance: 0.12,
                                          cabinLength: 1.7, cabinHeight: 0.42, cabinOffset: 0.35, wheelRadius: 0.34,
                                          spoiler: true)
        case .utilitaire: return Dimensions(length: 5.0, width: 2.0, bodyHeight: 0.9, clearance: 0.22,
                                            cabinLength: 4.0, cabinHeight: 1.0, cabinOffset: 0.45, wheelRadius: 0.36)
        }
    }

    static func make(_ style: VehicleStyle) -> Built {
        if let url = Bundle.main.url(forResource: style.model.rawValue, withExtension: "usdz"),
           let scene = try? SCNScene(url: url) {
            let root = SCNNode()
            scene.rootNode.childNodes.forEach { root.addChildNode($0) }
            return Built(root: root, wheels: [])
        }
        return procedural(style)
    }

    private static func material(_ color: UIColor, shininess: CGFloat = 0.6, emission: UIColor? = nil) -> SCNMaterial {
        let m = SCNMaterial()
        m.lightingModel = .physicallyBased
        m.diffuse.contents = color
        m.metalness.contents = 0.15 * shininess
        m.roughness.contents = 1 - 0.65 * shininess
        if let emission { m.emission.contents = emission }
        return m
    }

    private static func procedural(_ style: VehicleStyle) -> Built {
        let d = dimensions(style.model)
        let paint = material(VehicleColor.named(style.colorID).color)
        let glass = material(UIColor(red: 0.08, green: 0.12, blue: 0.18, alpha: 1), shininess: 1)
        let tire = material(UIColor(white: 0.08, alpha: 1), shininess: 0.1)
        let rim = material(UIColor(white: 0.75, alpha: 1), shininess: 0.9)
        let headlight = material(.white, emission: UIColor(white: 1, alpha: 1))
        let taillight = material(.red, emission: UIColor(red: 1, green: 0.1, blue: 0.1, alpha: 1))

        let root = SCNNode()

        // Carrosserie.
        let body = SCNBox(width: CGFloat(d.width), height: CGFloat(d.bodyHeight),
                          length: CGFloat(d.length), chamferRadius: CGFloat(min(d.bodyHeight, d.width) * 0.3))
        body.materials = [paint]
        let bodyNode = SCNNode(geometry: body)
        bodyNode.position = SCNVector3(0, d.clearance + d.bodyHeight / 2, 0)
        root.addChildNode(bodyNode)

        // Habitacle vitré + toit couleur carrosserie.
        let cabinY = d.clearance + d.bodyHeight + d.cabinHeight / 2 - 0.04
        let cabin = SCNBox(width: CGFloat(d.width * 0.86), height: CGFloat(d.cabinHeight),
                           length: CGFloat(d.cabinLength), chamferRadius: CGFloat(d.cabinHeight * 0.35))
        cabin.materials = [glass]
        let cabinNode = SCNNode(geometry: cabin)
        cabinNode.position = SCNVector3(0, cabinY, d.cabinOffset)
        root.addChildNode(cabinNode)

        let roof = SCNBox(width: CGFloat(d.width * 0.8), height: 0.06,
                          length: CGFloat(d.cabinLength * 0.78), chamferRadius: 0.03)
        roof.materials = [paint]
        let roofNode = SCNNode(geometry: roof)
        roofNode.position = SCNVector3(0, cabinY + d.cabinHeight / 2, d.cabinOffset + 0.05)
        root.addChildNode(roofNode)

        // Phares et feux arrière.
        for side: Float in [-1, 1] {
            let hl = SCNNode(geometry: SCNBox(width: 0.38, height: 0.12, length: 0.05, chamferRadius: 0.03))
            hl.geometry?.materials = [headlight]
            hl.position = SCNVector3(side * d.width * 0.32, d.clearance + d.bodyHeight * 0.65, -d.length / 2 - 0.01)
            root.addChildNode(hl)
            let tl = SCNNode(geometry: SCNBox(width: 0.34, height: 0.1, length: 0.05, chamferRadius: 0.03))
            tl.geometry?.materials = [taillight]
            tl.position = SCNVector3(side * d.width * 0.34, d.clearance + d.bodyHeight * 0.7, d.length / 2 + 0.01)
            root.addChildNode(tl)
        }

        if d.spoiler {
            let wing = SCNNode(geometry: SCNBox(width: CGFloat(d.width * 0.9), height: 0.05, length: 0.3, chamferRadius: 0.02))
            wing.geometry?.materials = [paint]
            wing.position = SCNVector3(0, d.clearance + d.bodyHeight + 0.25, d.length / 2 - 0.2)
            root.addChildNode(wing)
        }

        // Roues : un pivot par roue, qui tourne autour de l'axe X.
        var wheels: [SCNNode] = []
        let axle = d.length / 2 - d.wheelRadius - 0.35
        for (x, z) in [(-1, -1), (1, -1), (-1, 1), (1, 1)] as [(Float, Float)] {
            let pivot = SCNNode()
            pivot.position = SCNVector3(x * (d.width / 2 - 0.08), d.wheelRadius, z * axle)
            let tireGeo = SCNCylinder(radius: CGFloat(d.wheelRadius), height: 0.26)
            tireGeo.radialSegmentCount = 18
            tireGeo.materials = [tire, rim, rim]
            let tireNode = SCNNode(geometry: tireGeo)
            tireNode.eulerAngles.z = .pi / 2
            pivot.addChildNode(tireNode)
            root.addChildNode(pivot)
            wheels.append(pivot)
        }

        // Ombre douce sous le véhicule (simple plan transparent, bien plus léger qu'une vraie ombre).
        let shadow = SCNPlane(width: CGFloat(d.width * 1.5), height: CGFloat(d.length * 1.25))
        let shadowMat = SCNMaterial()
        shadowMat.diffuse.contents = shadowImage
        shadowMat.lightingModel = .constant
        shadowMat.writesToDepthBuffer = false
        shadowMat.isDoubleSided = false
        shadow.materials = [shadowMat]
        let shadowNode = SCNNode(geometry: shadow)
        shadowNode.eulerAngles.x = -.pi / 2
        shadowNode.position.y = 0.01
        shadowNode.renderingOrder = -1
        root.addChildNode(shadowNode)

        // Petite flèche lumineuse au sol : la direction reste lisible même vue de loin.
        let arrow = SCNNode(geometry: SCNCone(topRadius: 0, bottomRadius: 0.35, height: 0.8))
        arrow.geometry?.materials = [material(VehicleColor.named(style.colorID).color, emission: VehicleColor.named(style.colorID).color)]
        arrow.eulerAngles.x = -.pi / 2
        arrow.position = SCNVector3(0, 0.05, -d.length / 2 - 0.9)
        root.addChildNode(arrow)

        return Built(root: root, wheels: wheels)
    }

    private static let shadowImage: UIImage = {
        let size = CGSize(width: 64, height: 64)
        return UIGraphicsImageRenderer(size: size).image { ctx in
            let colors = [UIColor(white: 0, alpha: 0.45).cgColor, UIColor(white: 0, alpha: 0).cgColor] as CFArray
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
            ctx.cgContext.drawRadialGradient(gradient, startCenter: CGPoint(x: 32, y: 32), startRadius: 0,
                                             endCenter: CGPoint(x: 32, y: 32), endRadius: 32, options: [])
        }
    }()
}
