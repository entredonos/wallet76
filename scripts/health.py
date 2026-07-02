#!/usr/bin/env python3
"""
Wallet76 — Health Check Script
Runs before each dev session to detect null bytes, truncations and encoding issues.

Usage:
    python scripts/health.py
    python scripts/health.py --fix    # auto-strip null bytes
"""

import os
import sys
import argparse
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).parent.parent

# File patterns to check
EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".md"}

# Directories to skip
SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", ".pytest_cache",
    "build", "dist", ".next", "venv", ".venv", "env",
}

# Minimum expected sizes for critical files (bytes)
CRITICAL_FILES = {
    "frontend/src/context/I18nContext.jsx":  50_000,
    "frontend/src/pages/Dashboard.jsx":      30_000,
    "frontend/src/pages/Analytics.jsx":      30_000,
    "frontend/src/App.js":                    3_000,
    "backend/routes/analytics.py":            8_000,
    "backend/server.py":                      2_000,
    "backend/core.py":                        2_000,
}

# JSX/Python file must end with a closing brace/keyword
MUST_END_WITH = {
    ".jsx": ["}", ");", "};", "};\n"],
    ".js":  ["}", ");", "};", "};\n"],
    ".py":  None,  # checked differently
}

# ── Colours ───────────────────────────────────────────────────────────────────

RED    = "\033[91m"
YELLOW = "\033[93m"
GREEN  = "\033[92m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):    print(f"  {GREEN}✓{RESET}  {msg}")
def warn(msg):  print(f"  {YELLOW}⚠{RESET}  {msg}")
def err(msg):   print(f"  {RED}✗{RESET}  {msg}")
def info(msg):  print(f"  {CYAN}·{RESET}  {msg}")

# ── Helpers ───────────────────────────────────────────────────────────────────

def collect_files():
    files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fname in filenames:
            if Path(fname).suffix in EXTENSIONS:
                files.append(Path(dirpath) / fname)
    return sorted(files)


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def check_null_bytes(path: Path, raw: bytes, fix: bool) -> bool:
    count = raw.count(b"\x00")
    if count == 0:
        return True
    if fix:
        cleaned = raw.replace(b"\x00", b"")
        path.write_bytes(cleaned)
        warn(f"[FIXED] {rel(path)} — removed {count} null byte(s)")
    else:
        err(f"{rel(path)} — {count} null byte(s) detected  →  run with --fix")
    return False


def check_encoding(path: Path, raw: bytes) -> bool:
    try:
        raw.decode("utf-8")
        return True
    except UnicodeDecodeError as e:
        err(f"{rel(path)} — invalid UTF-8 at byte {e.start}: {e.reason}")
        return False


def check_double_encoded_emdash(path: Path, raw: bytes, fix: bool) -> bool:
    bad = b"\xc3\xa2\xc2\x80\xc2\x94"  # double-encoded —
    count = raw.count(bad)
    if count == 0:
        return True
    if fix:
        cleaned = raw.replace(bad, "—".encode("utf-8"))
        path.write_bytes(cleaned)
        warn(f"[FIXED] {rel(path)} — repaired {count} double-encoded em-dash(es)")
    else:
        warn(f"{rel(path)} — {count} double-encoded em-dash(es)  →  run with --fix")
    return False


def check_size(path: Path, raw: bytes) -> bool:
    key = rel(path).replace("\\", "/")
    min_size = CRITICAL_FILES.get(key)
    if min_size is None:
        return True
    size = len(raw)
    if size < min_size:
        err(f"{rel(path)} — only {size:,} bytes (expected ≥ {min_size:,}) — likely truncated!")
        return False
    return True


def check_jsx_closes(path: Path, text: str) -> bool:
    ext = path.suffix
    if ext not in MUST_END_WITH or MUST_END_WITH[ext] is None:
        return True
    # Skip config/plugin files that legitimately end with module.exports patterns
    skip_patterns = ["craco.config", "webpack", "plugin", "config.", "constants", "index.js"]
    if any(p in str(path) for p in skip_patterns):
        return True
    stripped = text.rstrip()
    valid_endings = ["}", ");", "};", "export default", "module.exports", "exports", ";"]
    if not any(stripped.endswith(e) for e in valid_endings):
        last = repr(stripped[-40:]) if len(stripped) > 40 else repr(stripped)
        err(f"{rel(path)} — suspicious ending (may be truncated): …{last}")
        return False
    return True


def check_python_closes(path: Path, text: str) -> bool:
    if path.suffix != ".py":
        return True
    # Empty __init__.py files are intentional
    if path.name == "__init__.py" and not text.strip():
        return True
    lines = text.splitlines()
    if not lines:
        # Empty non-init files are suspicious
        if path.name != "__init__.py":
            err(f"{rel(path)} — empty file")
            return False
        return True
    last_non_empty = ""
    for line in reversed(lines):
        if line.strip():
            last_non_empty = line
            break
    # Allow valid Python endings: docstrings, comments, pass, return values
    stripped_last = last_non_empty.strip()
    ok_endings = ('"""', "'''", "#", "pass", "return", ")", "]", "}", "0", "None", "True", "False")
    if stripped_last.endswith(ok_endings):
        return True
    # Red flag: clearly mid-expression
    suspicious = last_non_empty.endswith(("(", "\\", "+", "[", "{"))
    # Also flag ending mid-string (odd number of unescaped quotes on last line)
    if not suspicious and last_non_empty.count('"') % 2 != 0 and '"""' not in last_non_empty:
        suspicious = True
    if suspicious:
        err(f"{rel(path)} — ends suspiciously: {repr(last_non_empty[-60:])}")
        return False
    return True


