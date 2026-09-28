# Shellbay

Shellbay is a small SSH dashboard for Linux, built as a hands-on project around SSH and Linux administration. It keeps common connection tasks and command shortcuts in one place.

The app runs the system OpenSSH client on the computer where you start it. The browser is just the interface; host profiles are kept in that browser, while keys and SSH configuration stay on the Linux machine.

## Run it

You need Node.js 18 or newer, Python 3, and the OpenSSH client. From this directory:

```sh
npm install
chmod +x start.sh
./start.sh
```

Leave that terminal open while using Shellbay. It prints the local URL and a one-time pairing code. Open the URL and enter the code. To use a different port, run `PORT=8080 ./start.sh`.

## SSH sign-in

Shellbay uses `~/.ssh/config`, `~/.ssh/known_hosts`, your SSH agent, and configured identity files. Host-key checking stays enabled; verify a host's fingerprint before connecting. Password, key-passphrase, and verification-code prompts are available in a masked dialog when you open Shellbay on the same computer at `http://localhost:4173`. Other devices on the LAN use keys only because the web interface uses plain HTTP.

## What's here

- An interactive terminal with ANSI output, resizing, search, copy, and transcript download
- Saved host profiles and recent connection activity
- Theme, accent, font, scrollback, timeout, and keepalive settings
- More than 100 Linux and security command shortcuts; choose one to put it in the terminal, then review it before running

The terminal runs commands on the selected host with that SSH account's permissions. Shellbay is Linux-focused and doesn't currently include file transfer, port forwarding, screen sharing, or multi-user access. Keep it on a trusted private network; don't expose its HTTP port to the public internet.
