# Icon assets

Drop your app icon files here:

- `icon.icns` — macOS (use `iconutil` to convert from PNG)
- `icon.ico`  — Windows (use any image tool, multi-resolution)
- `icon.png`  — Linux (512×512 recommended)
- `icon.png`  — also used as dock icon in dev mode

## Creating icon.icns from a PNG (macOS)

Start with a square 1024×1024 PNG. Then:

```sh
mkdir icon.iconset
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
cp icon.png       icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset
```

Or one-shot via `pnpm dlx png2icons icon.png icon -allp`.

## Without an icon

electron-builder will use the default Electron icon if these files
are missing. The app name in Cmd+Tab still becomes "Rock" — only
the visual icon stays default.
