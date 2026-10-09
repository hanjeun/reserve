# RESERVE policy menu icons v1

Three new, static menu icons in the established RESERVE style:

- `edit-booking-policy`: a vertical rounded clipboard, three rows, and small blue checks. No calendar grid or clock.
- `edit-deposit`: a horizontal white-gray rounded wallet, one coin physically partly inserted, and a small blue clasp.
- `edit-refund`: one coin above an open, rounded, leftward bent return arrow. It is not a circular refresh arrow.

The coin faces have only a shallow rim. Production assets contain no currency signs, letters, numbers, brands, or logos.

## Included

Each icon has an independently rendered native 512 × 512 and 768 × 768 RGBA8 PNG, plus matching static transparent WebP: 6 PNGs and 6 WebPs. The WebPs use quality 92, method 6, exact lossless alpha. Byte targets are at most 20,000 bytes at 512 px and 32,000 bytes at 768 px. Actual file sizes and SHA-256 hashes are in `manifest.json`; no nominal or estimated values are substituted.

The three `.blend` files are editable, self-contained procedural scenes. `source/build_assets.py` rebuilds these three icons. No external model, photograph, texture, raster input, font, logo, linked Blender library, or image generation is used. Existing illustrations are not bundled again.

This is a static asset-only delivery. No CSS, animation, Lottie, video, application/site code, Git, deployment, or operational changes are included.

## Shared appearance

Blender 4.3.2, Eevee Next, 128 render samples. Both production resolutions are rendered independently, with no upscaling. Transparent film, AgX / Medium High Contrast, exposure 0.35, gamma 1.0. Orthographic camera at (3.2, -9, 4.8), scale 3.75, aimed at (0, 0, 1.04). The three existing area lights and material definitions are retained exactly.

Material base colors are white #F2F5FA, pale gray #B8C9DE, blue #3182F6, and neutral gray #8191A6. Lighting and color management affect final pixel values. No ground plane, new background, added drop shadow, gloss adjustment, or extra lighting is added. The refund arrow has a pale shaft and a small blue head to preserve direction at menu sizes.

## Rebuild and verify

With Blender 4.3.2 on PATH:

    blender --factory-startup -b --python source/build_assets.py -- --resolution 512 768
    python3 source/encode_and_validate.py
    blender --factory-startup -b --python source/validate_blends.py

Pillow and NumPy are used by the encoding/review script and are not bundled. The `.blend` files can also be opened and rendered directly. Relative render paths point to the corresponding 768 px PNG. Validation renders go to a separate sibling work directory and do not overwrite production or prior assets. The optional exact-reference comparison runs when the sibling extra-icon source is available; all assets remain editable without it.

`previews/` contains review sheets only. Light (#FFFFFF) and dark (#161C27) backgrounds and labels occur only on review sheets. Production files are transparent and have no text. Actual-size sheets show 48, 56, and 64 px canvases without magnification from each production WebP. These derivatives are for visual review, not native production assets.

`source/package_and_verify.py` is the original delivery audit/packager. Re-running that particular delivery audit requires the external pre-work snapshot and prior reference files; this does not affect rebuilding, opening, editing, encoding, or rendering the new icons.

## Verification and limits

The QA reports distinguish executed checks from checks not performed. They record dimensions, alpha, borders, margins, PNG lossless optimization, WebP encoding and exact alpha, light/dark pixel comparisons, actual-size visual review, editable-scene inspection, saved-scene rerenders, original-file preservation, ZIP integrity, and hashes.

All locally available earlier 48 states, eight small-size refinements, three camera/browser states, their source folders, eight earlier ZIPs, and local preview/site files were snapshotted before this work and checked afterward. See `qa/preservation-report.json` for exact counts.

The latest four edit-control files and ZIP were still absent locally. The preceding authorized Library download returned HTTP 403. No bypass or new download was attempted during this task. Its historical hash is recorded as historical reference only; its current contents, source settings, and current bytes were not independently verified. This package therefore makes no current-byte preservation claim for those inaccessible files.

Shared settings were compared exactly to an available same-pipeline extra-icon `.blend`. Visual style was also compared to the available camera/browser set. No browser integration, real-device display test, accessibility user study, or production-app behavior test was performed. Small-size image review does not prove usability in a deployed app.

## Licensing

Original images and editable models: CC0 1.0 Universal, to the extent rights exist and may lawfully be waived. Full legal text is in `source/CC0-1.0-FULL.txt`; see `source/LICENSE-ASSETS.txt`.

Original source code: MIT. The full license is in `source/LICENSE-CODE.txt`. Earlier source and asset notices are preserved verbatim under `source/prior-notices/`. Production software retains its own licenses. This package does not claim exclusive ownership of AI-assisted output or grant trademark, patent, or third-party rights.
