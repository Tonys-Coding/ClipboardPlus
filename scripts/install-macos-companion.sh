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
signing_label="ClipboardPlus Local Code Signing"
signing_dir="$install_dir/Signing"
signing_keychain="$signing_dir/ClipboardPlus.keychain-db"
signing_password_file="$signing_dir/keychain-password"
previous_requirement=""
accessibility_reset=false
search_list_extended=false
signing_temp=""
app_staging=""
existing_keychains=()

cleanup_signing_state() {
  if [[ "$search_list_extended" == true && ${#existing_keychains[@]} -gt 0 ]]; then
    /usr/bin/security list-keychains -d user -s "${existing_keychains[@]}" >/dev/null 2>&1 || true
  fi
  if [[ -n "$signing_temp" && "$signing_temp" == /tmp/clipboardplus-signing.* && -d "$signing_temp" ]]; then
    /bin/rm -rf -- "$signing_temp"
  fi
  if [[ -n "$app_staging" && "$app_staging" == /tmp/clipboardplus-app.* && -d "$app_staging" ]]; then
    /bin/rm -rf -- "$app_staging"
  fi
}
trap cleanup_signing_state EXIT

if [[ -d "$companion_app" ]]; then
  previous_requirement=$(/usr/bin/codesign -d -r- "$companion_app" 2>&1 \
    | /usr/bin/awk '/designated =>/ { sub(/^# /, ""); print; exit }' || true)
fi

if [[ -f "$signing_keychain" || -f "$signing_password_file" ]]; then
  if [[ ! -f "$signing_keychain" || ! -f "$signing_password_file" ]]; then
    echo "Clipboard+'s local signing data is incomplete. Remove $signing_dir and run the installer again." >&2
    exit 1
  fi
  signing_password=$(<"$signing_password_file")
  /usr/bin/security unlock-keychain -p "$signing_password" "$signing_keychain"
else
  /usr/bin/install -d -m 700 "$install_dir" "$signing_dir"
  signing_temp=$(/usr/bin/mktemp -d /tmp/clipboardplus-signing.XXXXXX)
  signing_password=$(/usr/bin/uuidgen | /usr/bin/tr -d '-')
  /usr/bin/security create-keychain -p "$signing_password" "$signing_keychain"
  /usr/bin/security unlock-keychain -p "$signing_password" "$signing_keychain"
  /bin/chmod 600 "$signing_keychain"
  /usr/bin/openssl req -x509 -newkey rsa:2048 \
    -keyout "$signing_temp/signing-key.pem" \
    -out "$signing_temp/signing-cert.pem" \
    -days 3650 -nodes \
    -subj "/CN=$signing_label/O=ClipboardPlus Local" \
    -addext "basicConstraints=critical,CA:FALSE" \
    -addext "keyUsage=critical,digitalSignature" \
    -addext "extendedKeyUsage=codeSigning" \
    -addext "subjectKeyIdentifier=hash" >/dev/null 2>&1
  /usr/bin/openssl pkcs12 -export \
    -inkey "$signing_temp/signing-key.pem" \
    -in "$signing_temp/signing-cert.pem" \
    -out "$signing_temp/signing.p12" \
    -passout "pass:$signing_password" \
    -name "$signing_label"
  /usr/bin/security import "$signing_temp/signing.p12" \
    -k "$signing_keychain" -P "$signing_password" -T /usr/bin/codesign >/dev/null
  /usr/bin/security set-key-partition-list \
    -S apple-tool:,apple:,codesign: -s -k "$signing_password" -l "$signing_label" "$signing_keychain" >/dev/null
  umask 077
  print -rn -- "$signing_password" > "$signing_password_file"
fi

signing_hash=$(/usr/bin/security find-certificate -a -c "$signing_label" -Z "$signing_keychain" 2>/dev/null \
  | /usr/bin/awk '/SHA-1 hash:/ { print $3; exit }')
if [[ -z "$signing_hash" ]]; then
  echo "Could not create the persistent Clipboard+ signing identity." >&2
  exit 1
fi

existing_keychains=("${(@f)$(/usr/bin/security list-keychains -d user \
  | /usr/bin/sed -E 's/^[[:space:]]*"//; s/"[[:space:]]*$//')}")
/usr/bin/security list-keychains -d user -s "${existing_keychains[@]}" "$signing_keychain" >/dev/null
search_list_extended=true

swift build -c release --package-path "$package_dir" --product ClipboardPlusCompanion
swift build -c release --package-path "$package_dir" --product ClipboardPlusNativeHost
binary_dir=$(swift build -c release --package-path "$package_dir" --show-bin-path)
app_staging=$(/usr/bin/mktemp -d /tmp/clipboardplus-app.XXXXXX)
staged_app="$app_staging/ClipboardPlus.app"
staged_companion="$staged_app/Contents/MacOS/ClipboardPlusCompanion"
staged_resources="$staged_app/Contents/Resources"

/usr/bin/install -d -m 700 "$install_dir"
/usr/bin/install -d -m 755 "$staged_app/Contents/MacOS"
/usr/bin/install -d -m 755 "$staged_resources"
/usr/bin/install -d -m 755 "$launch_agents_dir"
/usr/bin/install -m 755 "$binary_dir/ClipboardPlusCompanion" "$staged_companion"
/usr/bin/install -m 644 "$package_dir/Installer/Info.plist.template" "$staged_app/Contents/Info.plist"
/usr/bin/install -m 644 "$project_dir/public/fonts/Satoshi-Variable.woff2" "$staged_resources/Satoshi-Variable.woff2"
/usr/bin/install -m 644 "$project_dir/public/icons/clipboard-plus-logo.png" "$staged_resources/ClipboardPlusLogo.png"
/usr/bin/codesign --force --deep --sign "$signing_hash" "$staged_app"
/usr/bin/codesign --verify --deep --strict "$staged_app"
"$staged_companion" --check-brand-assets >/dev/null
current_requirement=$(/usr/bin/codesign -d -r- "$staged_app" 2>&1 \
  | /usr/bin/awk '/designated =>/ { sub(/^# /, ""); print; exit }')
/usr/bin/security list-keychains -d user -s "${existing_keychains[@]}" >/dev/null
search_list_extended=false
/usr/bin/security lock-keychain "$signing_keychain"

previous_app="$install_dir/ClipboardPlus.app.previous"
if [[ -d "$previous_app" ]]; then
  /bin/rm -rf "$previous_app"
fi
if [[ -d "$companion_app" ]]; then
  /bin/mv "$companion_app" "$previous_app"
fi
if ! /bin/mv "$staged_app" "$companion_app"; then
  if [[ -d "$previous_app" ]]; then
    /bin/mv "$previous_app" "$companion_app"
  fi
  echo "Could not replace the Clipboard+ companion app." >&2
  exit 1
fi
if [[ -d "$previous_app" ]]; then
  /bin/rm -rf "$previous_app"
fi
/bin/rm -rf "$app_staging"
app_staging=""

if [[ -n "$previous_requirement" && "$previous_requirement" != "$current_requirement" ]]; then
  if /usr/bin/tccutil reset Accessibility com.clipboardplus.companion >/dev/null 2>&1; then
    accessibility_reset=true
  fi
fi
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

if [[ "$accessibility_reset" == true ]]; then
  "$companion_path" --request-accessibility >/dev/null 2>&1 || true
fi

echo "Clipboard+ companion installed and started."
echo "Native host registered for Google Chrome and Chromium."
echo "Menu-bar companion: $companion_app"
echo "Press Control-Shift-V to open Clipboard+ Quick Paste from any application."
if [[ "$accessibility_reset" == true ]]; then
  echo "Accessibility access was reset once to replace the old per-build identity."
  echo "Double-click a Quick Paste result, then enable the new ClipboardPlus entry when macOS asks."
fi
echo "Reload Clipboard+ 1.6.3 in chrome://extensions to activate Native Messaging."
