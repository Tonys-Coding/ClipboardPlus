import Foundation

public struct SnippetField: Equatable, Sendable {
    public let key: String
    public let label: String
    public let defaultValue: String

    public init(key: String, label: String, defaultValue: String) {
        self.key = key
        self.label = label
        self.defaultValue = defaultValue
    }
}

public enum PasteTransformation: String, CaseIterable, Sendable {
    case cleanWhitespace
    case formatJSON
    case uppercase
    case lowercase
    case titleCase
    case removeTracking

    public var label: String {
        switch self {
        case .cleanWhitespace: "Clean whitespace"
        case .formatJSON: "Format JSON"
        case .uppercase: "UPPERCASE"
        case .lowercase: "lowercase"
        case .titleCase: "Title Case"
        case .removeTracking: "Clean link"
        }
    }
}

public enum SmartPasteTools {
    private static let trackingParameters = Set([
        "dclid", "fbclid", "gclid", "gbraid", "igshid", "mc_cid", "mc_eid", "msclkid",
        "oly_anon_id", "oly_enc_id", "rb_clickid", "s_cid", "vero_conv", "vero_id", "wbraid",
        "_hsenc", "_hsmi",
    ])

    private static func placeholderExpression() -> NSRegularExpression {
        try! NSRegularExpression(pattern: #"\{\{\s*([A-Za-z][A-Za-z0-9 ._-]{0,39}?)(?:\s*\|\s*([^{}]*?))?\s*\}\}"#)
    }

    private static func key(for label: String) -> String {
        label.trimmingCharacters(in: .whitespacesAndNewlines)
            .split(whereSeparator: \Character.isWhitespace)
            .joined(separator: " ")
            .lowercased()
    }

    public static func snippetFields(in content: String) -> [SnippetField] {
        let source = content as NSString
        let matches = placeholderExpression().matches(in: content, range: NSRange(location: 0, length: source.length))
        var fields: [SnippetField] = []
        var seen = Set<String>()

        for match in matches {
            let label = source.substring(with: match.range(at: 1))
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .split(whereSeparator: \Character.isWhitespace)
                .joined(separator: " ")
            let normalizedKey = key(for: label)
            guard seen.insert(normalizedKey).inserted else { continue }
            let defaultValue = match.range(at: 2).location == NSNotFound
                ? ""
                : source.substring(with: match.range(at: 2)).trimmingCharacters(in: .whitespacesAndNewlines)
            fields.append(SnippetField(key: normalizedKey, label: label, defaultValue: defaultValue))
        }
        return fields
    }

    public static func fillSnippet(_ content: String, values: [String: String]) -> String {
        let source = content as NSString
        let matches = placeholderExpression().matches(in: content, range: NSRange(location: 0, length: source.length))
        var result = content as NSString
        for match in matches.reversed() {
            let label = source.substring(with: match.range(at: 1))
            let fallback = match.range(at: 2).location == NSNotFound
                ? ""
                : source.substring(with: match.range(at: 2)).trimmingCharacters(in: .whitespacesAndNewlines)
            let supplied = values[key(for: label)] ?? ""
            result = result.replacingCharacters(in: match.range, with: supplied.isEmpty ? fallback : supplied) as NSString
        }
        return result as String
    }

    public static func transform(_ content: String, using transformation: PasteTransformation) -> String? {
        let result: String
        switch transformation {
        case .cleanWhitespace:
            result = cleanWhitespace(content)
        case .formatJSON:
            guard let formatted = formatJSON(content) else { return nil }
            result = formatted
        case .uppercase:
            result = content.uppercased()
        case .lowercase:
            result = content.lowercased()
        case .titleCase:
            result = content.lowercased().capitalized
        case .removeTracking:
            result = removeTrackingParameters(content)
        }
        return result == content ? nil : result
    }

    private static func cleanWhitespace(_ content: String) -> String {
        let normalized = content
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .replacingOccurrences(of: "\u{00a0}", with: " ")
        let compacted = normalized.components(separatedBy: "\n").map { line in
            line.trimmingCharacters(in: .whitespaces)
                .replacingOccurrences(of: #"[\t ]+"#, with: " ", options: .regularExpression)
        }.joined(separator: "\n")
        return compacted
            .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func formatJSON(_ content: String) -> String? {
        guard let data = content.data(using: .utf8),
              let value = try? JSONSerialization.jsonObject(with: data),
              value is [String: Any] || value is [Any],
              let formatted = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .withoutEscapingSlashes]) else { return nil }
        return String(data: formatted, encoding: .utf8)
    }

    private static func removeTrackingParameters(_ content: String) -> String {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var components = URLComponents(string: trimmed),
              components.scheme == "http" || components.scheme == "https",
              let queryItems = components.queryItems else { return content }
        let retained = queryItems.filter { item in
            let normalized = item.name.lowercased()
            return !normalized.hasPrefix("utm_") && !trackingParameters.contains(normalized)
        }
        guard retained.count != queryItems.count else { return content }
        components.queryItems = retained.isEmpty ? nil : retained
        return components.string ?? content
    }
}
