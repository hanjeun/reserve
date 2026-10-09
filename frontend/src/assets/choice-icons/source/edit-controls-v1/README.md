# RESERVE editing and status icons · v1

Four new, original editable 3D icons. Static only.

- `edit-operation`: rounded clock with a neutral eight-tooth settings gear, for operating hours, holidays and settings
- `edit-identity`: abstract gallery card with a small pencil, for identity/photo editing; no actual photograph, face or text
- `intake-paused`: queue/intake ticket with two neutral pause bars, for a temporary acceptance pause
- `waiting-off`: queue ticket with a neutral off switch, white knob on the left; visually distinct from pause, deletion and payment failure

## Files

Each icon is rendered independently at 512 × 512 and 768 × 768. `static/512/` and `static/768/` contain one RGBA8 lossless PNG and one WebP for each icon: eight PNGs and eight WebPs in total. Exact names follow `<asset-id>-<size>.<extension>`.

WebP settings: quality 92, method 6, lossy RGB and lossless alpha. Alpha is verified pixel-identical to its PNG. PNG optimization is lossless and verified pixel-identical to the native Blender render. The 512px WebP target is 20,000 bytes; the 768px target is 32,000 bytes. PNG masters prioritize losslessness over size. All images have fully transparent canvas edges, no backdrop and no external/drop-shadow layer.

`source/` includes four editable `.blend` scenes, procedural rebuild code and licenses. `previews/` contains light/dark overview sheets and actual 48/56/64px previews from both source sizes, for both PNG and WebP. Review-sheet backgrounds and labels are not part of the icon files. No animation or CSS is included.

## Shared appearance

Blender 4.3.2, Eevee Next, 128 samples, transparent film. The camera, three area lights, world color, material parameters, AgX color management and geometry normalization continue the previous RESERVE category/extra-icon pipeline unchanged. Neutral blue-gray (`#8191A6`) is reused from the existing palette for gear and status indicators.

- Porcelain white: `#F2F5FA`
- Pale blue-gray: `#B8C9DE`
- Small blue accents: `#3182F6`
- Neutral blue-gray details: `#8191A6`

These are material base colors. Lighting, reflection and AgX affect rendered pixels. Geometry is modeled directly and remains editable. No stock model, texture, raster reference, actual photo, font, QR payload or external linked asset is incorporated.

## Rebuild

From this extracted folder, with Blender 4.3.2 and Python with Pillow and NumPy installed:

    blender --factory-startup -b --python source/build_assets.py -- --resolution 512 768
    python3 source/encode_and_validate.py

To inspect and re-render the saved editable scenes without changing them:

    blender --factory-startup -b --python source/validate_blends.py -- --output /tmp/reserve-control-check

The supplied QA records also compare all shared style settings against the previous `waiting-onsite.blend` scene. The source geometry, lights and camera are retained in every `.blend`; no external input is required to render it.

## Existing files and reuse

This is an additive package. Existing assets, refinements, source scenes, PNGs, licenses and prior ZIPs were not rewritten. The preservation report records SHA-256 checks before and after production. Continue using the existing `popup` for category, `intake-both` for intake mode, `intake-reservation` for booking mode, and `waiting-both` for waiting mode; those assets are intentionally not duplicated here.

## License

Original icon images and Blender geometry: CC0 1.0 Universal, to the extent rights exist and can lawfully be waived. Original code: MIT. Full statements and the CC0 legal-code link are in `source/LICENSE-ASSETS.txt` and `source/LICENSE-CODE.txt`, carried forward without alteration from the preceding extra-icon kit. Third-party production tools retain their own licenses. No warranty of exclusivity or copyrightability is made.
