"""CLI: python -m lumiritin_verifier <licence_number> [--html saved_page.html]

Always prints one JSON object to stdout:
  {"outcome": "VERIFIED" | "NOT_FOUND" | "BLOCKED" | "PORTAL_ERROR",
   "record": {...} | null, "error": str | null, "html_sha256": str | null}

Exit codes: 0 verified, 2 not found, 3 blocked, 4 portal error.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from .client import PortalBlocked, PortalError, SacaaClient
from .parser import LicenceNotFound, parse_result_page

EXIT_CODES = {"VERIFIED": 0, "NOT_FOUND": 2, "BLOCKED": 3, "PORTAL_ERROR": 4}


def run(licence_number: str | None, html_path: str | None) -> dict:
    result = {"outcome": "PORTAL_ERROR", "record": None, "error": None, "html_sha256": None}
    try:
        if html_path:
            html = Path(html_path).read_text(encoding="utf-8")
        else:
            if not licence_number:
                raise PortalError("licence number required unless --html is given")
            html = SacaaClient.from_env().fetch(licence_number)
        result["html_sha256"] = hashlib.sha256(html.encode()).hexdigest()
        record = parse_result_page(html, requested_licence=licence_number)
        result["outcome"] = "VERIFIED"
        result["record"] = record.to_dict()
    except LicenceNotFound:
        result["outcome"] = "NOT_FOUND"
    except PortalBlocked as exc:
        result["outcome"] = "BLOCKED"
        result["error"] = str(exc)
    except (PortalError, OSError) as exc:
        result["error"] = str(exc)
    return result


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="lumiritin_verifier")
    ap.add_argument("licence_number", nargs="?")
    ap.add_argument("--html", help="parse a saved results page instead of querying the portal")
    args = ap.parse_args(argv)

    result = run(args.licence_number, args.html)
    json.dump(result, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return EXIT_CODES[result["outcome"]]


if __name__ == "__main__":
    sys.exit(main())