def check_i18n_balance(path: Path, text: str) -> bool:
    """Verify all 6 language blocks exist in I18nContext."""
    if "I18nContext" not in path.name:
        return True
    # JS object keys don't need quotes; check for both forms
    required_patterns = [
        ("en", ['"en":', "en:"]),
        ("pt", ['"pt":', "pt:"]),
        ("fr", ['"fr":', "fr:"]),
        ("de", ['"de":', "de:"]),
        ("it", ['"it":', "it:"]),
        ("es", ['"es":', "es:"]),
    ]
    missing = []
    for lang, patterns in required_patterns:
        if not any(p in text for p in patterns):
            missing.append(lang)
    if missing:
        err(f"{rel(path)} — missing language blocks: {missing}")
        return False
    # Check bracket balance (allow some slack for JSX/template literals)
    opens  = text.count("{")
    closes = text.count("}")
    if abs(opens - closes) > 20:
        warn(f"{rel(path)} — large brace imbalance: {opens} open vs {closes} close — possible truncation")
        return False
    return True


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Wallet76 file health check")
    parser.add_argument("--fix", action="store_true", help="Auto-fix null bytes and encoding issues")
    parser.add_argument("--quiet", action="store_true", help="Only show problems")
    args = parser.parse_args()

    print(f"\n{BOLD}{'─'*60}{RESET}")
    print(f"{BOLD}  Wallet76 Health Check{RESET}{'  (--fix mode)' if args.fix else ''}")
    print(f"{BOLD}{'─'*60}{RESET}\n")

    files = collect_files()
    info(f"Scanning {len(files)} files in {ROOT}\n")

    errors   = 0
    warnings = 0
    checked  = 0

    # ── Per-file checks ───────────────────────────────────────────────────────
    print(f"{BOLD}File integrity{RESET}")
    for path in files:
        try:
            raw = path.read_bytes()
        except Exception as e:
            err(f"{rel(path)} — cannot read: {e}")
            errors += 1
            continue

        file_ok = True

        if not check_null_bytes(path, raw, args.fix):
            if not args.fix:
                errors += 1
            file_ok = False
            # Re-read after fix
            if args.fix:
                raw = path.read_bytes()

        if not check_double_encoded_emdash(path, raw, args.fix):
            if not args.fix:
                warnings += 1
            if args.fix:
                raw = path.read_bytes()

        if not check_encoding(path, raw):
            errors += 1
            file_ok = False
            continue  # Skip text checks if not valid UTF-8

        text = raw.decode("utf-8")

        if not check_size(path, raw):
            errors += 1
            file_ok = False

        if not check_jsx_closes(path, text):
            errors += 1
            file_ok = False

        if not check_python_closes(path, text):
            errors += 1
            file_ok = False

        if not check_i18n_balance(path, text):
            errors += 1
            file_ok = False

        checked += 1
        if file_ok and not args.quiet:
            pass  # Don't print OK for every file — too noisy

    # ── Critical file summary ────────────────────────────────────────────────
    print(f"\n{BOLD}Critical files{RESET}")
    all_critical_ok = True
    for key, min_size in CRITICAL_FILES.items():
        p = ROOT / key.replace("/", os.sep)
        if not p.exists():
            err(f"{key} — FILE MISSING")
            errors += 1
            all_critical_ok = False
        else:
            size = p.stat().st_size
            if size < min_size:
                err(f"{key} — {size:,} bytes (min {min_size:,}) — TRUNCATED")
                errors += 1
                all_critical_ok = False
            else:
                ok(f"{key} — {size:,} bytes")

    # ── Git status ───────────────────────────────────────────────────────────
    print(f"\n{BOLD}Git status{RESET}")
    try:
        import subprocess
        result = subprocess.run(
            ["git", "status", "--short"],
            cwd=ROOT, capture_output=True, text=True, timeout=5
        )
        changed = [l for l in result.stdout.splitlines() if l.strip()]
        if not changed:
            ok("Working tree clean")
        else:
            warn(f"{len(changed)} uncommitted change(s) — consider committing before starting work:")
            for line in changed[:10]:
                info(f"  {line}")
            if len(changed) > 10:
                info(f"  … and {len(changed)-10} more")
    except Exception as e:
        warn(f"Git check failed: {e}")

    # ── Summary ──────────────────────────────────────────────────────────────
    print(f"\n{BOLD}{'─'*60}{RESET}")
    if errors == 0 and warnings == 0:
        print(f"{GREEN}{BOLD}  ✓ All checks passed — {checked} files healthy{RESET}")
    elif errors == 0:
        print(f"{YELLOW}{BOLD}  ⚠ {warnings} warning(s) — run with --fix to repair{RESET}")
    else:
        print(f"{RED}{BOLD}  ✗ {errors} error(s), {warnings} warning(s) — fix before starting{RESET}")
        if not args.fix:
            print(f"{YELLOW}  Tip: run  python scripts/health.py --fix  to auto-repair null bytes{RESET}")
    print(f"{BOLD}{'─'*60}{RESET}\n")

    sys.exit(0 if errors == 0 else 1)


if __name__ == "__main__":
    main()
