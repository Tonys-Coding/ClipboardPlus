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
          try store.read().pendingClips[0].sourceApp == "Discord",
          try store.readPaletteHistory().count == 1,
          try store.readPaletteHistory()[0].sourceApp == "Discord" else {
        throw NSError(domain: "ClipboardPlusStoreCheck", code: 2, userInfo: [NSLocalizedDescriptionKey: "Deduplication failed."])
    }
    guard try store.enqueue(content: "secret", sourceApp: "1Password", bundleIdentifier: "com.1password.1password") == nil else {
        throw NSError(domain: "ClipboardPlusStoreCheck", code: 3, userInfo: [NSLocalizedDescriptionKey: "Password-manager exclusion failed."])
    }
    try store.acknowledge(ids: [first.id])
    guard try store.read().pendingClips.isEmpty,
          try store.readPaletteHistory().count == 1 else {
        throw NSError(domain: "ClipboardPlusStoreCheck", code: 4, userInfo: [NSLocalizedDescriptionKey: "Acknowledgement failed."])
    }

    let now = Int64(Date().timeIntervalSince1970 * 1_000)
    let recent = NativeClip(id: "recent", type: "text", content: "Recent", sourceApp: "Notes", createdAt: now, updatedAt: now)
    let favorite = NativeClip(id: "favorite", type: "url", content: "https://example.com", title: "Example", favorite: true, createdAt: now - 1, updatedAt: now - 1)
    try store.replacePaletteHistory([recent, favorite, recent])
    let paletteHistory = try store.readPaletteHistory()
    guard paletteHistory.map(\.id) == ["favorite", "recent"] else {
        throw NSError(domain: "ClipboardPlusStoreCheck", code: 5, userInfo: [NSLocalizedDescriptionKey: "Palette history ordering or deduplication failed."])
    }
    guard PaletteSearch.filter(paletteHistory, query: "example").map(\.id) == ["favorite"],
          PaletteSearch.filter(paletteHistory, query: "notes").map(\.id) == ["recent"],
          PaletteSearch.filter(paletteHistory, query: " RECENT ").map(\.id) == ["recent"] else {
        throw NSError(domain: "ClipboardPlusStoreCheck", code: 6, userInfo: [NSLocalizedDescriptionKey: "Palette search failed."])
    }

    let presented = NativeClip(
        id: "presented",
        type: "text",
        content: "some\ntext",
        title: "Google Search",
        sourceUrl: "https://www.google.com/search?q=some+text",
        sourceApp: " Google Chrome ",
        createdAt: now,
        updatedAt: now
    )
    guard ClipPresentation.primaryText(for: presented) == "some text",
          ClipPresentation.metadata(for: presented) == ["google.com", "TEXT", "Google Chrome"] else {
        throw NSError(domain: "ClipboardPlusStoreCheck", code: 7, userInfo: [NSLocalizedDescriptionKey: "Clip presentation hierarchy failed."])
    }
    print("Clipboard+ companion store checks passed.")
} catch {
    FileHandle.standardError.write(Data("Store check failed: \(error.localizedDescription)\n".utf8))
    exit(1)
}
