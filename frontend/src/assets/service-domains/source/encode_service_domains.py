"""Encode native exports without resizing or baking a background.

python encode_service_domains.py --exports <rendered PNG folder>
The app uses the 512px files; 768px exports remain with the editable artwork.
"""
import argparse
from pathlib import Path
from PIL import Image

SOURCE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("--exports", type=Path, default=SOURCE / "exports")
parser.add_argument("--output", type=Path, default=SOURCE.parent)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
for name in ["food", "beauty", "sports", "performance", "popup", "other"]:
    for size in [512, 768]:
        with Image.open(args.exports / f"{name}-{size}.png") as image:
            destination = (args.output if size == 512 else args.exports) / f"{name}-{size}.webp"
            image.save(destination, "WEBP", quality=92, method=6, alpha_quality=100)
            print(destination.name, destination.stat().st_size, flush=True)
