import Foundation

public struct NativeClip: Codable, Equatable, Sendable {
    public var id: String
    public var type: String
    public var content: String
    public var title: String?
    public var sourceUrl: String?
    public var sourceApp: String?
    public var favorite: Bool
    public var createdAt: Int64
    public var updatedAt: Int64

    public init(
        id: String = UUID().uuidString,
        type: String,
        content: String,
        title: String? = nil,
        sourceUrl: String? = nil,
        sourceApp: String? = nil,
        favorite: Bool = false,
        createdAt: Int64,
        updatedAt: Int64
    ) {
        self.id = id
        self.type = type
        self.content = content
        self.title = title
        self.sourceUrl = sourceUrl
        self.sourceApp = sourceApp
        self.favorite = favorite
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public struct CompanionSettings: Codable, Equatable, Sendable {
    public var captureEnabled: Bool
    public var historyLimit: Int
    public var excludedBundleIdentifiers: [String]

    public init(
        captureEnabled: Bool = true,
        historyLimit: Int = 500,
        excludedBundleIdentifiers: [String] = CompanionSettings.defaultExcludedBundleIdentifiers
    ) {
        self.captureEnabled = captureEnabled
        self.historyLimit = historyLimit
        self.excludedBundleIdentifiers = excludedBundleIdentifiers
    }

    public static let defaultExcludedBundleIdentifiers = [
        "com.1password.1password",
        "com.agilebits.onepassword7",
        "com.bitwarden.desktop",
        "com.lastpass.LastPass",
        "org.keepassxc.keepassxc",
        "com.apple.keychainaccess",
    ]
}

public struct CompanionQueueState: Codable, Equatable, Sendable {
    public var version: Int
    public var pendingClips: [NativeClip]
    public var settings: CompanionSettings

    public init(version: Int = 1, pendingClips: [NativeClip] = [], settings: CompanionSettings = .init()) {
        self.version = version
        self.pendingClips = pendingClips
        self.settings = settings
    }
}
