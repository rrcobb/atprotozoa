#!/usr/bin/env bash
# Watch a Bluesky video from the terminal: download it, make a contact sheet
# of one frame per second, and print the cuts, so an agent that can look at an
# image can see what the video does.
#
# Usage:
#   audit/watch-video.sh <bsky.app post url | at:// uri> [outdir]
#
# Writes <outdir>/video.mp4, <outdir>/sheet.png (6 frames wide, 1 fps, scaled
# to 320px), <outdir>/sheet-2fps.png for short clips, and prints duration,
# resolution, and how many hard cuts ffmpeg's scene detector sees. Open the
# sheet with the Read tool. Needs ffmpeg and ffprobe (brew install ffmpeg).
#
# No audio transcription: nothing on this machine does speech-to-text as of
# 2026-09-17 (no whisper). If that changes, add it here.
#
# Why the master playlist isn't fetched directly: pulling it through ffmpeg
# with -c copy fails mid-stream on this CDN (ADTS parse errors on the audio
# track). Picking one rendition and dropping audio is reliable.
set -euo pipefail

input="${1:?post url or at:// uri}"
out="${2:-${TMPDIR:-/tmp}/watch-video}"
mkdir -p "$out"

PUB="https://public.api.bsky.app/xrpc"

if [[ "$input" == at://* ]]; then
  uri="$input"
else
  actor="$(sed -E 's#.*/profile/([^/]+)/post/.*#\1#' <<<"$input")"
  rkey="$(sed -E 's#.*/post/([^/?#]+).*#\1#' <<<"$input")"
  if [[ "$actor" != did:* ]]; then
    actor="$(curl -s "$PUB/com.atproto.identity.resolveHandle?handle=$actor" | python3 -c 'import json,sys;print(json.load(sys.stdin)["did"])')"
  fi
  uri="at://$actor/app.bsky.feed.post/$rkey"
fi

playlist="$(curl -s "$PUB/app.bsky.feed.getPosts?uris=$uri" | python3 -c '
import json,sys
p=json.load(sys.stdin)["posts"][0]
e=p.get("embed") or {}
if e.get("$type")=="app.bsky.embed.recordWithMedia#view": e=e.get("media") or {}
print(e.get("playlist",""))')"
[[ -n "$playlist" ]] || { echo "no video embed on $uri" >&2; exit 1; }

# Highest rendition listed in the master playlist.
rendition="$(curl -s "$playlist" | grep -v '^#' | grep m3u8 | tail -1)"
base="${playlist%/playlist.m3u8}"
src="$base/$rendition"

echo "downloading $src"
ffmpeg -loglevel error -y -i "$src" -vn -c:a copy "$out/audio.aac" 2>/dev/null || true
ffmpeg -loglevel error -y -i "$src" -an -c:v copy "$out/video.mp4"

ffprobe -v error -show_entries format=duration:stream=width,height -of default=nw=1 "$out/video.mp4"
cuts="$(ffmpeg -loglevel info -i "$out/video.mp4" -vf "select='gt(scene,0.3)',showinfo" -vsync vfr -f null - 2>&1 | grep -c pts_time || true)"
echo "hard cuts (scene>0.3): $cuts"

dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out/video.mp4" | cut -d. -f1)"
rows=$(( (dur + 5) / 6 ))
ffmpeg -loglevel error -y -i "$out/video.mp4" -vf "fps=1,scale=320:-1,tile=6x${rows}" -frames:v 1 "$out/sheet.png"
echo "sheet: $out/sheet.png  (1 fps, 6 per row, $rows rows)"
if (( dur <= 30 )); then
  rows2=$(( (dur * 2 + 5) / 6 ))
  ffmpeg -loglevel error -y -i "$out/video.mp4" -vf "fps=2,scale=320:-1,tile=6x${rows2}" -frames:v 1 "$out/sheet-2fps.png"
  echo "sheet: $out/sheet-2fps.png  (2 fps)"
fi
