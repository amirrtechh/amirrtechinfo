#!/usr/bin/env python3
"""Inspect a URL for common warning signs without contacting the site."""

from __future__ import annotations

import argparse
import ipaddress
import json
import sys
from urllib.parse import urlsplit


def inspect_url(value: str) -> dict[str, object]:
    value = value.strip()
    if not value:
        raise ValueError("provide a URL or hostname")

    candidate = value if "://" in value else "https://" + value
    parts = urlsplit(candidate)
    scheme = parts.scheme.lower()
    if scheme not in {"http", "https"}:
        raise ValueError("only HTTP and HTTPS URLs are supported")

    hostname = parts.hostname
    if not hostname:
        raise ValueError("the URL must include a hostname")

    port = parts.port
    has_userinfo = parts.username is not None or parts.password is not None
    flags = []

    if scheme != "https":
        flags.append("The URL uses HTTP, so the connection would not be encrypted.")
    if has_userinfo:
        flags.append("The address contains a username or password before the host.")
    if any(ord(character) > 127 for character in hostname):
        flags.append("The hostname contains non-ASCII characters; check for lookalike letters.")

    ascii_hostname = hostname
    try:
        ascii_hostname = hostname.encode("idna").decode("ascii")
    except UnicodeError:
        flags.append("The hostname could not be converted to its ASCII form.")

    if any(label.startswith("xn--") for label in ascii_hostname.lower().split(".")):
        flags.append("The hostname uses an IDN punycode label; inspect its spelling carefully.")

    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        flags.append("The host is an IP address instead of a domain name.")

    if port is not None and port not in {80, 443}:
        flags.append(f"The URL uses the less common port {port}.")
    if hostname.count(".") >= 4:
        flags.append("The hostname has many subdomains; check which part is the actual domain.")
    if len(hostname) > 60:
        flags.append("The hostname is unusually long.")
    if len(candidate) > 200:
        flags.append("The full URL is unusually long.")

    return {
        "scheme": scheme,
        "hostname": hostname,
        "ascii_hostname": ascii_hostname,
        "port": port,
        "has_userinfo": has_userinfo,
        "has_path": bool(parts.path and parts.path != "/"),
        "has_query": bool(parts.query),
        "has_fragment": bool(parts.fragment),
        "indicators": flags,
        "network_requested": False,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check a URL for common warning signs without visiting it."
    )
    parser.add_argument("url", help="URL or hostname to inspect")
    parser.add_argument("--json", action="store_true", help="print JSON output")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        report = inspect_url(args.url)
    except (ValueError, UnicodeError) as error:
        print(f"url-clues: {error}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(report, indent=2))
        return 0

    print("URL clues (offline check)")
    print(f"Scheme: {report['scheme']}")
    print(f"Host: {report['hostname']}")
    if report["ascii_hostname"] != report["hostname"]:
        print(f"ASCII host: {report['ascii_hostname']}")
    if report["port"] is not None:
        print(f"Port: {report['port']}")
    print()

    if report["indicators"]:
        for indicator in report["indicators"]:
            print(f"[CHECK] {indicator}")
    else:
        print("No obvious clues found.")

    print()
    print("This is a heuristic check, not a safety verdict. No network request was made.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
