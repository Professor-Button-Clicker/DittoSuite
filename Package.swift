// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "DittoSuite",
    platforms: [
        .macOS(.v14)
    ],
    targets: [
        .executableTarget(
            name: "DittoSuite",
            path: "src",
            resources: [],
            swiftSettings: [
                .define("DITTOSUITE")
            ]
        ),
        .testTarget(
            name: "DittoSuiteTests",
            dependencies: ["DittoSuite"],
            path: "tests",
            exclude: ["fixtures/generate_fixtures.swift"]
        ),
    ]
)
