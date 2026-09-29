#!/usr/bin/env python3
"""Check common HTTP security headers on a site you are allowed to assess."""

from __future__ import annotations

import argparse
import json
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen


CHECKS = (
    (
        "Strict-Transport-Security",
        "HSTS",
        "Tells browsers to keep using HTTPS.",
    ),
    (
        "Content-Security-Policy",
        "Content Security Policy",
        "Helps limit which sources a page can load or execute.",
    ),
    (
        "X-Content-Type-Options",
        "MIME sniffing protection",
        "Prevents browsers from guessing a different content type.",
    ),
    (
        "X-Frame-Options",
        "Framing protection",
        "Helps prevent a page from being embedded in a frame.",
    ),
    (
        "Referrer-Policy",
        "Referrer policy",
        "Controls how much URL information is sent to other sites.",
    ),
    (
        "Permissions-Policy",
        "Permissions policy",
        "Restricts access to browser features such as camera and microphone.",
    ),
)


def normalize_url(value: str) -> str:
    """Accept a hostname or an HTTP(S) URL and return a normalized URL."""
    value = value.strip()
    if not value:
        raise ValueError("provide a hostname or an HTTP(S) URL")

    if "://" not in value:
        value = "https://" + value

    parts = urlsplit(value)
    if parts.scheme.lower() not in {"http", "https"}:
        raise ValueError("only HTTP and HTTPS URLs are supported")
    if not parts.hostname:
        raise ValueError("the URL must include a hostname")
    if parts.username or parts.password:
        raise ValueError("URLs containing usernames or passwords are not supported")

    # Accessing .port validates malformed port numbers before making a request.
    _ = parts.port
    return urlunsplit(
        (
            parts.scheme.lower(),
            parts.netloc,
            parts.path or "/",
            parts.query,
            "",
        )
    )


def request_headers(url: str, timeout: float) -> tuple[int, object, str]:
    """Read response headers with HEAD, falling back to GET when unsupported."""
    for method in ("HEAD", "GET"):
        request = Request(
            url,
            headers={"User-Agent": "HeaderAudit/1.0"},
            method=method,
        )
        try:
            response = urlopen(request, timeout=timeout)
            with response:
                result = (response.status, response.headers, response.geturl())
        except HTTPError as error:
            with error:
                result = (error.code, error.headers or {}, error.geturl())

        status, headers, final_url = result
        if method == "HEAD" and status in {405, 501}:
            continue
        return status, headers, final_url

    raise RuntimeError("the server did not accept either HEAD or GET")


def inspect_headers(headers: object, final_url: str) -> list[dict[str, str]]:
    """Report whether selected headers are present, without grading their values."""
    values = {name.lower(): value.strip() for name, value in headers.items()}
    final_scheme = urlsplit(final_url).scheme.lower()
    findings = []

    for header, label, purpose in CHECKS:
        if header == "Strict-Transport-Security" and final_scheme != "https":
            findings.append(
                {
                    "header": header,
                    "name": label,
                    "status": "not_applicable",
                    "value": "",
                    "purpose": purpose,
                }
            )
            continue

        value = values.get(header.lower(), "")
        if header == "X-Frame-Options":
            policy = values.get("content-security-policy", "")
            has_frame_ancestors = bool(
                re.search(r"(?:^|;)\s*frame-ancestors(?:\s|;|$)", policy, re.I)
            )
            if value:
                finding_value = value
            elif has_frame_ancestors:
                finding_value = "protected by Content-Security-Policy frame-ancestors"
            else:
                finding_value = ""
            present = bool(finding_value)
        else:
            finding_value = value
            present = bool(value)

        findings.append(
            {
                "header": header,
                "name": label,
                "status": "found" if present else "missing",
                "value": finding_value,
                "purpose": purpose,
            }
        )

    return findings


def make_report(url: str, timeout: float) -> dict[str, object]:
    status_code, headers, final_url = request_headers(url, timeout)
    return {
        "requested_url": url,
        "final_url": final_url,
        "status_code": status_code,
        "findings": inspect_headers(headers, final_url),
        "scope": "Presence check only; header values and the full application were not audited.",
    }


def print_report(report: dict[str, object]) -> None:
    print("HTTP security header review")
    print(f"Target: {report['final_url']}")
    print(f"HTTP status: {report['status_code']}")
    print()

    for finding in report["findings"]:
        status = finding["status"]
        if status == "not_applicable":
            marker = "SKIP"
            detail = "only applies to HTTPS"
        elif status == "found":
            marker = "FOUND"
            detail = finding["value"]
        else:
            marker = "MISSING"
            detail = finding["purpose"]

        print(f"[{marker}] {finding['name']}")
        if detail:
            print(f"        {detail}")

    print()
    print(report["scope"])
    print("Run this only against sites you own or have permission to assess.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check common HTTP security headers for one URL."
    )
    parser.add_argument("url", help="hostname or HTTP(S) URL to check")
    parser.add_argument(
        "--timeout",
        type=float,
        default=5.0,
        help="request timeout in seconds (default: 5)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="print the report as JSON",
    )
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be greater than zero")
    return args


def main() -> int:
    args = parse_args()
    try:
        url = normalize_url(args.url)
        report = make_report(url, args.timeout)
    except (ValueError, URLError, TimeoutError, OSError, RuntimeError) as error:
        print(f"header-audit: {error}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print_report(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
