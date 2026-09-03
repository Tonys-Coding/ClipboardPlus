import Darwin
import Foundation

public final class CompanionStore: @unchecked Sendable {
    public let dataDirectory: URL
    private let stateURL: URL
    private let lockURL: URL
    private let decoder = JSONDecoder()
    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }()

    public init(dataDirectory: URL? = nil) throws {
        if let dataDirectory {
            self.dataDirectory = dataDirectory
        } else if let override = ProcessInfo.processInfo.environment["CLIPBOARD_PLUS_DATA_DIR"], !override.isEmpty {
            self.dataDirectory = URL(fileURLWithPath: override, isDirectory: true)
        } else {
            let applicationSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            self.dataDirectory = applicationSupport.appendingPathComponent("ClipboardPlus", isDirectory: true)
        }
        self.stateURL = self.dataDirectory.appendingPathComponent("companion-queue.json")
        self.lockURL = self.dataDirectory.appendingPathComponent("companion-queue.lock")
        try FileManager.default.createDirectory(at: self.dataDirectory, withIntermediateDirectories: true)
        if !FileManager.default.fileExists(atPath: stateURL.path) {
            try withLock { try writeUnlocked(.init()) }
        }
    }

    public func read() throws -> CompanionQueueState {
        try withLock { try readUnlocked() }
    }

    @discardableResult
    public func enqueue(content rawContent: String, sourceApp: String?, bundleIdentifier: String?) throws -> NativeClip? {
        let content = rawContent.replacingOccurrences(of: "\r\n", with: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, content.count <= 50_000 else { return nil }
        return try withLock {
            var state = try readUnlocked()
            guard state.settings.captureEnabled else { return nil }
            if let bundleIdentifier, state.settings.excludedBundleIdentifiers.contains(bundleIdentifier) { return nil }

            let now = Int64(Date().timeIntervalSince1970 * 1_000)
            let type = Self.isWebURL(content) ? "url" : "text"
            let clip: NativeClip
            if let index = state.pendingClips.firstIndex(where: { $0.content == content }) {
                var existing = state.pendingClips.remove(at: index)
                existing.updatedAt = now
                existing.sourceApp = sourceApp ?? existing.sourceApp
                clip = existing
            } else {
                clip = NativeClip(type: type, content: content, sourceApp: sourceApp, createdAt: now, updatedAt: now)
            }
            state.pendingClips.insert(clip, at: 0)
            state.pendingClips = Array(state.pendingClips.prefix(max(1, state.settings.historyLimit)))
            try writeUnlocked(state)
            return clip
        }
    }

    public func acknowledge(ids: [String]) throws {
        let acknowledged = Set(ids)
        try withLock {
            var state = try readUnlocked()
            state.pendingClips.removeAll { acknowledged.contains($0.id) }
            try writeUnlocked(state)
        }
    }

    public func setCaptureEnabled(_ enabled: Bool) throws {
        try withLock {
            var state = try readUnlocked()
            state.settings.captureEnabled = enabled
            try writeUnlocked(state)
        }
    }

    private func readUnlocked() throws -> CompanionQueueState {
        guard FileManager.default.fileExists(atPath: stateURL.path) else { return .init() }
        return try decoder.decode(CompanionQueueState.self, from: Data(contentsOf: stateURL))
    }

    private func writeUnlocked(_ state: CompanionQueueState) throws {
        try encoder.encode(state).write(to: stateURL, options: [.atomic])
    }

    private func withLock<T>(_ operation: () throws -> T) throws -> T {
        let descriptor = open(lockURL.path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw CocoaError(.fileWriteUnknown) }
        defer { close(descriptor) }
        guard flock(descriptor, LOCK_EX) == 0 else { throw CocoaError(.fileWriteUnknown) }
        defer { flock(descriptor, LOCK_UN) }
        return try operation()
    }

    private static func isWebURL(_ value: String) -> Bool {
        guard !value.contains(where: { $0.isWhitespace }), let url = URL(string: value) else { return false }
        return url.scheme == "http" || url.scheme == "https"
    }
}
