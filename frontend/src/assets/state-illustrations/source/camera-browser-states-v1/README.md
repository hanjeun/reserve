# RESERVE camera and browser states v1

Three new, static state illustrations in the established RESERVE style:

- `camera-denied`: a rounded camera and separate padlock. Camera permission is blocked.
- `camera-unavailable`: a rounded camera with a neutral camera-off diagonal. The camera is missing, busy, or cannot start.
- `browser-unsupported`: a generic browser window and neutral restriction mark. No brand or browser logo is used.

## Included

Each state has an independently rendered native 512 × 512 and 768 × 768 RGBA PNG, plus a matching static transparent WebP. That is 12 production image files. The 512 px WebP ceiling is 20,000 bytes and the 768 px ceiling is 32,000 bytes. Exact file sizes, hashes, and encoding settings are recorded in `manifest.json` and the image-validation report.

The three `.blend` files are editable, self-contained procedural scenes. `source/build_assets.py` rebuilds only these three states. No external model, image, texture, font, logo, actual QR code, generated-raster input, or linked Blender library is needed. Existing illustrations are not bundled again.

This is a static asset-only delivery. No animation, Lottie, video, application/site code, deployment, Git, or operational changes are included.

## Shared appearance

Blender 4.3.2, Eevee Next, 128 render samples. Both production resolutions were rendered independently, with no upscaling. Transparent film, AgX / Medium High Contrast, exposure 0.35, gamma 1.0. Orthographic camera at (3.2, -9, 4.8), scale 3.75, aimed at (0, 0, 1.04). Three original area lights and the original material settings are retained.

Material base colors are #F2F5FA, #B8C9DE, #3182F6, and #8191A6. Lighting and color management affect final pixel values. Blue is limited to small accents. No ground plane, new background, added drop shadow, gloss adjustment, or extra lighting was added.

## Rebuild and verify

With Blender 4.3.2 on PATH:

    blender --factory-startup -b --python source/build_assets.py -- --resolution 512 768
    python3 source/encode_and_validate.py
    blender --factory-startup -b --python source/validate_blends.py

The Python encoding/review script uses Pillow and NumPy. They are production tools and are not bundled. The `.blend` files can also be opened and rendered directly. Their relative render paths point to the corresponding 768 px PNG. Validation renders go to a separate sibling work directory and do not overwrite delivered images or reference assets.

`previews/` contains review sheets only. Light (#FFFFFF) and dark (#161C27) backgrounds and descriptive labels appear only on those sheets. Production PNG/WebP files remain transparent and contain no text. The actual-size sheets show 48, 56, and 64 px canvases without magnification, downsampled from each production WebP. These review derivatives are not the native production assets.

## Verification and limits

See `qa/execution-report.json`, `qa/image-validation.json`, `qa/blend-validation.json`, `qa/roundtrip-validation.json`, and `qa/preservation-report.json` for checks that were actually executed and checks that were not executed. Independent visual review is recorded in `qa/independent-visual-review.json`.

The locally available earlier 48 states, eight small-size refinements, their source folders, earlier archives, and the local preview/site files were snapshotted before this work and checked afterward. The latest four edit-controls ZIP was resolved in Library but could not be downloaded (HTTP 403); its local folder and ZIP were absent. Therefore its contents and current SHA-256 could not be independently rechecked during this run. Its earlier recorded SHA-256 is included as historical reference only. No claim of byte verification is made for inaccessible files.

Settings were compared exactly against a locally available same-pipeline extra-icon `.blend`. The new scenes use those unchanged settings. The inaccessible latest-four archive was not independently opened in this run.

No browser integration, real-device rendering, accessibility user testing, or production-app behavior was executed. Small-size visual QA is an image review, not a usability study. No application/site changes are needed or made by this package.

## Licensing

Original images and editable models: CC0 1.0 Universal, to the extent rights exist and may lawfully be waived. Full legal text is included in `source/CC0-1.0-FULL.txt`; see `source/LICENSE-ASSETS.txt`.

Original source code: MIT. The full license is included in `source/LICENSE-CODE.txt`. Earlier source and asset notices are preserved verbatim under `source/prior-notices/`. Production software retains its own licenses. This package does not claim exclusive ownership of AI-assisted output or grant trademark/patent/third-party rights.
