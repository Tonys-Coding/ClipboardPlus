import AppKit
import CoreText

@MainActor
enum BrandAssets {
    enum Weight {
        case regular
        case medium
        case semibold
        case bold
        case extraBold

        var postScriptName: String {
            switch self {
            case .regular: "Syne-Regular"
            case .medium: "Syne-Medium"
            case .semibold: "Syne-SemiBold"
            case .bold: "Syne-Bold"
            case .extraBold: "Syne-ExtraBold"
            }
        }

        var systemWeight: NSFont.Weight {
            switch self {
            case .regular: .regular
            case .medium: .medium
            case .semibold: .semibold
            case .bold: .bold
            case .extraBold: .heavy
            }
        }
    }

    private(set) static var fontRegistered = false

    static func registerFont() {
        guard !fontRegistered,
              let url = Bundle.main.url(forResource: "Syne-Variable", withExtension: "woff2") else { return }
        var registrationError: Unmanaged<CFError>?
        fontRegistered = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &registrationError)
            || NSFont(name: "Syne-Regular", size: 12) != nil
    }

    static func font(size: CGFloat, weight: Weight = .regular) -> NSFont {
        NSFont(name: weight.postScriptName, size: size)
            ?? .systemFont(ofSize: size, weight: weight.systemWeight)
    }

    static var logo: NSImage? {
        guard let url = Bundle.main.url(forResource: "ClipboardPlusLogo", withExtension: "png") else { return nil }
        return NSImage(contentsOf: url)
    }
}
