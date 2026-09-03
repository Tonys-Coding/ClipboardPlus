// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ClipboardPlusNative",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "ClipboardPlusCore", targets: ["ClipboardPlusCore"]),
        .executable(name: "ClipboardPlusCompanion", targets: ["ClipboardPlusCompanion"]),
        .executable(name: "ClipboardPlusNativeHost", targets: ["ClipboardPlusNativeHost"]),
        .executable(name: "ClipboardPlusStoreCheck", targets: ["ClipboardPlusStoreCheck"]),
    ],
    targets: [
        .target(name: "ClipboardPlusCore"),
        .executableTarget(name: "ClipboardPlusCompanion", dependencies: ["ClipboardPlusCore"]),
        .executableTarget(name: "ClipboardPlusNativeHost", dependencies: ["ClipboardPlusCore"]),
        .executableTarget(name: "ClipboardPlusStoreCheck", dependencies: ["ClipboardPlusCore"]),
    ]
)
