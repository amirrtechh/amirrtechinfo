#!/usr/bin/env python3
"""Summarize common SSH login events from a local OpenSSH auth log."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path


FAILED_LOGIN = re.compile(
    r"\bFailed (?:password|publickey|keyboard-interactive/pam) for "
    r"(?:invalid user )?(?P<user>\S+) from (?P<ip>\S+)"
)
ACCEPTED_LOGIN = re.compile(
    r"\bAccepted (?:password|publickey|keyboard-interactive/pam) for "
    r"(?P<user>\S+) from (?P<ip>\S+)"
)


def summarize_log(path: Path, top: int) -> dict[str, object]:
    failed_ips: Counter[str] = Counter()
    failed_users: Counter[str] = Counter()
    accepted_users: Counter[str] = Counter()
    accepted_ips: Counter[str] = Counter()
    lines_read = 0
    failed_attempts = 0
    successful_logins = 0

    with path.open("r", encoding="utf-8", errors="replace") as log_file:
        for line in log_file:
            lines_read += 1
            failed = FAILED_LOGIN.search(line)
            if failed:
                failed_attempts += 1
                failed_ips[failed.group("ip")] += 1
                failed_users[failed.group("user")] += 1
                continue

            accepted = ACCEPTED_LOGIN.search(line)
            if accepted:
                successful_logins += 1
                accepted_users[accepted.group("user")] += 1
                accepted_ips[accepted.group("ip")] += 1

    return {
        "file": str(path),
        "lines_read": lines_read,
        "failed_attempts": failed_attempts,
        "successful_logins": successful_logins,
        "top_failed_ips": [
            {"ip": ip, "count": count}
            for ip, count in failed_ips.most_common(top)
        ],
        "top_targeted_users": [
            {"user": user, "count": count}
            for user, count in failed_users.most_common(top)
        ],
        "successful_users": [
            {"user": user, "count": count}
            for user, count in accepted_users.most_common(top)
        ],
        "successful_source_ips": [
            {"ip": ip, "count": count}
            for ip, count in accepted_ips.most_common(top)
        ],
    }


def print_summary(report: dict[str, object]) -> None:
    print("SSH login summary")
    print(f"File: {report['file']}")
    print(f"Lines read: {report['lines_read']}")
    print(f"Failed attempts: {report['failed_attempts']}")
    print(f"Successful logins: {report['successful_logins']}")

    for key, title, label in (
        ("top_failed_ips", "Most common failed-login IPs", "ip"),
        ("top_targeted_users", "Most targeted usernames", "user"),
        ("successful_users", "Usernames with successful logins", "user"),
        ("successful_source_ips", "IPs with successful logins", "ip"),
    ):
        print()
        print(f"{title}:")
        entries = report[key]
        if not entries:
            print("  none found")
            continue
        for entry in entries:
            print(f"  {entry[label]}: {entry['count']}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Summarize SSH login events in a local OpenSSH auth log."
    )
    parser.add_argument("log_file", type=Path, help="path to an auth log file")
    parser.add_argument(
        "--top",
        type=int,
        default=5,
        help="number of IPs or usernames to show in each list (default: 5)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="print the summary as JSON",
    )
    args = parser.parse_args()
    if args.top <= 0:
        parser.error("--top must be greater than zero")
    return args


def main() -> int:
    args = parse_args()
    try:
        report = summarize_log(args.log_file, args.top)
    except OSError as error:
        print(f"ssh-log-summary: {error}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print_summary(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
