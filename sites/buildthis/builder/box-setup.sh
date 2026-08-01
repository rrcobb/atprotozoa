#!/usr/bin/env bash
# box-setup.sh — one-time provisioning for the buildthis builder box.
#
# The buildthis bot's builds run here instead of on a GitHub Actions runner, so
# the bot stays up when Rob's laptop is off (a laptop is the wrong host for an
# always-on bot). This script turns a fresh Ubuntu VPS (Hetzner CX-class, ~4GB is
# plenty — the work is git + node + `claude -p`, not compute) into a builder.
#
# Run ONCE, as a sudo-capable user, after the VPS exists:
#   scp this + box-build.sh to the box, then:  bash box-setup.sh
#
# It is idempotent — safe to re-run to pick up a newer node / claude-code.
#
# It does NOT put any secrets on the box. Those go in /etc/buildthis/env (see the
# end of this script for the template); you fill that in by hand once.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/rrcobb/atprotozoa.git}"
CHECKOUT="${CHECKOUT:-/opt/atprotozoa}"
NODE_MAJOR="${NODE_MAJOR:-22}"
BUILDER_USER="${BUILDER_USER:-builder}"

echo "=== apt deps ==="
sudo apt-get update -y
# jq: the poll loop parses job JSON with it. file: the build sniffs downloaded
# thread images by mime type (usually already present, named so it stays true).
# curl/git/ca-certificates: the rest.
sudo apt-get install -y git curl ca-certificates jq file

echo "=== node ${NODE_MAJOR} (nodesource) ==="
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "=== pnpm + claude-code + wrangler (global) ==="
sudo npm install -g pnpm @anthropic-ai/claude-code wrangler

echo "=== clone/refresh the repo at ${CHECKOUT} ==="
if [ ! -d "$CHECKOUT/.git" ]; then
  sudo git clone "$REPO_URL" "$CHECKOUT"
fi

echo "=== unprivileged 'builder' user runs the builds ==="
# `claude -p --permission-mode bypassPermissions` REFUSES to run as root (a
# safety guard), and running an unattended agent as root is the wrong idea
# anyway. So builds run as this dedicated unprivileged user, which owns the
# checkout. It needs nothing but its own home + the checkout + read of the env.
if ! id "$BUILDER_USER" >/dev/null 2>&1; then
  sudo useradd -m -s /bin/bash "$BUILDER_USER"
fi
sudo chown -R "$BUILDER_USER":"$BUILDER_USER" "$CHECKOUT"
sudo -u "$BUILDER_USER" git -C "$CHECKOUT" config user.name "buildthis"
sudo -u "$BUILDER_USER" git -C "$CHECKOUT" config user.email "buildthis@bisks.net"
# The push URL uses a PAT the same way the Action's checkout does (a PAT push
# fires deploy.yml; GITHUB_TOKEN would not). The token lives in /etc/buildthis/env
# as BUILDER_PAT and is injected at push time by box-build.sh, NOT baked into the
# remote here — so it never lands in git config on disk.

echo "=== install repo deps once (frozen), as builder ==="
sudo -u "$BUILDER_USER" bash -lc "cd '$CHECKOUT' && pnpm install --frozen-lockfile"

echo "=== secrets template at /etc/buildthis/env ==="
sudo mkdir -p /etc/buildthis
if [ ! -f /etc/buildthis/env ]; then
  sudo tee /etc/buildthis/env >/dev/null <<'ENVTEMPLATE'
# buildthis builder box secrets. Fill these in by hand. chmod 600, root-owned.
# NONE of these belong in git.
#
# Inference runs on Rob's Claude Code SUBSCRIPTION, not per-token API billing —
# that's the whole point of the persistent box. Auth is a headless OAuth token
# minted once by `claude setup-token` (an sk-ant-oat01-... string), set below as
# CLAUDE_CODE_OAUTH_TOKEN. Do NOT add an ANTHROPIC_API_KEY: it outranks the OAuth
# token and would silently switch to API billing (box-build.sh unsets it too).

# Claude Code subscription token (from `claude setup-token`). This IS the
# inference auth — headless, on Rob's plan.
CLAUDE_CODE_OAUTH_TOKEN=

# Repo-scoped PAT (Contents:write) so the build's push fires deploy.yml.
BUILDER_PAT=

# The bot's Bluesky app-password (the box posts its own replies).
BOT_IDENTIFIER=did:plc:wlj4p2kazhifag6w4nanjnee
BOT_APP_PASSWORD=

# Shared secret the box presents to POST buildthis.bisks.net/outcome, and the
# token it presents to pull jobs from the queue endpoint (added with the queue).
OUTCOME_SECRET=
QUEUE_TOKEN=
ENVTEMPLATE
  echo "  wrote template -> EDIT /etc/buildthis/env and fill in the blanks"
else
  echo "  /etc/buildthis/env already exists — left untouched"
fi
# The env holds secrets but the unprivileged builder must read it. Root-owned,
# group-readable by a dedicated group the builder is in (640) — not world-readable.
sudo groupadd -f buildthis-env
sudo usermod -aG buildthis-env "$BUILDER_USER"
sudo chown root:buildthis-env /etc/buildthis/env
sudo chmod 640 /etc/buildthis/env

echo "=== systemd service: the poll loop, as builder, restart on crash/reboot ==="
sudo tee /etc/systemd/system/buildthis-poll.service >/dev/null <<UNIT
[Unit]
Description=buildthis builder — poll the build queue and run builds
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${BUILDER_USER}
Group=${BUILDER_USER}
ExecStart=/bin/bash ${CHECKOUT}/sites/buildthis/builder/box-poll.sh
Restart=always
RestartSec=10
TimeoutStopSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable buildthis-poll >/dev/null 2>&1
echo "  service installed + enabled (start it after the env is filled in)"

echo
echo "=== done. next: ==="
echo "  1. Mint the subscription token:  sudo -u ${BUILDER_USER} claude setup-token"
echo "     (opens a URL to approve; prints an sk-ant-oat01-... token)"
echo "  2. sudo \$EDITOR /etc/buildthis/env   (paste the token as CLAUDE_CODE_OAUTH_TOKEN,"
echo "     plus BUILDER_PAT / BOT_APP_PASSWORD / OUTCOME_SECRET / QUEUE_TOKEN)"
echo "  3. start the builder:  sudo systemctl start buildthis-poll"
echo "     watch it:           journalctl -u buildthis-poll -f"
