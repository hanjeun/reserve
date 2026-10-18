#!/usr/bin/env python3
"""Validate and package the six new RESERVE community/benefit states.

After all twelve native renders, the six .blend files, and README are ready:
  python3 source/validate_delivery.py --check-originals

For image checks and review sheets before README/source delivery is complete:
  python3 source/validate_delivery.py --images-only

When explicitly authorized to make the final archive:
  python3 source/validate_delivery.py --check-originals --zip

The twelve input PNG files are read only. PNG, WebP, review-sheet, and license
files are not replaced with differing bytes by default. Refinement-generated
WebP/review-sheet files may be refreshed with --refresh-derived. PNG renders and
licenses are never rewritten. Generated manifest/QA metadata can be refreshed
explicitly with --refresh-metadata. Only review sheets resize
icons. The delivery images remain their independently rendered 512/768 canvases.
Requires Pillow with WebP support; does not install anything or access a network.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import sys
import zipfile

from PIL import Image, ImageDraw, ImageFont, features
import PIL

ROOT = Path(__file__).resolve().parents[1]
STATES = (
    "empty-feed", "empty-comment", "draft-transfer", "draft-conflict",
    "benefit-review-pending", "benefit-review-rejected",
)
SIZES = (512, 768)
REVIEW_SIZES = (48, 56, 64, 72, 80, 96, 112)
THEMES = (("white", "#FFFFFF", "#223047"),
          ("dark", "#161C27", "#E8EEF7"))
LICENSE_SOURCE = ROOT.parent / "reserve-category-kit" / "source"
LICENSE_MAP = {"LICENSE-ASSETS.txt": "assets-cc0.txt",
               "LICENSE-CODE.txt": "code-mit.txt"}
BASELINE = ROOT / "qa" / "original-files-before.json"
MANIFEST = ROOT / "manifest.json"
QA_FILE = ROOT / "qa" / "delivery-validation.json"
EXCLUDED_SUFFIXES = {".blend1", ".blend2", ".pyc", ".zip", ".tmp"}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def write_preserving(path: Path, data: bytes, *, refresh: bool = False, refresh_derived: bool = False) -> None:
    """Write new output only, or accept identical output. No implicit clobber."""
    require(path.resolve().is_relative_to(ROOT), f"Output outside delivery: {path}")
    require(not path.is_symlink(), f"Refusing symlink output: {path}")
    if path.exists():
        require(path.is_file(), f"Output is not a regular file: {path}")
        if path.read_bytes() == data:
            return
        metadata_allowed = refresh and path in (QA_FILE, MANIFEST)
        derived_allowed = refresh_derived and (
            (path.suffix == ".webp" and path.is_relative_to(ROOT / "static")) or
            (path.suffix == ".png" and path.parent == ROOT / "previews"))
        require(metadata_allowed or derived_allowed,
                f"Existing file differs; preserved without changes: {path}")
        # Explicit refinements may replace only derived WebP/review sheets;
        # source PNG renders, Blender files, and license texts remain read-only.
        temporary = path.with_name(path.name + ".tmp")
        require(not temporary.exists(), f"Temporary path already exists: {temporary}")
        with temporary.open("xb") as stream:
            stream.write(data)
        os.replace(temporary, path)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as stream:
        stream.write(data)


def check_case_collisions() -> None:
    seen: dict[str, str] = {}
    for path in sorted(ROOT.rglob("*")):
        require(not path.is_symlink(), f"Symlinks are not allowed: {rel(path)}")
        relative = rel(path)
        key = relative.casefold()
        require(key not in seen, f"Case-only path collision: {seen.get(key)} / {relative}")
        seen[key] = relative


def png_header(path: Path) -> dict:
    with path.open("rb") as stream:
        header = stream.read(33)
    require(len(header) == 33 and header[:8] == b"\x89PNG\r\n\x1a\n",
            f"Not a PNG: {rel(path)}")
    require(header[12:16] == b"IHDR", f"PNG has no first IHDR: {rel(path)}")
    width, height, bits, color, compression, filtering, interlace = struct.unpack(
        ">IIBBBBB", header[16:29])
    require(bits == 8 and color == 6,
            f"PNG must be RGBA8 (bit depth 8, color type 6): {rel(path)}; got {bits}/{color}")
    return {"width": width, "height": height, "bit_depth": bits,
            "png_color_type": color, "interlaced": bool(interlace)}


def encode_image(image: Image.Image, fmt: str, **kwargs) -> bytes:
    out = io.BytesIO()
    image.save(out, format=fmt, **kwargs)
    return out.getvalue()


def validate_images(refresh_derived: bool = False) -> tuple[list[dict], list[dict], dict[str, str]]:
    require(features.check("webp"), "Pillow was built without WebP support")
    expected_pngs = {
        ROOT / "static" / str(size) / f"{state}-{size}.png"
        for state in STATES for size in SIZES
    }
    actual_pngs = set((ROOT / "static").rglob("*.png"))
    require(actual_pngs == expected_pngs,
            "Expected exactly twelve native PNGs; missing=" +
            str(sorted(rel(p) for p in expected_pngs - actual_pngs)) +
            "; unexpected=" + str(sorted(rel(p) for p in actual_pngs - expected_pngs)))
    checks, image_records, initial_hashes = [], [], {}
    for size in SIZES:
        for state in STATES:
            png = ROOT / "static" / str(size) / f"{state}-{size}.png"
            initial_hashes[rel(png)] = sha256(png)
            header = png_header(png)
            require((header["width"], header["height"]) == (size, size),
                    f"Unexpected IHDR size: {rel(png)}")
            with Image.open(png) as opened:
                opened.load()
                require(opened.format == "PNG" and opened.mode == "RGBA",
                        f"PNG must decode directly as RGBA: {rel(png)}")
                image = opened.copy()
            require(image.size == (size, size), f"Wrong canvas size: {rel(png)}")
            alpha = image.getchannel("A")
            bbox = alpha.getbbox()
            require(bbox is not None, f"Entirely transparent PNG: {rel(png)}")
            require(alpha.getextrema() == (0, 255),
                    f"Expected transparent and opaque pixels: {rel(png)}")
            edges = (alpha.crop((0, 0, size, 1)),
                     alpha.crop((0, size - 1, size, size)),
                     alpha.crop((0, 0, 1, size)),
                     alpha.crop((size - 1, 0, size, size)))
            require(all(edge.getextrema() == (0, 0) for edge in edges),
                    f"Nontransparent pixels touch a canvas edge: {rel(png)}")
            margins = (bbox[0], bbox[1], size - bbox[2], size - bbox[3])
            require(min(margins) >= 1, f"Clipped alpha bbox: {rel(png)}")
            alpha_histogram = alpha.histogram()
            require(sum(alpha_histogram[1:255]) > 0,
                    f"No antialias/translucent alpha pixels: {rel(png)}")
            # WebP RGB is lossy at q92. Its alpha plane must be exact/lossless.
            webp = png.with_suffix(".webp")
            encoded = encode_image(image, "WEBP", quality=92, method=6,
                                   lossless=False, alpha_quality=100, exact=True)
            write_preserving(webp, encoded, refresh_derived=refresh_derived)
            with Image.open(webp) as opened:
                opened.load()
                require(opened.format == "WEBP" and opened.mode == "RGBA",
                        f"WebP must decode as RGBA: {rel(webp)}")
                decoded = opened.copy()
            require(decoded.size == image.size, f"WebP size changed: {rel(webp)}")
            require(decoded.getchannel("A").tobytes() == alpha.tobytes(),
                    f"WebP alpha is not pixel-identical: {rel(webp)}")
            require(sha256(png) == initial_hashes[rel(png)],
                    f"Input PNG bytes changed: {rel(png)}")
            visible_box = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
            checks.append({
                "asset": state, "resolution": [size, size],
                "png": rel(png), "webp": rel(webp),
                "png_ihdr": header, "png_input_bytes_preserved": True,
                "png_sha256_before_and_after": initial_hashes[rel(png)],
                "alpha_range": [0, 255], "alpha_bbox": list(bbox),
                "alpha_threshold_8_bbox": list(visible_box) if visible_box else None,
                "margins_px_left_top_right_bottom": list(margins),
                "minimum_margin_px": min(margins),
                "minimum_margin_fraction": min(margins) / size,
                "all_four_canvas_edges_alpha_zero": True,
                "partial_alpha_pixel_count": sum(alpha_histogram[1:255]),
                "webp_alpha_pixel_identical": True,
                "webp_bytes": webp.stat().st_size,
                "webp_target_bytes": 40960,
                "webp_within_target": webp.stat().st_size <= (40960),
            })
            for path in (png, webp):
                image_records.append({
                    "file": rel(path), "asset": state,
                    "resolution": [size, size], "mode": "RGBA",
                    "bytes": path.stat().st_size, "sha256": sha256(path),
                    "transparent": True, "native_resolution": True,
                })
    actual_static = {p for p in (ROOT / "static").rglob("*") if p.is_file()}
    expected_static = expected_pngs | {p.with_suffix(".webp") for p in expected_pngs}
    require(actual_static == expected_static, "Static directory must contain only the 24 delivery images")
    require(len(image_records) == 24, "Expected exactly 24 PNG/WebP image records")
    return checks, image_records, initial_hashes


def draw_centered(draw: ImageDraw.ImageDraw, text: str, x: int, y: int,
                  fill: str, font: ImageFont.ImageFont) -> None:
    box = draw.textbbox((0, 0), text, font=font)
    draw.text((x - (box[2] - box[0]) // 2, y), text, fill=fill, font=font)


def label_lines(state: str) -> list[str]:
    # Two-line labels fit each column without abbreviation or truncation.
    if state.startswith("benefit-review-"):
        return ["benefit-review", state.removeprefix("benefit-review-")]
    return [state]


def build_previews(refresh_derived: bool = False) -> list[dict]:
    records = []
    font = ImageFont.load_default(size=13)
    title_font = ImageFont.load_default(size=15)
    icons = {}
    for state in STATES:
        with Image.open(ROOT / "static" / "768" / f"{state}-768.webp") as source:
            icons[state] = source.convert("RGBA")
    for theme, background, ink in THEMES:
        for size in REVIEW_SIZES:
            column = 192
            canvas = Image.new("RGB", (column * len(STATES), 80 + size + 52), background)
            draw = ImageDraw.Draw(canvas)
            draw.text((20, 14), f"RESERVE | actual {size} x {size} px icon canvases | {background}",
                      fill=ink, font=title_font)
            draw.text((20, 39), "View this sheet at 100% for actual pixel size.", fill=ink, font=font)
            for index, state in enumerate(STATES):
                icon = icons[state].resize((size, size), Image.Resampling.LANCZOS)
                center = index * column + column // 2
                canvas.paste(icon, (center - size // 2, 73), icon)
                for line_index, line in enumerate(label_lines(state)):
                    draw_centered(draw, line, center, 80 + size + line_index * 17, ink, font)
            path = ROOT / "previews" / f"{theme}-actual-{size}.png"
            write_preserving(path, encode_image(canvas, "PNG", optimize=True), refresh_derived=refresh_derived)
            records.append({"file": rel(path), "background": background,
                            "actual_icon_canvas_px": size, "sheet_size": list(canvas.size),
                            "label": "actual-size review sheet; view at 100%"})
        # Larger detail overview is explicitly separate from actual-size checks.
        column, thumb = 256, 224
        canvas = Image.new("RGB", (column * len(STATES), 328), background)
        draw = ImageDraw.Draw(canvas)
        draw.text((20, 15), f"RESERVE | six-state overview | 224 px review canvases | {background}",
                  fill=ink, font=title_font)
        for index, state in enumerate(STATES):
            center = index * column + column // 2
            icon = icons[state].resize((thumb, thumb), Image.Resampling.LANCZOS)
            canvas.paste(icon, (center - thumb // 2, 50), icon)
            for line_index, line in enumerate(label_lines(state)):
                draw_centered(draw, line, center, 281 + line_index * 17, ink, font)
        path = ROOT / "previews" / f"{theme}-overview.png"
        write_preserving(path, encode_image(canvas, "PNG", optimize=True), refresh_derived=refresh_derived)
        records.append({"file": rel(path), "background": background,
                        "actual_icon_canvas_px": thumb, "sheet_size": list(canvas.size),
                        "label": "larger detail overview"})
    require(len(records) == 16, "Expected fourteen actual-size sheets and two overviews")
    return records


def copy_original_licenses() -> list[dict]:
    records = []
    for source_name, output_name in LICENSE_MAP.items():
        source = LICENSE_SOURCE / source_name
        target = ROOT / "licenses" / output_name
        if source.is_file():
            original = source.read_bytes()
            write_preserving(target, original)
            require(target.read_bytes() == original, f"License text changed: {rel(target)}")
            records.append({"file": rel(target), "original_file": source_name,
                            "original_bytes_preserved": True, "sha256": sha256(target)})
        else:
            # A delivered package can be verified in isolation after the original
            # sibling kit is unavailable. Its checksum remains in the manifest.
            require(target.is_file(), f"Original/copy license both missing: {source_name}")
            records.append({"file": rel(target), "original_file": source_name,
                            "original_bytes_preserved": "original source unavailable for comparison",
                            "sha256": sha256(target)})
    return records


def check_originals(enabled: bool) -> dict:
    if not enabled:
        return {"checked": False, "reason": "Run with --check-originals to verify the existing-work baseline"}
    require(BASELINE.is_file(), f"Original-files baseline is missing: {BASELINE}")
    originals = json.loads(BASELINE.read_text(encoding="utf-8"))
    require(isinstance(originals, dict), "Original-files baseline must be a relative-path/hash object")
    failures = []
    for relative, expected in sorted(originals.items()):
        path = ROOT.parent / relative
        require(path.resolve().is_relative_to(ROOT.parent), f"Unsafe baseline path: {relative}")
        if not path.is_file():
            failures.append({"file": relative, "problem": "missing"})
        elif sha256(path) != expected:
            failures.append({"file": relative, "problem": "hash changed"})
    require(not failures, "Existing work was changed: " + json.dumps(failures[:25]))
    return {"checked": True, "baseline_file": rel(BASELINE),
            "baseline_sha256": sha256(BASELINE),
            "aggregate_path_and_sha256": hashlib.sha256(json.dumps(originals, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest(),
            "files_checked": len(originals),
            "all_existing_files_byte_identical": True}


def validate_source_delivery() -> list[dict]:
    readmes = [p for p in ROOT.iterdir() if p.is_file() and p.name.casefold().startswith("readme")]
    require(bool(readmes), "README must be supplied before manifest/final ZIP; use --images-only while preparing")
    sources = []
    for state in STATES:
        path = ROOT / "source" / f"{state}.blend"
        require(path.is_file(), f"Missing Blender source: {rel(path)}")
        with path.open("rb") as stream:
            header = stream.read(12)
        recognized = (header.startswith(b"BLENDER") or header.startswith(b"\x1f\x8b")
                      or header.startswith(b"\x28\xb5\x2f\xfd"))
        require(recognized and path.stat().st_size > 1024,
                f"Unrecognized or too-small Blender source: {rel(path)}")
        sources.append({"file": rel(path), "bytes": path.stat().st_size,
                        "sha256": sha256(path), "blender_or_compressed_header_recognized": True})
    return sources


def validate_roundtrip(required: bool) -> dict:
    report = ROOT / "qa" / "saved-scene-roundtrip.json"
    if not report.is_file():
        require(not required, "Saved-scene roundtrip report is required before final ZIP")
        return {"checked": False, "completed_renders": 0, "expected_renders": 12}
    rows = json.loads(report.read_text(encoding="utf-8"))
    require(isinstance(rows, list), "Saved-scene roundtrip report must be a JSON list")
    expected = {(state, size) for state in STATES for size in SIZES}
    actual = [(row["asset"], row["resolution"]) for row in rows]
    require(len(actual) == len(set(actual)), "Duplicate saved-scene roundtrip records")
    require(set(actual).issubset(expected), "Unexpected saved-scene roundtrip record")
    for row in rows:
        require(row.get("reopened") and row.get("rendered") and
                row.get("rgba_pixel_identical") and row.get("alpha_identical") and
                row.get("max_channel_difference") == 0 and
                row.get("external_images") == 0 and row.get("linked_libraries") == 0 and
                row.get("font_objects") == 0,
                f"Failed saved-scene roundtrip: {row.get('asset')}/{row.get('resolution')}")
    # Compare against the current native PNGs even during an interim refresh so
    # a completed report from a superseded refinement is never called current.
    current_verified, stale = [], []
    for state, size in sorted(set(actual)):
        roundtrip = ROOT / "qa" / "roundtrip" / f"{state}-{size}.png"
        native = ROOT / "static" / str(size) / f"{state}-{size}.png"
        exact = False
        if roundtrip.is_file():
            with Image.open(roundtrip) as a, Image.open(native) as b:
                exact = a.size == b.size and a.convert("RGBA").tobytes() == b.convert("RGBA").tobytes()
        if exact:
            current_verified.append((state, size))
        else:
            stale.append({"asset": state, "resolution": size})
    complete = set(current_verified) == expected
    require(not required or complete,
            f"Final ZIP requires all 12 current saved-scene rerenders; verified {len(current_verified)}; stale/missing {stale}")
    return {"checked": complete, "report": rel(report),
            "report_record_count": len(rows), "completed_renders": len(current_verified),
            "expected_renders": 12, "all_completed_rgba_and_alpha_pixel_identical": True,
            "all_six_saved_scenes_both_native_sizes_verified": complete,
            "report_sha256": sha256(report), "stale_or_missing_current_renders": stale,
            "local_rerender_pixels_rechecked": True, "provenance": "Native renders and saved-scene rerenders inherited unchanged from v1 produced 2026-10-15; v2 rechecks image pixels and hashes, does not claim a new Blender render run."}



def included_files() -> list[Path]:
    files = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or path == MANIFEST:
            continue
        relative = path.relative_to(ROOT)
        if any(part.startswith(".") or part == "__pycache__" for part in relative.parts):
            continue
        if path.suffix.lower() in EXCLUDED_SUFFIXES:
            continue
        # This baseline names old, unrelated work and remains local QA evidence.
        # The delivered ZIP contains only the new six-state work and its results.
        if path == BASELINE:
            continue
        if relative.as_posix() in ("qa/existing-distinction-reference.png", "qa/first-review.png"):
            continue
        if len(relative.parts) >= 2 and relative.parts[:2] == ("qa", "roundtrip"):
            continue
        files.append(path)
    return sorted(files, key=lambda p: rel(p))


def build_manifest(images: list[dict], checks: list[dict], previews: list[dict],
                   licenses: list[dict], source_records: list[dict], roundtrip: dict) -> dict:
    files = [{"file": rel(path), "bytes": path.stat().st_size, "sha256": sha256(path)}
             for path in included_files()]
    return {
        "title": "RESERVE community and benefit states, version 2",
        "asset_count": len(STATES), "asset_ids": list(STATES),
        "production_tools": json.loads((ROOT / "qa" / "tool-versions.json").read_text(encoding="utf-8")),
        "static_file_count": len(images), "rendered_independently_at": list(SIZES),
        "image_encoding": {
            "png": "original RGBA8 Blender PNG bytes; no resize or recompression",
            "webp": {"quality": 92, "method": 6, "lossless": False,
                     "alpha_quality": 100, "exact": True,
                     "rgb": "lossy", "alpha": "pixel-identical to PNG"},
        },
        "transparency": "RGBA, alpha-zero edges, non-empty bounded content",
        "review_sheets": previews,
        "licenses": licenses,
        "blender_sources": source_records,
        "saved_scene_roundtrip": roundtrip,
        "images": images,
        "image_qa": checks,
        "manifest_note": "SHA-256 and byte sizes cover every packaged file except this self-referential manifest. The ZIP also contains this manifest.",
        "file_count_excluding_manifest": len(files), "files": files,
    }


def create_archive(manifest: dict, requested: str | None) -> dict:
    output = Path(requested).expanduser().resolve() if requested else ROOT.with_suffix(".zip")
    require(output.parent in (ROOT, ROOT.parent), "ZIP must be in the new delivery folder or immediately beside it")
    require(output.suffix.lower() == ".zip", "Archive filename must end in .zip")
    require(not output.exists(), f"Refusing to overwrite existing archive: {output}")
    files = [ROOT / item["file"] for item in manifest["files"]] + [MANIFEST]
    for record in manifest["files"]:
        path = ROOT / record["file"]
        require(path.stat().st_size == record["bytes"] and sha256(path) == record["sha256"],
                f"File changed after manifest creation: {record['file']}")
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(files, key=lambda p: rel(p)):
            require(path.resolve().is_relative_to(ROOT), f"Archive source outside delivery: {path}")
            archive.write(path, f"{ROOT.name}/{rel(path)}")
    with zipfile.ZipFile(output, "r") as archive:
        require(archive.testzip() is None, "ZIP CRC check failed")
        names = archive.namelist()
        require(len(names) == len(files), "ZIP entry count does not match manifest")
        require(len({name.casefold() for name in names}) == len(names), "ZIP has case-only collisions")
        for path in files:
            name = f"{ROOT.name}/{rel(path)}"
            require(hashlib.sha256(archive.read(name)).hexdigest() == sha256(path),
                    f"ZIP member bytes differ: {name}")
    return {"file": str(output), "bytes": output.stat().st_size,
            "sha256": sha256(output), "members": len(files),
            "crc_and_member_sha256_verified": True}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--images-only", action="store_true", help="Encode/check images, sheets, licenses and QA; postpone source/README checks and manifest")
    parser.add_argument("--check-originals", action="store_true", help="Verify all existing files from the saved local baseline")
    parser.add_argument("--refresh-derived", action="store_true", help="Allow refreshing derived WebPs/review sheets after explicitly authorized scene refinements; PNGs stay read-only")
    parser.add_argument("--refresh-metadata", action="store_true", help="Allow replacing only this script's generated manifest.json and qa/delivery-validation.json")
    parser.add_argument("--zip", action="store_true", help="Create the final new-only ZIP; use only when final packaging is authorized")
    parser.add_argument("--zip-path", help="Optional new ZIP filename; must be in or beside the delivery folder")
    args = parser.parse_args()
    require(not (args.images_only and args.zip), "Cannot create a final ZIP with --images-only")
    require(not args.zip_path or args.zip, "--zip-path requires --zip")
    check_case_collisions()
    checks, images, initial_hashes = validate_images(refresh_derived=args.refresh_derived)
    previews = build_previews(refresh_derived=args.refresh_derived)
    licenses = copy_original_licenses()
    originals = check_originals(args.check_originals or args.zip)
    source_records = [] if args.images_only else validate_source_delivery()
    roundtrip = validate_roundtrip(required=args.zip)
    for relative, expected in initial_hashes.items():
        require(sha256(ROOT / relative) == expected, f"Input PNG was altered: {relative}")
    check_case_collisions()
    qa = {
        "checks_passed": True, "scope": "images-only" if args.images_only else "complete-delivery",
        "native_png_count": 12, "webp_count": 12, "static_file_count": 24,
        "png_bytes_preserved": True, "webp_alpha_exact_all_images": True,
        "webp_target_bytes": {"512": 40960, "768": 40960},
        "webp_target_misses": [{"file": row["webp"], "bytes": row["webp_bytes"], "target": row["webp_target_bytes"]} for row in checks if not row["webp_within_target"]],
        "native_png_bit_depth": 8, "native_png_color_type": 6,
        "all_image_dimensions_correct": True, "all_canvas_edges_transparent": True,
        "all_alpha_bounding_boxes_nonempty_and_inside_canvas": True,
        "case_insensitive_path_collisions": False,
        "preview_sheet_count": len(previews), "review_icon_sizes": list(REVIEW_SIZES),
        "review_backgrounds": [theme[1] for theme in THEMES],
        "blender_source_count": len(source_records), "original_work": originals,
        "saved_scene_roundtrip": roundtrip,
        "licenses": licenses, "images": checks,
        "validator_runtime": {"python": sys.version.split()[0], "pillow": PIL.__version__,
                              "webp": features.version("webp")},
    }
    write_preserving(QA_FILE, json_bytes(qa), refresh=args.refresh_metadata)
    summary = {"checks_passed": True, "qa": rel(QA_FILE), "static_files": 24,
               "review_sheets": len(previews), "original_work": originals,
               "webp_target_misses": qa["webp_target_misses"],
               "saved_scene_roundtrip": roundtrip}
    if not args.images_only:
        manifest = build_manifest(images, checks, previews, licenses, source_records, roundtrip)
        write_preserving(MANIFEST, json_bytes(manifest), refresh=args.refresh_metadata)
        summary["manifest"] = rel(MANIFEST)
        summary["packaged_file_count"] = len(manifest["files"]) + 1
        if args.zip:
            summary["archive"] = create_archive(manifest, args.zip_path)
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        print(f"VALIDATION FAILED: {error}", file=sys.stderr)
        raise SystemExit(1)
