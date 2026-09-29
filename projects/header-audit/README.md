# Header Audit

I made this small Python tool while learning about web security. It checks a website's response for a few common security headers and explains what it found.

## Run it

You need Python 3.9 or newer. There are no extra packages to install.

~~~sh
python3 header_audit.py example.com
~~~

You can also pass a full URL, change the timeout, or print JSON:

~~~sh
python3 header_audit.py https://example.com --timeout 10
python3 header_audit.py example.com --json
~~~

## What it checks

- Strict-Transport-Security (when the final page uses HTTPS)
- Content-Security-Policy
- X-Content-Type-Options
- X-Frame-Options, or a Content-Security-Policy frame-ancestors rule
- Referrer-Policy
- Permissions-Policy

The tool checks whether each header is present. It does not decide whether a policy is well configured, crawl pages, or replace a proper security review. It uses a HEAD request and falls back to GET when the server does not support HEAD.

Only run it against websites you own or have permission to assess.
