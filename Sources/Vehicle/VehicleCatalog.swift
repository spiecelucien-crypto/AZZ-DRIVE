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

    static let `default` = VehicleStyle(model: .citadine, colorID: "noir")
}

/// Construction des nœuds 3D. Repère : l'avant du véhicule pointe vers -Z,
/// le haut vers +Y, 1 unité = 1 mètre.
///
/// Chaque carrosserie est un profil latéral (capot, pare-brise, toit, hayon) extrudé
/// sur la largeur, avec bords arrondis : une vraie silhouette de voiture pour
/// quelques centaines de triangles seulement.
enum VehicleFactory {
    struct Built {
        let root: SCNNode
        let wheels: [SCNNode]
    }

    /// Profil latéral en mètres : x le long du véhicule (avant > 0), y vers le haut.
    private struct Profile {
        var length: Float, width: Float, wheelRadius: Float
        var sill: Float          // bas de caisse
        var noseHeight: Float    // haut du pare-chocs avant
        var hoodFront: Float     // avant du capot
        var belt: Float          // ligne de caisse (base des vitres)
        var windshieldBase: Float, roofFront: Float, roofRear: Float, rearGlassBase: Float
        var roof: Float
        var tail: Float          // haut de la face arrière
        var spoiler = false
        var van = false
    }

