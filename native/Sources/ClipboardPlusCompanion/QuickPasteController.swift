import AppKit
import ApplicationServices
import ClipboardPlusCore

@MainActor
final class QuickPastePanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

@MainActor
final class QuickPasteTableView: NSTableView {
    var onChoose: ((Bool) -> Void)?
    var onCancel: (() -> Void)?

    override func keyDown(with event: NSEvent) {
        switch event.keyCode {
        case 36, 76:
            onChoose?(event.modifierFlags.contains(.command))
        case 53:
            onCancel?()
        default:
            super.keyDown(with: event)
        }
    }
}

@MainActor
final class ClipRowView: NSTableCellView {
    private let kindImage = NSImageView()
    private let titleLabel = NSTextField(labelWithString: "")
    private let detailLabel = NSTextField(labelWithString: "")
    private let favoriteImage = NSImageView()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.cornerRadius = 8

        kindImage.translatesAutoresizingMaskIntoConstraints = false
        kindImage.contentTintColor = NSColor(calibratedRed: 0.91, green: 0.73, blue: 0.18, alpha: 1)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.font = BrandAssets.font(size: 14, weight: .bold)
        titleLabel.textColor = NSColor(calibratedWhite: 0.94, alpha: 1)
        titleLabel.lineBreakMode = .byTruncatingTail
        detailLabel.translatesAutoresizingMaskIntoConstraints = false
        detailLabel.font = BrandAssets.font(size: 11)
        detailLabel.textColor = NSColor(calibratedWhite: 0.58, alpha: 1)
        detailLabel.lineBreakMode = .byTruncatingTail
        favoriteImage.translatesAutoresizingMaskIntoConstraints = false
        favoriteImage.contentTintColor = NSColor(calibratedRed: 0.95, green: 0.79, blue: 0.30, alpha: 1)

        addSubview(kindImage)
        addSubview(titleLabel)
        addSubview(detailLabel)
        addSubview(favoriteImage)
        NSLayoutConstraint.activate([
            kindImage.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
            kindImage.centerYAnchor.constraint(equalTo: centerYAnchor),
            kindImage.widthAnchor.constraint(equalToConstant: 22),
            kindImage.heightAnchor.constraint(equalToConstant: 22),
            titleLabel.leadingAnchor.constraint(equalTo: kindImage.trailingAnchor, constant: 12),
            titleLabel.trailingAnchor.constraint(equalTo: favoriteImage.leadingAnchor, constant: -10),
            titleLabel.topAnchor.constraint(equalTo: topAnchor, constant: 11),
            detailLabel.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            detailLabel.trailingAnchor.constraint(equalTo: titleLabel.trailingAnchor),
            detailLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 4),
            favoriteImage.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),
            favoriteImage.centerYAnchor.constraint(equalTo: centerYAnchor),
            favoriteImage.widthAnchor.constraint(equalToConstant: 16),
            favoriteImage.heightAnchor.constraint(equalToConstant: 16),
        ])
    }

    required init?(coder: NSCoder) { nil }

    func configure(with clip: NativeClip) {
        titleLabel.stringValue = ClipPresentation.primaryText(for: clip)
        detailLabel.stringValue = ClipPresentation.metadata(for: clip).joined(separator: "  ·  ")
        let symbol = clip.type == "url" ? "link" : clip.type == "code" ? "chevron.left.forwardslash.chevron.right" : "doc.text"
        kindImage.image = NSImage(systemSymbolName: symbol, accessibilityDescription: clip.type)
        favoriteImage.image = clip.favorite ? NSImage(systemSymbolName: "star.fill", accessibilityDescription: "Favorite") : nil
    }
}

@MainActor
final class QuickPasteController: NSObject, NSTableViewDataSource, NSTableViewDelegate, NSSearchFieldDelegate {
    private let store: CompanionStore
    private let onPasteboardWrite: () -> Void
    private let onStatus: (String) -> Void
    private let panel: QuickPastePanel
    private let searchField = NSSearchField()
    private let tableView = QuickPasteTableView()
    private let emptyLabel = NSTextField(labelWithString: "No matching clips")
    private let footerLabel = NSTextField(labelWithString: "↑↓ Select    Return Paste    ⌘Return Copy    Esc Close")
    private var allClips: [NativeClip] = []
    private var filteredClips: [NativeClip] = []
    private var targetApplication: NSRunningApplication?

