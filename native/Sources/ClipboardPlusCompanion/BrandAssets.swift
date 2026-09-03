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
            case .regular: "SatoshiVariable-Bold_Regular"
            case .medium: "SatoshiVariable-Bold_Medium"
            case .semibold: "SatoshiVariable-Bold_Bold"
            case .bold: "SatoshiVariable-Bold_Bold"
            case .extraBold: "SatoshiVariable-Bold"
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
              let url = Bundle.main.url(forResource: "Satoshi-Variable", withExtension: "woff2") else { return }
        var registrationError: Unmanaged<CFError>?
        fontRegistered = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &registrationError)
            || NSFont(name: "SatoshiVariable-Bold_Regular", size: 12) != nil
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
