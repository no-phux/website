#!/usr/bin/env python3
"""Check every retained public brand release against its pinned checksum."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import brand

root = Path(__file__).resolve().parents[1]
lock = brand.check(root)
release_root = root / "public/brand/releases"
index = json.loads((root / "public/brand/index.json").read_bytes())
if index.get("schema") != 1 or lock["version"] not in index["releases"]:
    raise SystemExit("brand kit: missing current release in public index")
for version, record in index["releases"].items():
    directory = release_root / version
    manifest, files = brand.read_bundle(directory / "phux-brand.zip", record["sha256"])
    if manifest["version"] != version or manifest["source_revision"] != record["source_revision"]:
        raise SystemExit(f"brand kit: release identity mismatch: {version}")
    expected = f"{record['sha256']}  phux-brand.zip\n"
    if (directory / "SHA256SUMS").read_text() != expected:
        raise SystemExit(f"brand kit: checksum file mismatch: {version}")
    if json.loads((directory / "manifest.json").read_bytes()) != manifest:
        raise SystemExit(f"brand kit: manifest mismatch: {version}")
if index["releases"][lock["version"]]["sha256"] != lock["sha256"]:
    raise SystemExit("brand kit: current archive does not match consumer pin")
print(f"brand kit: verified {len(index['releases'])} retained releases")
