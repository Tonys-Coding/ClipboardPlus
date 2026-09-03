#!/bin/zsh
set -euo pipefail

install_dir="$HOME/Library/Application Support/ClipboardPlus"
launch_agent="$HOME/Library/LaunchAgents/com.clipboardplus.companion.plist"
host_manifests=(
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.clipboardplus.native.json"
  "$HOME/Library/Application Support/Chromium/NativeMessagingHosts/com.clipboardplus.native.json"
)

/bin/launchctl bootout "gui/$UID/com.clipboardplus.companion" 2>/dev/null || true
/bin/rm -f "${host_manifests[@]}" "$launch_agent"
/bin/rm -f "$install_dir/ClipboardPlusCompanion" "$install_dir/ClipboardPlusNativeHost"
/bin/rm -rf "$install_dir/ClipboardPlus.app"

if [[ "${1:-}" == "--purge" ]]; then
  /bin/rm -f "$install_dir/companion-queue.json" "$install_dir/companion-queue.lock" "$install_dir/palette-history.json" "$install_dir/companion.log"
fi

echo "Clipboard+ companion uninstalled. Existing queue data was preserved unless --purge was supplied."
