"""Draw the coordinate-mapping proof images.

    python -m pipeline.verify_overlay --raw data/raw/player_data --out docs/img

For each map:

* overlay_<Map>.jpg      every movement sample and every kill, death and storm
                         death, drawn on the minimap with the README transform.
* orientation_<Map>.jpg  the same samples under all eight possible axis
                         orientations, as a contact sheet.

Also writes orientation_check.json: for every orientation, the share of
movement samples that land on the black area around the map artwork (black
pixels connected to the image border). Players cannot stand there, so a wrong
orientation shows up as a high share. The check tests orientation at the
README's scale and origin; it does not pin scale or origin to better than a
few percent.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageFont

from pipeline.dataset import COMBAT_DEATH_EVENTS, EVENT_GROUPS, KILL_EVENTS, MOVEMENT_EVENTS, load_raw
from pipeline.maps import MAPS, MapConfig, uv_to_pixel, world_to_uv
from pipeline.minimap import black_surround, load_minimap

OVERLAY_WIDTH = 1600
PANEL_WIDTH = 480
SUPERSAMPLE = 2  # markers are drawn at twice the size and scaled down, for smooth edges
MAP_DIM = 0.45  # share of black blended into the minimap so that markers stand out

HUMAN = (86, 180, 233)
BOT = (230, 159, 0)
KILL = (240, 228, 66)
DEATH = (213, 94, 0)
STORM = (204, 121, 167)
INK = (12, 12, 13)
PAPER = (242, 241, 236)
ACCENT = (46, 196, 182)


@dataclass(frozen=True)
class Orientation:
    """One of the eight ways to lay the two horizontal world axes onto an image."""

    swap: bool  # z runs along the image width and x along its height
    mirror_u: bool  # left and right are exchanged
    mirror_v: bool  # up and down are exchanged

    @property
    def is_readme(self) -> bool:
        return not (self.swap or self.mirror_u or self.mirror_v)

    @property
    def label(self) -> str:
        across, along = ("z", "x") if self.swap else ("x", "z")
        return f"{across} {'left' if self.mirror_u else 'right'}, {along} {'down' if self.mirror_v else 'up'}"

    def apply(self, u: np.ndarray, v: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        if self.swap:
            u, v = v, u
        return (1.0 - u if self.mirror_u else u), (1.0 - v if self.mirror_v else v)


README_ORIENTATION = Orientation(swap=False, mirror_u=False, mirror_v=False)
ORIENTATIONS = [Orientation(swap, mirror_u, mirror_v) for swap in (False, True) for mirror_u in (False, True) for mirror_v in (False, True)]


def to_pixels(cfg: MapConfig, part: pd.DataFrame, size: tuple[int, int], orientation: Orientation) -> tuple[np.ndarray, np.ndarray]:
    """Pixel positions of the rows of one map on an image of ``size``."""
    u, v = world_to_uv(cfg.map_id, part["x"].to_numpy(np.float64), part["z"].to_numpy(np.float64))
    return uv_to_pixel(*orientation.apply(u, v), *size)


def share_off_map(surround: np.ndarray, px: np.ndarray, py: np.ndarray) -> float:
    """Share of points that fall on the black surround of the minimap, or outside the image."""
    height, width = surround.shape
    inside = (px >= 0) & (px < width) & (py >= 0) & (py < height)
    on_surround = surround[py[inside].astype(int), px[inside].astype(int)]
    return float((on_surround.sum() + (~inside).sum()) / len(px))


def _dots(draw: ImageDraw.ImageDraw, px: np.ndarray, py: np.ndarray, radius: float, colour: tuple[int, int, int], alpha: int) -> None:
    for x, y in zip(px * SUPERSAMPLE, py * SUPERSAMPLE):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(*colour, alpha))


def _triangle(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, colour: tuple[int, int, int]) -> None:
    draw.polygon([(x, y - r), (x - r, y + 0.8 * r), (x + r, y + 0.8 * r)], fill=(*colour, 255), outline=(*INK, 255))


def _cross(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, colour: tuple[int, int, int]) -> None:
    for ink, width in ((INK, 0.9 * r), (colour, 0.5 * r)):
        draw.line((x - r, y - r, x + r, y + r), fill=(*ink, 255), width=round(width))
        draw.line((x - r, y + r, x + r, y - r), fill=(*ink, 255), width=round(width))


def _diamond(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, colour: tuple[int, int, int]) -> None:
    draw.polygon([(x, y - r), (x + r, y), (x, y + r), (x - r, y)], fill=(*colour, 255), outline=(*INK, 255))


MARKERS = (
    (KILL_EVENTS, _triangle, KILL, "kill"),
    (COMBAT_DEATH_EVENTS, _cross, DEATH, "death"),
    (EVENT_GROUPS["storm_death"], _diamond, STORM, "storm death"),
)


def draw_samples(minimap: Image.Image, cfg: MapConfig, part: pd.DataFrame, orientation: Orientation, with_markers: bool) -> Image.Image:
    """The dimmed minimap with bot samples, human samples and (optionally) event markers on top."""
    base = Image.blend(minimap, Image.new("RGB", minimap.size, INK), MAP_DIM).convert("RGBA")
    layer = Image.new("RGBA", (minimap.width * SUPERSAMPLE, minimap.height * SUPERSAMPLE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    radius = minimap.width / 1000 * SUPERSAMPLE
    for event, colour in (("BotPosition", BOT), ("Position", HUMAN)):
        _dots(draw, *to_pixels(cfg, part[part["event"] == event], minimap.size, orientation), radius, colour, 150)
    if with_markers:
        for events, shape, colour, _ in MARKERS:
            px, py = to_pixels(cfg, part[part["event"].isin(events)], minimap.size, orientation)
            for x, y in zip(px * SUPERSAMPLE, py * SUPERSAMPLE):
                shape(draw, x, y, 3 * radius, colour)
    return Image.alpha_composite(base, layer.resize(minimap.size, Image.Resampling.LANCZOS)).convert("RGB")


def overlay(minimap: Image.Image, cfg: MapConfig, part: pd.DataFrame) -> Image.Image:
    """Proof image for one map: README transform, legend and counts underneath."""
    picture = draw_samples(minimap, cfg, part, README_ORIENTATION, with_markers=True)
    u, v = world_to_uv(cfg.map_id, part["x"].to_numpy(np.float64), part["z"].to_numpy(np.float64))
    outside = int(((u < 0) | (u > 1) | (v < 0) | (v > 1)).sum())
    counts = part["event"].value_counts()
    legend = [
        (HUMAN, f"human samples {counts.get('Position', 0):,}"),
        (BOT, f"bot samples {counts.get('BotPosition', 0):,}"),
        *((colour, f"{name} {int(counts.reindex(list(events)).sum()):,}") for events, _, colour, name in MARKERS),
    ]
    footer = 76
    sheet = Image.new("RGB", (picture.width, picture.height + footer), INK)
    sheet.paste(picture, (0, 0))
    draw = ImageDraw.Draw(sheet)
    font, small = ImageFont.load_default(size=20), ImageFont.load_default(size=16)
    x, y = 16, picture.height + 12
    for colour, text in legend:
        draw.rectangle((x, y + 4, x + 16, y + 20), fill=colour)
        draw.text((x + 24, y), text, fill=PAPER, font=font)
        x += 40 + draw.textlength(text, font=font)
    caption = (
        f"{cfg.map_id}: u = (x - ({cfg.origin_x:g})) / {cfg.scale:g}, v = (z - ({cfg.origin_z:g})) / {cfg.scale:g}, "
        f"pixel = (u * width, (1 - v) * height). {outside} of {len(part):,} rows fall outside the image."
    )
    draw.text((16, y + 34), caption, fill=PAPER, font=small)
    return sheet


def orientation_sheet(minimap: Image.Image, cfg: MapConfig, movement: pd.DataFrame, shares: dict[Orientation, float]) -> Image.Image:
    """All eight orientations side by side, each labelled with its share of samples on black."""
    panel_height = round(PANEL_WIDTH * minimap.height / minimap.width)
    small = minimap.resize((PANEL_WIDTH, panel_height), Image.Resampling.LANCZOS)
    label_height, gap = 46, 8
    sheet = Image.new("RGB", (4 * PANEL_WIDTH + 5 * gap, 2 * (panel_height + label_height) + 3 * gap), INK)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=17)
    for index, orientation in enumerate(ORIENTATIONS):
        left = gap + (index % 4) * (PANEL_WIDTH + gap)
        top = gap + (index // 4) * (panel_height + label_height + gap)
        sheet.paste(draw_samples(small, cfg, movement, orientation, with_markers=False), (left, top))
        name = orientation.label + ("  (README)" if orientation.is_readme else "")
        colour = ACCENT if orientation.is_readme else PAPER
        draw.text((left + 4, top + panel_height + 3), name, fill=colour, font=font)
        draw.text((left + 4, top + panel_height + 23), f"{shares[orientation]:.2%} of samples off the map", fill=colour, font=font)
        if orientation.is_readme:
            draw.rectangle((left - 3, top - 3, left + PANEL_WIDTH + 2, top + panel_height + 2), outline=ACCENT, width=3)
    return sheet


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--raw", type=Path, default=Path("data/raw/player_data"), help="the unzipped player_data folder")
    parser.add_argument("--out", type=Path, default=Path("docs/img"), help="folder for the proof images")
    report_default = Path("docs/profile/orientation_check.json")
    parser.add_argument("--report", type=Path, default=report_default, help="where to write the orientation numbers")
    args = parser.parse_args()

    rows = load_raw(args.raw).rows
    args.out.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    report = {}
    for map_id, cfg in MAPS.items():
        part = rows[rows["map_id"] == map_id]
        movement = part[part["event"].isin(MOVEMENT_EVENTS)]
        minimap = load_minimap(args.raw / "minimaps" / cfg.minimap_file, OVERLAY_WIDTH)
        surround = black_surround(minimap)
        shares = {o: share_off_map(surround, *to_pixels(cfg, movement, minimap.size, o)) for o in ORIENTATIONS}
        overlay(minimap, cfg, part).save(args.out / f"overlay_{map_id}.jpg", quality=90, subsampling=0, optimize=True)
        sheet = orientation_sheet(minimap, cfg, movement, shares)
        sheet.save(args.out / f"orientation_{map_id}.jpg", quality=88, subsampling=0, optimize=True)
        report[map_id] = {
            "movement_samples": len(movement),
            "black_surround_share_of_image": round(float(surround.mean()), 4),
            "share_of_samples_off_the_map": [
                {"orientation": o.label, "readme": o.is_readme, "share": round(share, 4)} for o, share in shares.items()
            ],
        }
        impostor = min(share for o, share in shares.items() if not o.is_readme)
        readme = shares[README_ORIENTATION]
        print(f"{map_id}: README orientation {readme:.2%} of samples off the map; best wrong orientation {impostor:.2%}")
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(f"images in {args.out}/, numbers in {args.report}")


if __name__ == "__main__":
    main()
