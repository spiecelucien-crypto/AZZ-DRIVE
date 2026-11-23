// swift-tools-version:5.9
// Paquet Swift limité au cœur de navigation (Sources/Core), sans interface.
// Il permet de tester la logique de guidage sans Mac, y compris sous Windows/Linux :
//   swift test
// L'application iOS complète se génère avec XcodeGen (project.yml).
import PackageDescription

let package = Package(
    name: "NavigationCore",
    targets: [
        .target(name: "AZZDrive", path: "Sources/Core"),
        .testTarget(name: "AZZDriveTests", dependencies: ["AZZDrive"],
                    path: "Tests/AZZDriveTests", sources: ["NavigationCoreTests.swift", "DriveHUDTests.swift"]),
    ]
)
