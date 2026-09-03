#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
project_dir=${script_dir:h}
package_dir="$project_dir/native"
install_dir="$HOME/Library/Application Support/ClipboardPlus"
companion_app="$install_dir/ClipboardPlus.app"
companion_path="$companion_app/Contents/MacOS/ClipboardPlusCompanion"
launch_agents_dir="$HOME/Library/LaunchAgents"
launch_agent="$launch_agents_dir/com.clipboardplus.companion.plist"
native_host_dirs=(
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
  "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
)

swift build -c release --package-path "$package_dir" --product ClipboardPlusCompanion
swift build -c release --package-path "$package_dir" --product ClipboardPlusNativeHost
binary_dir=$(swift build -c release --package-path "$package_dir" --show-bin-path)

/usr/bin/install -d -m 700 "$install_dir"
/usr/bin/install -d -m 755 "$companion_app/Contents/MacOS"
/usr/bin/install -d -m 755 "$launch_agents_dir"
/usr/bin/install -m 755 "$binary_dir/ClipboardPlusCompanion" "$companion_path"
/usr/bin/install -m 644 "$package_dir/Installer/Info.plist.template" "$companion_app/Contents/Info.plist"
/usr/bin/codesign --force --deep --sign - "$companion_app"
/usr/bin/install -m 755 "$binary_dir/ClipboardPlusNativeHost" "$install_dir/ClipboardPlusNativeHost"
if [[ -f "$install_dir/ClipboardPlusCompanion" ]]; then
  /bin/rm -f "$install_dir/ClipboardPlusCompanion"
fi

for native_host_dir in "${native_host_dirs[@]}"; do
  /usr/bin/install -d -m 755 "$native_host_dir"
  host_manifest="$native_host_dir/com.clipboardplus.native.json"
  /usr/bin/sed "s|__NATIVE_HOST_PATH__|$install_dir/ClipboardPlusNativeHost|g" \
    "$package_dir/Installer/com.clipboardplus.native.json.template" > "$host_manifest"
  /bin/chmod 644 "$host_manifest"
done

/usr/bin/sed \
  -e "s|__COMPANION_PATH__|$companion_path|g" \
  -e "s|__LOG_PATH__|$install_dir/companion.log|g" \
  "$package_dir/Installer/com.clipboardplus.companion.plist.template" > "$launch_agent"
/bin/chmod 644 "$launch_agent"

if /bin/launchctl print "gui/$UID/com.clipboardplus.companion" >/dev/null 2>&1; then
  /bin/launchctl bootout "gui/$UID/com.clipboardplus.companion" 2>/dev/null || true
  /bin/sleep 0.5
fi
for attempt in 1 2 3; do
  if /bin/launchctl bootstrap "gui/$UID" "$launch_agent" 2>/dev/null; then
    break
  fi
  if [[ "$attempt" == "3" ]]; then
    echo "Could not start the Clipboard+ companion LaunchAgent." >&2
    exit 1
  fi
  /bin/sleep 0.5
done
/bin/launchctl kickstart -k "gui/$UID/com.clipboardplus.companion"

echo "Clipboard+ companion installed and started."
echo "Native host registered for Google Chrome and Chromium."
echo "Menu-bar companion: $companion_app"
echo "Press Control-Shift-V to open Clipboard+ Quick Paste from any application."
echo "Reload Clipboard+ 1.5.0 in chrome://extensions to activate Native Messaging."
