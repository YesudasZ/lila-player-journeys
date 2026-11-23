"""Profile the raw telemetry and write an evidence report.

    python -m pipeline.profile_data --raw data/raw/player_data --out docs/profile

Read-only on the data. Writes profile_report.json (every number, plus the exact
definition of each named metric) and profile_report.md (the same, readable).
docs/DATA_NOTES.md cites these files. Player and match ids are cut to their
first eight characters in the output.

This module is the command. The measuring is done by the modules of pipeline/profile/.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from pipeline.profile.render import render_markdown
from pipeline.profile.report import build_report


def main() -> None:
    """Write the two report files, then print how the README's claims hold against the data."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--raw", type=Path, default=Path("data/raw/player_data"), help="the unzipped player_data folder")
    parser.add_argument("--out", type=Path, default=Path("docs/profile"), help="folder for profile_report.json and .md")
    args = parser.parse_args()

    report = build_report(args.raw)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "profile_report.json").write_text(json.dumps(report, indent=2) + "\n")
    (args.out / "profile_report.md").write_text(render_markdown(report))
    metric_count = sum(len(t) for t in report["metrics"].values())
    print(f"{metric_count} metrics written to {args.out}/profile_report.json and .md")
    print("README claims against the data:")
    for check in report["readme_check"]:
        print(f"  {check['holds']:>6}  {check['claim']}")


if __name__ == "__main__":
    main()
