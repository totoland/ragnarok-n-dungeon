#!/usr/bin/env bash
#
# Build Dungeon RO as a native iOS app, on any Mac with Xcode.
#
# The site itself has no build step - nginx serves the working tree, and that is still how
# lab and prod ship. A native app cannot do that: the bundle has to hold exactly the game's
# files and nothing else. So this script assembles that folder, hands it to Capacitor, and
# leaves Xcode open on a project that is ready to sign and run.
#
# It is safe to run again: every step checks what is already there and only fills in the gaps.
#
#   ./tools/ios.sh              check the machine, set up, build, open Xcode
#   ./tools/ios.sh check        just the preflight, changes nothing
#   ./tools/ios.sh build        rebuild the web folder and sync it (after editing the game)
#   ./tools/ios.sh open         open Xcode on the project
#   ./tools/ios.sh devices      list iPhones and iPads this Mac can build to
#   ./tools/ios.sh dress        re-apply the icon, launch screen and Info.plist settings
#   ./tools/ios.sh signing      show who can sign here, and write the team into the project
#
# Telemetry from the device: the game reports frame times, the input trace and the raw
# gamepad state every 10 s, which is the only way to see what a controller did on a tablet
# that is not plugged into anything. It needs an absolute address, because an app has no
# server of its own. On the machine that deploys, the address comes out of deploy/.deployrc
# by itself. Anywhere else, pass it in:
#
#   DRO_LOG_ENDPOINT=https://your-lab-host ./tools/ios.sh
#   DRO_LOG_ENDPOINT= ./tools/ios.sh        (empty: build with reporting off)

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
IOS_APP="$ROOT/ios/App/App"

say()  { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mok\033[0m    %s\n' "$*"; }
warn() { printf '  \033[33mwarn\033[0m  %s\n' "$*"; }
die()  { printf '  \033[31mstop\033[0m  %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight

check() {
  say "Checking this machine"

  [ "$(uname -s)" = "Darwin" ] || die "iOS builds only happen on macOS. This is $(uname -s)."
  ok "macOS $(sw_vers -productVersion) on $(uname -m)"

  command -v node >/dev/null || die "Node is not installed. Install Node 20 or newer: brew install node"
  local major; major=$(node -p 'process.versions.node.split(".")[0]')
  [ "$major" -ge 20 ] || die "Node $major is too old; Capacitor 8 needs Node 20 or newer."
  ok "node $(node -v)"

  # The usual trap: Command Line Tools are installed and `git` and `clang` work, so the Mac
  # looks ready, but there is no Xcode to build an app with and no way to sign one.
  local dev; dev=$(xcode-select -p 2>/dev/null || true)
  case "$dev" in
    *Xcode*) : ;;
    *) die "Only Command Line Tools are active ($dev).
        Install Xcode from the App Store, then:
          sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
          sudo xcodebuild -license accept
          xcodebuild -runFirstLaunch" ;;
  esac
  # Show what xcodebuild actually said. A freshly installed Xcode fails here for one of three
  # reasons and they need different fixes, so swallowing its message costs an hour.
  local xout xv
  if ! xout=$(xcodebuild -version 2>&1); then
    printf '\n%s\n\n' "$xout" | sed 's/^/        /' >&2
    die "xcodebuild will not run. Its own message is above; usually one of:
          sudo xcodebuild -license accept   the licence has not been agreed to yet
          xcodebuild -runFirstLaunch        the build components are not installed yet
          (or Xcode is still downloading - let the App Store finish first)"
  fi
  xv=$(printf '%s\n' "$xout" | head -1 | awk '{print $2}')
  case "$xv" in
    ''|*[!0-9.]*) die "Could not read a version out of: $(printf '%s' "$xout" | head -1)" ;;
  esac
  [ "${xv%%.*}" -ge 16 ] || die "Xcode $xv is too old; Capacitor 8 needs Xcode 16 or newer."
  ok "Xcode $xv"

  # Capacitor 8 builds through Swift Package Manager. CocoaPods is not needed and not used.
  local free; free=$(df -g . | awk 'NR==2 {print $4}')
  if [ "$free" -lt 5 ]; then
    warn "${free} GB free. A build needs a few GB of headroom; clear some space if it fails."
  else
    ok "${free} GB free"
  fi

  if [ -n "${DRO_LOG_ENDPOINT+x}" ]; then
    [ -n "$DRO_LOG_ENDPOINT" ] && ok "telemetry → $DRO_LOG_ENDPOINT" || ok "telemetry off (endpoint set to empty)"
  elif [ -f "$ROOT/deploy/.deployrc" ]; then
    ok "telemetry address will come from deploy/.deployrc"
  else
    warn "no DRO_LOG_ENDPOINT and no deploy/.deployrc: the app will not report anything.
        Pass one in to read what a controller does on the device:
          DRO_LOG_ENDPOINT=https://your-lab-host $0"
  fi
}

