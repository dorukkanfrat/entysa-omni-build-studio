#!/bin/zsh
DIR="$(cd "$(dirname "$0")" && pwd)"

[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
[ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
nvm use 22 >/dev/null 2>&1 || nvm use 20 >/dev/null 2>&1

cd "$DIR"
VERSION="$(node -p "require('./package.json').version")"
APP="dist/mac-arm64/Omni Launcher.app"
DMG="dist/Omni Launcher-${VERSION}-arm64.dmg"

echo "1/4 Uygulama paketleniyor..."
rm -rf dist
npx --yes electron-builder --mac --dir || exit 1

echo "2/4 Ad-hoc imza..."
codesign --deep --force --sign - "$APP" || exit 1
codesign --verify --verbose "$APP" || { echo "HATA: imza dogrulanamadi"; exit 1; }

echo "3/4 DMG olusturuluyor..."
STAGING="$(mktemp -d)"
ditto "$APP" "$STAGING/Omni Launcher.app"
ln -s /Applications "$STAGING/Applications"
rm -f "$DMG"
hdiutil create -volname "Omni Launcher" -srcfolder "$STAGING" -ov -format UDZO "$DMG" >/dev/null || exit 1
rm -rf "$STAGING"

echo "4/4 Hazir:"
echo "  $DIR/$DMG"
echo ""
echo "GitHub Release'e yuklemek icin:"
echo "  gh release upload v${VERSION} \"$DIR/$DMG\" --clobber --repo dorukkanfrat/entysa-omni-build-studio"