    init(store: CompanionStore, onPasteboardWrite: @escaping () -> Void, onStatus: @escaping (String) -> Void) {
        self.store = store
        self.onPasteboardWrite = onPasteboardWrite
        self.onStatus = onStatus
        self.panel = QuickPastePanel(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 480),
            styleMask: [.titled, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        super.init()
        configurePanel()
    }

    private func configurePanel() {
        panel.title = "Clipboard+ Quick Paste"
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isMovableByWindowBackground = true
        panel.isReleasedWhenClosed = false
        panel.hidesOnDeactivate = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.backgroundColor = NSColor(calibratedWhite: 0.045, alpha: 1)

        guard let contentView = panel.contentView else { return }
        contentView.wantsLayer = true
        contentView.layer?.backgroundColor = NSColor(calibratedWhite: 0.045, alpha: 1).cgColor

        let logoView = NSImageView()
        logoView.translatesAutoresizingMaskIntoConstraints = false
        logoView.image = BrandAssets.logo
        logoView.imageScaling = .scaleProportionallyUpOrDown

        let title = NSTextField(labelWithString: "")
        title.translatesAutoresizingMaskIntoConstraints = false
        title.attributedStringValue = {
            let value = NSMutableAttributedString(
                string: "Clipboard",
                attributes: [
                    .font: BrandAssets.font(size: 22, weight: .bold),
                    .foregroundColor: NSColor(calibratedWhite: 0.96, alpha: 1),
                ]
            )
            value.append(NSAttributedString(
                string: "+",
                attributes: [
                    .font: BrandAssets.font(size: 22, weight: .extraBold),
                    .foregroundColor: NSColor(calibratedRed: 0.95, green: 0.78, blue: 0.23, alpha: 1),
                ]
            ))
            return value
        }()

        searchField.translatesAutoresizingMaskIntoConstraints = false
        searchField.placeholderString = "Search clips, apps, or websites"
        searchField.font = BrandAssets.font(size: 13)
        searchField.delegate = self
        searchField.focusRingType = .none
        searchField.controlSize = .large

        let scrollView = NSScrollView()
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.hasVerticalScroller = true
        scrollView.drawsBackground = false
        tableView.headerView = nil
        tableView.backgroundColor = .clear
        tableView.rowHeight = 60
        tableView.intercellSpacing = NSSize(width: 0, height: 5)
        tableView.selectionHighlightStyle = .regular
        tableView.dataSource = self
        tableView.delegate = self
        tableView.target = self
        tableView.doubleAction = #selector(pasteSelected)
        tableView.onChoose = { [weak self] copyOnly in self?.chooseSelected(copyOnly: copyOnly) }
        tableView.onCancel = { [weak self] in self?.close() }
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("clip"))
        column.resizingMask = .autoresizingMask
        tableView.addTableColumn(column)
        scrollView.documentView = tableView

        emptyLabel.translatesAutoresizingMaskIntoConstraints = false
        emptyLabel.font = BrandAssets.font(size: 13, weight: .medium)
        emptyLabel.textColor = NSColor(calibratedWhite: 0.55, alpha: 1)
        emptyLabel.alignment = .center
        emptyLabel.isHidden = true

        footerLabel.translatesAutoresizingMaskIntoConstraints = false
        footerLabel.font = BrandAssets.font(size: 10, weight: .medium)
        footerLabel.textColor = NSColor(calibratedWhite: 0.48, alpha: 1)
        footerLabel.alignment = .center

        contentView.addSubview(logoView)
        contentView.addSubview(title)
        contentView.addSubview(searchField)
        contentView.addSubview(scrollView)
        contentView.addSubview(emptyLabel)
        contentView.addSubview(footerLabel)
        NSLayoutConstraint.activate([
            logoView.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 20),
            logoView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 24),
            logoView.widthAnchor.constraint(equalToConstant: 42),
            logoView.heightAnchor.constraint(equalToConstant: 42),
            title.leadingAnchor.constraint(equalTo: logoView.trailingAnchor, constant: 10),
            title.centerYAnchor.constraint(equalTo: logoView.centerYAnchor),
            searchField.topAnchor.constraint(equalTo: logoView.bottomAnchor, constant: 12),
            searchField.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 24),
            searchField.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -24),
            searchField.heightAnchor.constraint(equalToConstant: 42),
            scrollView.topAnchor.constraint(equalTo: searchField.bottomAnchor, constant: 14),
            scrollView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 18),
            scrollView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -18),
            scrollView.bottomAnchor.constraint(equalTo: footerLabel.topAnchor, constant: -12),
            emptyLabel.centerXAnchor.constraint(equalTo: scrollView.centerXAnchor),
            emptyLabel.centerYAnchor.constraint(equalTo: scrollView.centerYAnchor),
            footerLabel.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 18),
            footerLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -18),
            footerLabel.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -17),
            footerLabel.heightAnchor.constraint(equalToConstant: 16),
        ])
    }

    func show() {
        if !panel.isVisible {
            targetApplication = NSWorkspace.shared.frontmostApplication
        }
        do {
            allClips = try store.readPaletteHistory()
        } catch {
            allClips = []
            onStatus("Quick Paste could not read history")
        }
        searchField.stringValue = ""
        applyFilter()

        let mouseLocation = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { $0.frame.contains(mouseLocation) } ?? NSScreen.main
        if let frame = screen?.visibleFrame {
            panel.setFrameOrigin(NSPoint(x: frame.midX - panel.frame.width / 2, y: frame.midY - panel.frame.height / 2))
        }
        NSApplication.shared.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
        panel.makeFirstResponder(searchField)
    }

    func close() {
        panel.orderOut(nil)
        targetApplication?.activate(options: [.activateIgnoringOtherApps])
    }

    func numberOfRows(in tableView: NSTableView) -> Int { filteredClips.count }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let identifier = NSUserInterfaceItemIdentifier("clip-row")
        let rowView = tableView.makeView(withIdentifier: identifier, owner: self) as? ClipRowView ?? ClipRowView()
        rowView.identifier = identifier
        rowView.configure(with: filteredClips[row])
        return rowView
    }

    func controlTextDidChange(_ notification: Notification) { applyFilter() }

    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        switch commandSelector {
        case #selector(NSResponder.moveDown(_:)):
            moveSelection(by: 1)
        case #selector(NSResponder.moveUp(_:)):
            moveSelection(by: -1)
        case #selector(NSResponder.insertNewline(_:)):
            chooseSelected(copyOnly: NSApp.currentEvent?.modifierFlags.contains(.command) == true)
        case #selector(NSResponder.cancelOperation(_:)):
            close()
        default:
            return false
        }
        return true
    }

    private func applyFilter() {
        filteredClips = PaletteSearch.filter(allClips, query: searchField.stringValue)
        tableView.reloadData()
        emptyLabel.isHidden = !filteredClips.isEmpty
        if !filteredClips.isEmpty {
            tableView.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false)
            tableView.scrollRowToVisible(0)
        }
    }

    private func moveSelection(by offset: Int) {
        guard !filteredClips.isEmpty else { return }
        let current = max(0, tableView.selectedRow)
        let next = min(filteredClips.count - 1, max(0, current + offset))
        tableView.selectRowIndexes(IndexSet(integer: next), byExtendingSelection: false)
        tableView.scrollRowToVisible(next)
    }

    @objc private func pasteSelected() { chooseSelected(copyOnly: false) }

    private func chooseSelected(copyOnly: Bool) {
        guard !filteredClips.isEmpty else { return }
        let row = tableView.selectedRow >= 0 ? tableView.selectedRow : 0
        let clip = filteredClips[row]
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        guard pasteboard.setString(clip.content, forType: .string) else {
            onStatus("Quick Paste could not update the clipboard")
            return
        }
        onPasteboardWrite()
        panel.orderOut(nil)
        targetApplication?.activate(options: [.activateIgnoringOtherApps])

        if copyOnly {
            onStatus("Copied from Quick Paste")
            return
        }

        let prompt = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
        guard AXIsProcessTrustedWithOptions(prompt) else {
            onStatus("Copied — allow Accessibility to paste automatically")
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            let source = CGEventSource(stateID: .hidSystemState)
            let keyDown = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: true)
            let keyUp = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: false)
            keyDown?.flags = .maskCommand
            keyUp?.flags = .maskCommand
            keyDown?.post(tap: .cghidEventTap)
            keyUp?.post(tap: .cghidEventTap)
        }
        onStatus("Pasted from Quick Paste")
    }
}