# ------------------------------------------------- native project + its art

# Everything here is a property of the game rather than of Capacitor's template, so it is
# applied on every run: a project regenerated on another machine comes out the same.
dress_project() {
  local icon="$ROOT/assets/icons/icon-512.png"
  local appicon="$IOS_APP/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
  local splashdir="$IOS_APP/Assets.xcassets/Splash.imageset"

  # iOS wants one opaque 1024 icon. The source art is 512, so it is scaled up; replace the
  # source with real 1024 art before any submission.
  if [ -f "$icon" ] && [ -d "$(dirname "$appicon")" ]; then
    sips -s format png -z 1024 1024 "$icon" --out "$appicon" >/dev/null 2>&1
    ok "app icon"
  fi

  # Capacitor's launch screen is white. The game is nearly black, so the stock one flashes
  # white for as long as the first frame takes. Pad the icon out on the page's own colour.
  if [ -f "$icon" ] && [ -d "$splashdir" ]; then
    for f in "$splashdir"/splash-*.png; do
      [ -e "$f" ] || continue
      sips -s format png "$icon" --padToHeightWidth 2732 2732 --padColor 07060A --out "$f" >/dev/null 2>&1
    done
    ok "launch screen on #07060a"
  fi

  # A regenerated project gets Capacitor's stock xcconfig back; put the optional include for
  # the untracked signing file in again, or the team has to be picked by hand a second time.
  local xc="$ROOT/ios/debug.xcconfig"
  if [ -f "$xc" ] && ! grep -q 'local.xcconfig' "$xc"; then
    printf '\n#include? "local.xcconfig"\n' >> "$xc"
    ok "signing include restored"
  fi

  # A full-screen game: nothing of the system sits over the HUD.
  local pb=/usr/libexec/PlistBuddy plist="$IOS_APP/Info.plist"
  if [ -f "$plist" ]; then
    "$pb" -c "Set :UIViewControllerBasedStatusBarAppearance false" "$plist" >/dev/null 2>&1 || true
    "$pb" -c "Add :UIStatusBarHidden bool true" "$plist" >/dev/null 2>&1 \
      || "$pb" -c "Set :UIStatusBarHidden true" "$plist" >/dev/null 2>&1 || true
    ok "status bar hidden"
  fi
}

