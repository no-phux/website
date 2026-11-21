#!/usr/bin/env python3
"""Pin design files from public no-phux/phux by commit.

  phux-design.py check       every pinned file matches the lock (offline; CI gate)
  phux-design.py pin <rev>   fetch each file at <rev>, write it, update the lock

The lock is phux-design.lock.json at the repository root:
  {"rev": "<sha>", "files": {"<phux path>": {"dest": "<repo path>", "sha256": "..."}}}
"""
import hashlib
import json
import os
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCK = ROOT / "phux-design.lock.json"
RAW = "https://raw.githubusercontent.com/no-phux/phux/{rev}/{path}"


def write_atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    with os.fdopen(fd, "wb") as out:
        out.write(data)
    os.replace(tmp, path)


def check(lock):
    bad = []
    for src, entry in lock["files"].items():
        dest = ROOT / entry["dest"]
        if not dest.is_file():
            bad.append(f"{entry['dest']}: missing")
        elif hashlib.sha256(dest.read_bytes()).hexdigest() != entry["sha256"]:
            bad.append(f"{entry['dest']}: differs from phux {src} at {lock['rev'][:12]}")
    for line in bad:
        print(f"phux-design: {line}", file=sys.stderr)
    if bad:
        sys.exit("phux-design: run scripts/phux-design.py pin <rev> instead of editing pinned files")
    print(f"phux-design: {len(lock['files'])} file(s) match phux {lock['rev'][:12]}")


def pin(lock, rev):
    if not re.fullmatch(r"[0-9a-f]{40}", rev):
        sys.exit("phux-design: rev must be a full 40-character commit sha")
    fetched = {}
    for src in lock["files"]:
        with urllib.request.urlopen(RAW.format(rev=rev, path=src), timeout=60) as response:
            fetched[src] = response.read()
    for src, data in fetched.items():
        write_atomic(ROOT / lock["files"][src]["dest"], data)
        lock["files"][src]["sha256"] = hashlib.sha256(data).hexdigest()
    lock["rev"] = rev
    write_atomic(LOCK, (json.dumps(lock, indent=2) + "\n").encode())
    check(lock)


def main(argv):
    lock = json.loads(LOCK.read_text())
    if argv == ["check"]:
        check(lock)
    elif len(argv) == 2 and argv[0] == "pin":
        pin(lock, argv[1])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
