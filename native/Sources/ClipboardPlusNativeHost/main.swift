import ClipboardPlusCore
import Foundation

struct NativeRequest: Codable {
    let action: String
    let ids: [String]?
}

struct NativeResponse: Codable {
    let ok: Bool
    var clips: [NativeClip]?
    var settings: CompanionSettings?
    var hasMore: Bool?
    var error: String?
}

func readExactly(_ count: Int, from handle: FileHandle) throws -> Data? {
    var result = Data()
    while result.count < count {
        guard let chunk = try handle.read(upToCount: count - result.count), !chunk.isEmpty else {
            return result.isEmpty ? nil : result
        }
        result.append(chunk)
    }
    return result
}

func writeMessage(_ response: NativeResponse, to handle: FileHandle) throws {
    let payload = try JSONEncoder().encode(response)
    var length = UInt32(payload.count).littleEndian
    let header = withUnsafeBytes(of: &length) { Data($0) }
    try handle.write(contentsOf: header)
    try handle.write(contentsOf: payload)
}

let input = FileHandle.standardInput
let output = FileHandle.standardOutput

do {
    let store = try CompanionStore()
    while let header = try readExactly(4, from: input) {
        guard header.count == 4 else { break }
        let length = header.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self).littleEndian }
        guard length > 0, length <= 1_048_576,
              let payload = try readExactly(Int(length), from: input), payload.count == Int(length) else { break }
        let request = try JSONDecoder().decode(NativeRequest.self, from: payload)

        switch request.action {
        case "ping":
            try writeMessage(.init(ok: true), to: output)
        case "getPending":
            let state = try store.read()
            var batch: [NativeClip] = []
            var encodedBytes = 0
            let encoder = JSONEncoder()
            for clip in state.pendingClips {
                let clipBytes = try encoder.encode(clip).count + 1
                if !batch.isEmpty, encodedBytes + clipBytes > 700_000 { break }
                batch.append(clip)
                encodedBytes += clipBytes
            }
            try writeMessage(
                .init(ok: true, clips: batch, settings: state.settings, hasMore: batch.count < state.pendingClips.count),
                to: output
            )
        case "acknowledge":
            try store.acknowledge(ids: request.ids ?? [])
            try writeMessage(.init(ok: true), to: output)
        default:
            try writeMessage(.init(ok: false, error: "Unknown native host action."), to: output)
        }
    }
} catch {
    try? writeMessage(.init(ok: false, error: error.localizedDescription), to: output)
}