# Xcode's own answer to "requires a development team" is a dropdown four clicks in, and it
# is empty until an Apple ID has been added to Xcode, which the message does not say. Read
# the signing identities out of the keychain instead and write the choice to a file.
signing() {
  local want="${1:-}"
  local plist="$IOS_APP/Info.plist"

  if [ -n "$want" ]; then
    printf 'DEVELOPMENT_TEAM = %s\n' "$want" > "$ROOT/ios/local.xcconfig"
    ok "team $want written to ios/local.xcconfig (not tracked)"
    echo "     Close and reopen the project, or press Run: Xcode picks it up from the xcconfig."
    return
  fi

  say "Who can sign on this Mac"
  local ids; ids=$(security find-identity -v -p codesigning 2>/dev/null || true)
  local certteams; certteams=$(printf '%s\n' "$ids" | sed -n 's/.*(\([A-Z0-9]\{10\}\)).*/\1/p' | sort -u || true)

  # A free account has no certificate until Xcode first builds with it, so the keychain can
  # be empty while the Apple ID is perfectly well signed in. Xcode records the teams it knows
  # separately, and that list is enough to name the team - the certificate follows on its own.
  local xcteams; xcteams=$(defaults read com.apple.dt.Xcode IDEProvisioningTeams 2>/dev/null \
    | sed -n 's/.*teamID = "\{0,1\}\([A-Z0-9]\{10\}\)"\{0,1\};.*/\1/p' | sort -u || true)
  local teams; teams=$(printf '%s\n%s\n' "$certteams" "$xcteams" | grep -v '^$' | sort -u || true)

  if [ -z "$teams" ]; then
    warn "no Apple ID signed in to Xcode here, which is what Xcode means by a missing team."
    cat <<'FIX'

        Add one - a free Apple ID is enough:
          Xcode → Settings… (⌘,) → Accounts → + → Apple ID → sign in
        Then, in the same window, select the account and click Manage Certificates… → +
        → Apple Development. That creates the certificate straight away instead of waiting
        for a build to ask for it. Come back and run this again.

FIX
    return 1
  fi

  # "0 valid identities found" is still output, so judge by the team IDs, not by the text.
  if [ -n "$certteams" ]; then printf '%s\n' "$ids" | sed 's/^/  /'; else
    warn "an Apple ID is signed in but has no certificate yet; Xcode makes one on the first build."
  fi
  echo
  say "Team IDs found"
  printf '%s\n' "$teams" | sed 's/^/  /'
  echo
  if [ -f "$ROOT/ios/local.xcconfig" ]; then
    ok "this project already signs as $(sed -n 's/.*DEVELOPMENT_TEAM *= *//p' "$ROOT/ios/local.xcconfig")"
  fi
  local first; first=$(printf '%s\n' "$teams" | head -1)
  echo "  To use the first one:  $0 signing $first"
}

setup() {
  say "Setting up"

  if [ ! -d "$ROOT/node_modules/@capacitor/cli" ]; then
    npm install --no-audit --no-fund
    ok "npm dependencies"
  else
    ok "npm dependencies already installed"
  fi

  if [ ! -d "$ROOT/ios" ]; then
    # cap add needs the web folder to exist before it will copy anything into the project.
    node tools/build-web.mjs >/dev/null
    npx cap add ios
    ok "iOS project created"
  else
    ok "iOS project already present"
  fi

  dress_project
}

# ------------------------------------------------------------------- build

build() {
  say "Building"
  node tools/build-web.mjs
  npx cap sync ios
  ok "ios/App/App/public is in step with the source"
}

open_xcode() {
  say "Opening Xcode"
  npx cap open ios
  cat <<'NEXT'

  In Xcode, once:
    1. Pick the App target → Signing & Capabilities → Team = your Apple ID.
       A free account signs fine; the app stops launching after 7 days and is re-signed by
       running again.
    2. On the iPad: Settings → Privacy & Security → Developer Mode → on, then reboot.
    3. Choose the iPad at the top of the window and press Run.

  After editing the game:  ./tools/ios.sh build     (then press Run again)

NEXT
}

devices() {
  say "Devices this Mac can build to"
  xcrun devicectl list devices 2>/dev/null | sed -n '1,20p' \
    || xcrun xctrace list devices 2>/dev/null | sed -n '/^== Devices ==/,/^$/p'
}

case "${1:-all}" in
  check)   check ;;
  setup)   check; setup ;;
  build)   build ;;
  open)    open_xcode ;;
  devices) devices ;;
  dress)   say "Applying the game's icon, launch screen and Info.plist settings"; dress_project ;;
  signing) signing "${2:-}" ;;
  all)     check; setup; build; open_xcode ;;
  *)       die "Unknown command '$1'. Try: check | setup | build | open | devices" ;;
esac
