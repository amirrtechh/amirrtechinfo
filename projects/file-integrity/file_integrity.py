#!/usr/bin/env python3
"""Compare local files with a saved SHA-256 baseline."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_handle:
        for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_manifest_outside(root: Path, manifest: Path) -> None:
    try:
        manifest.resolve().relative_to(root.resolve())
    except ValueError:
        return
    raise ValueError("save the manifest outside the directory being checked")


def collect_hashes(root: Path) -> dict[str, str]:
    if not root.is_dir():
        raise ValueError(f"directory not found: {root}")

    hashes = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink() or not path.is_file():
            continue
        relative_path = path.relative_to(root).as_posix()
        hashes[relative_path] = sha256_file(path)
    return hashes


def write_baseline(root: Path, manifest: Path) -> dict[str, object]:
    ensure_manifest_outside(root, manifest)
    hashes = collect_hashes(root)
    document = {"version": 1, "files": hashes}
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    return {"directory": str(root), "manifest": str(manifest), "files_saved": len(hashes)}


def read_baseline(manifest: Path) -> dict[str, str]:
    document = json.loads(manifest.read_text(encoding="utf-8"))
    if (
        not isinstance(document, dict)
        or document.get("version") != 1
        or not isinstance(document.get("files"), dict)
    ):
        raise ValueError("unsupported or invalid manifest format")

    files = document["files"]
    if not all(
        isinstance(name, str) and isinstance(digest, str)
        for name, digest in files.items()
    ):
        raise ValueError("manifest contains an invalid file entry")
    return files


def compare_directory(root: Path, manifest: Path) -> dict[str, object]:
    ensure_manifest_outside(root, manifest)
    baseline = read_baseline(manifest)
    current = collect_hashes(root)

    added = sorted(current.keys() - baseline.keys())
    missing = sorted(baseline.keys() - current.keys())
    changed = sorted(
        name for name in current.keys() & baseline.keys()
        if current[name] != baseline[name]
    )
    return {
        "directory": str(root),
        "manifest": str(manifest),
        "added": added,
        "changed": changed,
        "missing": missing,
        "unchanged": not (added or changed or missing),
    }


def print_report(report: dict[str, object]) -> None:
    print(f"Directory: {report['directory']}")
    if "files_saved" in report:
        print(f"Saved hashes for {report['files_saved']} files.")
        print(f"Manifest: {report['manifest']}")
        return

    print(f"Manifest: {report['manifest']}")
    if report["unchanged"]:
        print("No file changes found.")
        return

    for category in ("added", "changed", "missing"):
        names = report[category]
        if names:
            print(f"{category.title()}:")
            for name in names:
                print(f"  {name}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create or check a SHA-256 baseline for a local directory."
    )
    commands = parser.add_subparsers(dest="command", required=True)

    baseline = commands.add_parser("baseline", help="save a new trusted baseline")
    baseline.add_argument("directory", type=Path, help="directory to record")
    baseline.add_argument("--manifest", required=True, type=Path, help="output JSON path")
    baseline.add_argument("--json", action="store_true", help="print JSON output")

    check = commands.add_parser("check", help="compare files with a saved baseline")
    check.add_argument("directory", type=Path, help="directory to check")
    check.add_argument("--manifest", required=True, type=Path, help="baseline JSON path")
    check.add_argument("--json", action="store_true", help="print JSON output")

    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.directory.expanduser()
    manifest = args.manifest.expanduser()
    try:
        if args.command == "baseline":
            report = write_baseline(root, manifest)
        else:
            report = compare_directory(root, manifest)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"file-integrity: {error}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print_report(report)

    if args.command == "check" and not report["unchanged"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
