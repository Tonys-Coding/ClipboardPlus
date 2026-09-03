import ClipboardPlusCore
import Foundation

let directory = FileManager.default.temporaryDirectory.appendingPathComponent("clipboard-plus-store-check-\(UUID().uuidString)")
defer { try? FileManager.default.removeItem(at: directory) }

do {
    let store = try CompanionStore(dataDirectory: directory)
    guard let first = try store.enqueue(content: " hello ", sourceApp: "Notes", bundleIdentifier: "com.apple.Notes"),
          let duplicate = try store.enqueue(content: "hello", sourceApp: "Discord", bundleIdentifier: "com.hnc.Discord") else {
        throw NSError(domain: "ClipboardPlusStoreCheck", code: 1, userInfo: [NSLocalizedDescriptionKey: "Expected normal clips to be queued."])
    }
    guard first.id == duplicate.id,
          try store.read().pendingClips.count == 1,
          try store.read().pendingClips[0].sourceApp == "Discord" else {
        throw NSError(domain: "ClipboardPlusStoreCheck", code: 2, userInfo: [NSLocalizedDescriptionKey: "Deduplication failed."])
    }
    guard try store.enqueue(content: "secret", sourceApp: "1Password", bundleIdentifier: "com.1password.1password") == nil else {
        throw NSError(domain: "ClipboardPlusStoreCheck", code: 3, userInfo: [NSLocalizedDescriptionKey: "Password-manager exclusion failed."])
    }
    try store.acknowledge(ids: [first.id])
    guard try store.read().pendingClips.isEmpty else {
        throw NSError(domain: "ClipboardPlusStoreCheck", code: 4, userInfo: [NSLocalizedDescriptionKey: "Acknowledgement failed."])
    }
    print("Clipboard+ companion store checks passed.")
} catch {
    FileHandle.standardError.write(Data("Store check failed: \(error.localizedDescription)\n".utf8))
    exit(1)
}