    private static func profile(_ model: VehicleModel) -> Profile {
        switch model {
        case .citadine:
            return Profile(length: 3.95, width: 1.78, wheelRadius: 0.32, sill: 0.30, noseHeight: 0.66, hoodFront: 0.80,
                           belt: 0.95, windshieldBase: 0.55, roofFront: -0.25, roofRear: -1.45, rearGlassBase: -1.85,
                           roof: 1.46, tail: 0.94)
        case .berline:
            return Profile(length: 4.7, width: 1.82, wheelRadius: 0.33, sill: 0.28, noseHeight: 0.62, hoodFront: 0.74,
                           belt: 0.92, windshieldBase: 0.95, roofFront: 0.05, roofRear: -1.15, rearGlassBase: -1.6,
                           roof: 1.42, tail: 0.92)
        case .suv:
            return Profile(length: 4.6, width: 1.9, wheelRadius: 0.40, sill: 0.42, noseHeight: 0.92, hoodFront: 1.02,
                           belt: 1.15, windshieldBase: 0.75, roofFront: -0.05, roofRear: -1.95, rearGlassBase: -2.18,
                           roof: 1.72, tail: 1.12)
        case .sportive:
            return Profile(length: 4.45, width: 1.92, wheelRadius: 0.34, sill: 0.22, noseHeight: 0.48, hoodFront: 0.58,
                           belt: 0.78, windshieldBase: 0.55, roofFront: -0.35, roofRear: -0.95, rearGlassBase: -1.9,
                           roof: 1.18, tail: 0.82, spoiler: true)
        case .utilitaire:
            return Profile(length: 5.0, width: 2.0, wheelRadius: 0.36, sill: 0.35, noseHeight: 0.85, hoodFront: 1.0,
                           belt: 1.2, windshieldBase: 1.7, roofFront: 1.15, roofRear: -2.5, rearGlassBase: -2.5,
                           roof: 2.05, tail: 2.05, van: true)
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

    private static func material(_ color: UIColor, metal: CGFloat = 0.1, rough: CGFloat = 0.5,
                                 emission: UIColor? = nil, clearCoat: Bool = false) -> SCNMaterial {
        let m = SCNMaterial()
        m.lightingModel = .physicallyBased
        m.diffuse.contents = color
        m.metalness.contents = metal
        m.roughness.contents = rough
        if let emission { m.emission.contents = emission }
        if clearCoat {
            // Vernis : reflets nets sur la peinture, même sombre.
            m.clearCoat.contents = 1.0
            m.clearCoatRoughness.contents = 0.08
        }
        return m
    }

    /// Profil extrudé sur la largeur, tourné pour que l'avant pointe vers -Z.
    private static func extrude(_ points: [(Float, Float)], width: Float, chamfer: CGFloat, material: SCNMaterial) -> SCNNode {
        let path = UIBezierPath()
        path.move(to: CGPoint(x: CGFloat(points[0].0), y: CGFloat(points[0].1)))
        for p in points.dropFirst() { path.addLine(to: CGPoint(x: CGFloat(p.0), y: CGFloat(p.1))) }
        path.close()
        path.flatness = 0.01
        let shape = SCNShape(path: path, extrusionDepth: CGFloat(width))
        shape.chamferRadius = chamfer
        shape.chamferMode = .both
        shape.materials = [material]
        let node = SCNNode(geometry: shape)
        node.eulerAngles.y = .pi / 2
        return node
    }

    private static func procedural(_ style: VehicleStyle) -> Built {
        let p = profile(style.model)
        let L = p.length, W = p.width
        let paintColor = VehicleColor.named(style.colorID).color
        let paint = material(paintColor, metal: 0.15, rough: 0.38, clearCoat: true)
        let glass = material(UIColor(red: 0.02, green: 0.03, blue: 0.05, alpha: 1), metal: 0.1, rough: 0.18)
        let trim = material(UIColor(white: 0.05, alpha: 1), metal: 0, rough: 0.7)
        let tire = material(UIColor(white: 0.06, alpha: 1), metal: 0, rough: 0.9)
        let rim = material(UIColor(white: 0.7, alpha: 1), metal: 0.9, rough: 0.25)
        let headlight = material(.white, emission: UIColor(white: 1, alpha: 1))
        let taillight = material(UIColor(red: 0.6, green: 0, blue: 0, alpha: 1),
                                 emission: UIColor(red: 1, green: 0.08, blue: 0.1, alpha: 1))

        let root = SCNNode()

        // Carrosserie.
        var body: [(Float, Float)] = [
            (-L / 2, p.sill + 0.08), (-L / 2 + 0.1, p.sill), (L / 2 - 0.12, p.sill), (L / 2, p.sill + 0.12),
            (L / 2, p.noseHeight), (L / 2 - 0.28, p.hoodFront), (p.windshieldBase, p.belt),
        ]
        if p.van {
            body += [(p.roofFront, p.roof), (-L / 2 + 0.05, p.roof), (-L / 2, p.roof - 0.08)]
        } else {
            body += [(p.rearGlassBase, p.belt + 0.03), (-L / 2 + 0.03, p.tail)]
        }
        root.addChildNode(extrude(body, width: W, chamfer: 0.18, material: paint))

        // Vitrage et toit.
        if p.van {
            let ws = extrude([(p.windshieldBase + 0.03, p.belt + 0.03), (p.roofFront + 0.03, p.roof - 0.06),
                              (p.roofFront - 0.02, p.roof - 0.06), (p.windshieldBase - 0.02, p.belt + 0.03)],
                             width: W * 0.86, chamfer: 0.02, material: glass)
            root.addChildNode(ws)
            for side: Float in [-1, 1] {
                let win = SCNNode(geometry: SCNBox(width: 0.02, height: CGFloat(p.roof - p.belt - 0.15), length: 0.8, chamferRadius: 0.01))
                win.geometry?.materials = [glass]
                win.position = SCNVector3(side * (W / 2 + 0.005), (p.belt + p.roof) / 2, -(p.roofFront - 0.45))
                root.addChildNode(win)
            }
        } else {
            let green = extrude([(p.windshieldBase, p.belt - 0.02), (p.roofFront, p.roof), (p.roofRear, p.roof),
                                 (p.rearGlassBase, p.belt + 0.01)],
                                width: W * 0.8, chamfer: 0.08, material: glass)
            root.addChildNode(green)
            let roofLen = p.roofFront - p.roofRear - 0.08
            let roofPanel = SCNNode(geometry: SCNBox(width: CGFloat(W * 0.76), height: 0.05, length: CGFloat(roofLen), chamferRadius: 0.025))
            roofPanel.geometry?.materials = [paint]
            roofPanel.position = SCNVector3(0, p.roof + 0.005, -(p.roofFront + p.roofRear) / 2)
            root.addChildNode(roofPanel)
            // Rétroviseurs.
            for side: Float in [-1, 1] {
                let mirror = SCNNode(geometry: SCNBox(width: 0.2, height: 0.12, length: 0.1, chamferRadius: 0.03))
                mirror.geometry?.materials = [paint]
                mirror.position = SCNVector3(side * (W / 2 + 0.02), p.belt + 0.08, -(p.windshieldBase - 0.15))
                root.addChildNode(mirror)
            }
        }

        // Boucliers et bas de caisse sombres.
        let bumperY = p.sill + 0.1
        for z: Float in [-L / 2 - 0.005, L / 2 + 0.005] {
            let bumper = SCNNode(geometry: SCNBox(width: CGFloat(W * 0.92), height: 0.14, length: 0.04, chamferRadius: 0.02))
            bumper.geometry?.materials = [trim]
            bumper.position = SCNVector3(0, bumperY, z)
            root.addChildNode(bumper)
        }

        // Phares, feux arrière et plaque.
        let lightY = p.van ? p.noseHeight + 0.05 : (p.noseHeight + p.hoodFront) / 2
        let tailY = p.van ? p.belt : p.tail - 0.1
        for side: Float in [-1, 1] {
            let hl = SCNNode(geometry: SCNBox(width: 0.42, height: 0.09, length: 0.04, chamferRadius: 0.02))
            hl.geometry?.materials = [headlight]
            hl.position = SCNVector3(side * W * 0.31, lightY, -L / 2 - 0.01)
            root.addChildNode(hl)

            let tl = SCNNode(geometry: SCNBox(width: 0.44, height: 0.1, length: 0.04, chamferRadius: 0.02))
            tl.geometry?.materials = [taillight]
            tl.position = SCNVector3(side * W * 0.32, tailY, L / 2 + 0.02)
            root.addChildNode(tl)
        }
        let lightBar = SCNNode(geometry: SCNBox(width: CGFloat(W * 0.4), height: 0.025, length: 0.03, chamferRadius: 0.01))
        lightBar.geometry?.materials = [taillight]
        lightBar.position = SCNVector3(0, tailY, L / 2 + 0.02)
        root.addChildNode(lightBar)

        let plate = SCNNode(geometry: SCNPlane(width: 0.52, height: 0.12))
        let plateMat = SCNMaterial()
        plateMat.diffuse.contents = plateImage
        plateMat.emission.contents = plateImage
        plateMat.emission.intensity = 0.35
        plateMat.lightingModel = .constant
        plate.geometry?.materials = [plateMat]
        plate.position = SCNVector3(0, bumperY + 0.17, L / 2 + 0.03)
        root.addChildNode(plate)

        if p.spoiler {
            let wing = SCNNode(geometry: SCNBox(width: CGFloat(W * 0.9), height: 0.04, length: 0.28, chamferRadius: 0.02))
            wing.geometry?.materials = [paint]
            wing.position = SCNVector3(0, p.tail + 0.18, L / 2 - 0.2)
            root.addChildNode(wing)
        }

        // Roues : un pivot par roue, qui tourne autour de l'axe X.
        var wheels: [SCNNode] = []
        let axle = L / 2 - p.wheelRadius - 0.42
        for (x, z) in [(-1, -1), (1, -1), (-1, 1), (1, 1)] as [(Float, Float)] {
            let pivot = SCNNode()
            pivot.position = SCNVector3(x * (W / 2 - 0.1), p.wheelRadius, z * axle)
            let tireGeo = SCNCylinder(radius: CGFloat(p.wheelRadius), height: 0.24)
            tireGeo.radialSegmentCount = 20
            tireGeo.materials = [tire, rim, rim]
            let tireNode = SCNNode(geometry: tireGeo)
            tireNode.eulerAngles.z = .pi / 2
            pivot.addChildNode(tireNode)
            root.addChildNode(pivot)
            wheels.append(pivot)
        }

        // Ombre douce et reflets des feux sur la route (plans transparents, bien plus légers que de vraies lumières).
        root.addChildNode(groundDecal(image: shadowImage, width: W * 1.45, length: L * 1.2, z: 0, additive: false, order: -3))
        root.addChildNode(groundDecal(image: glowImage(red: 1, green: 0.1, blue: 0.08, alpha: 0.55),
                                      width: W * 1.5, length: 3.2, z: L / 2 + 1.3, additive: true, order: -2))

        return Built(root: root, wheels: wheels)
    }

    private static func groundDecal(image: UIImage, width: Float, length: Float, z: Float, additive: Bool, order: Int) -> SCNNode {
        let plane = SCNPlane(width: CGFloat(width), height: CGFloat(length))
        let m = SCNMaterial()
        m.diffuse.contents = image
        m.lightingModel = .constant
        m.writesToDepthBuffer = false
        if additive { m.blendMode = .add }
        plane.materials = [m]
        let node = SCNNode(geometry: plane)
        node.eulerAngles.x = -.pi / 2
        node.position = SCNVector3(0, 0.01, z)
        node.renderingOrder = order
        return node
    }

    private static let shadowImage: UIImage = radial(UIColor(white: 0, alpha: 0.55))

    private static func glowImage(red: CGFloat, green: CGFloat, blue: CGFloat, alpha: CGFloat) -> UIImage {
        radial(UIColor(red: red, green: green, blue: blue, alpha: alpha))
    }

    private static func radial(_ color: UIColor) -> UIImage {
        let size = CGSize(width: 64, height: 64)
        return UIGraphicsImageRenderer(size: size).image { ctx in
            let colors = [color.cgColor, color.withAlphaComponent(0).cgColor] as CFArray
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
            ctx.cgContext.drawRadialGradient(gradient, startCenter: CGPoint(x: 32, y: 32), startRadius: 0,
                                             endCenter: CGPoint(x: 32, y: 32), endRadius: 32, options: [])
        }
    }

    /// Plaque « AZZ-DRIVE » au format européen.
    private static let plateImage: UIImage = {
        let size = CGSize(width: 260, height: 60)
        return UIGraphicsImageRenderer(size: size).image { ctx in
            let rect = CGRect(origin: .zero, size: size)
            UIColor.white.setFill()
            UIBezierPath(roundedRect: rect, cornerRadius: 6).fill()
            UIColor(red: 0.0, green: 0.2, blue: 0.6, alpha: 1).setFill()
            UIBezierPath(roundedRect: CGRect(x: 0, y: 0, width: 26, height: 60), cornerRadius: 6).fill()
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 34, weight: .bold),
                .foregroundColor: UIColor(red: 0.6, green: 0.0, blue: 0.05, alpha: 1),
            ]
            let text = "AZZ-DRIVE" as NSString
            let textSize = text.size(withAttributes: attrs)
            text.draw(at: CGPoint(x: 26 + (234 - textSize.width) / 2, y: (60 - textSize.height) / 2), withAttributes: attrs)
        }
    }()
}
