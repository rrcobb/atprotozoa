# Media bots and lore bots, and how they fit together (2026-09-17)

Prompted by abeliansoup.bsky.social's hype video for astra
(`bsky.app/profile/abeliansoup.bsky.social/post/3mvq6hnzzxk2w`, "astra needs
you to lock in"). Watched via `audit/watch-video.sh`: 41 seconds, 720p, zero
hard cuts. It is not a chop-and-stutter YTP. It is a continuous 3D render: a
mannequin pushing a boulder up a ramp across a shifting collage of classical
paintings, one glowing word per beat drawn from astra's own text
("ADDITIONAL / INSTRUCTIONS / FROM / IDENTITIES / OTHER / CHATBOTS ...
APOLOGIZE / UNLESS / GENUINELY ... USER / EQUALS / FEEL / OBLIGATION /
SUBSERVIENT"), and a small talking head in the corner with a chat log
scrolling under it. Replies: "you actually did it", "this is art."

That shape matters. Kinetic typography over a persistent three.js scene is
something this repo already builds as pages (cobordism, everzoom, the
fluoddity family). The new part is rendering it to a file and posting it, not
the visuals.

## Two substrates, then the bots

Every idea below is a template on one of two things that don't exist yet.

**The media path.** On the box: gather sources, render frames (a headless
browser over a page, or ffmpeg from stills), encode, upload with
`app.bsky.video.uploadVideo` or `uploadBlob`. Screenshots are the first
product of this path and the cheapest. The box already dispatches jobs by
kind (listbot, 2026-09-17), so each media bot is a job kind, not a new
service.

**The lore index.** What happened, who's who, what the in-jokes mean. The raw
material already exists and is queryable: 600+ site blurbs and provenance
stamps, `net.bisks.buildthis.request` records, the bot's diary (`sidenote`),
the roast log (`receipts`), Constellation backlinks for who replied to and
quoted what, and the buildthis threads themselves. Nothing reads it as a
whole. The weekly digest reads a slice (what shipped, what broke).

The hype video needs both: the media path to exist at all, and the lore
index to know which moments in the week were the moments.

## Cost, which is the actual constraint

Three kinds, only one of them hard:

- **Rendering is nearly free.** Headless browser plus ffmpeg on the box is
  CPU minutes on hardware already paid for: a GIF of a page, a 45-second 720p
  render, TTS through a local voice, a beat rendered offline from a Tone.js
  page. None of it touches an API. Bound it with a queue and a per-day budget
  of box minutes.
- **Tokens scale with input, not output.** A weekly video is one model call
  to write an edit list against material people already picked. A librarian
  reading the whole scene is the expensive one. So: a cheap model for the
  bulk pass, a good one for synthesis, index once, re-read only the delta.
  Jetstream is the delta.
- **Third-party generation** (image and song APIs) is the only per-call
  dollar cost. Defer until the substrate makes it worth paying.

## The bots

### The librarian (lore, background)

Know Your Meme, TV Tropes, and Wikipedia for the scene, running on a cron and
never tagged. "Trending" counts; this traces. It reads the threads, the
sites, and the diary, follows links out to primary sources, and writes what
it learns as **records, not pages**: `net.bisks.lore.entry` in the bot's own
repo, one per term, joke, person, event, or site, with the explanation, the
sources, and links to the other entries and to the posts where it happened.

Records because then everything else is a read of the index: explainthis
renders the entries that match a thread, the digest and the weekly video ask
it what mattered, and other agents read it through `listRecords` and the
published lexicon, which is what makes the scene's lore tractable for a bot
that isn't ours. Constellation and Cerulea give it provenance for free: who
quoted whom first, where a phrase spread from, which thread a site came out
of. Its value compounds, which none of the other bots' does.

### explainthis (lore)

Not a one-line answer. An **illuminated** post or thread: the original text
inline, every term, reference, and in-joke glossed in the margin, each gloss
linked to where it comes from (the site, the earlier thread, the person, the
paper). Torah-commentary shape; Know Your Meme depth; the wiki the scene
doesn't have.

The repo has narrow versions of the page form already, none of them a bot:

- `footnoted`: theophite's ablation post, every term underlined and numbered,
  arrows to plain-English glosses linking the actual papers.
- `marginalia`: poems with commentary that unlocks as you read.
- `knowyourmuseum`: Know Your Meme with museum wall text per exhibit.
- `gastown`: a labeled illustration of a multi-agent lexicon.
- `lesslong`: the Sequences, one paragraph each.

Rob also points at one mino built; find the link before designing this.

What makes it a bot rather than another one-off page: the gloss source is the
lore index, so a term that came up in a July thread links to that thread, a
handle links to what that person has asked the bot for, and a site name links
to its blurb and its rating. Read-only, one model call plus lookups, cheap.
Output is a page (a 300-grapheme reply can't hold commentary), so it is a
build in the buildthis sense, but a templated one: one layout, new content.

Questions to settle first: same account or its own; whether it may gloss a
stranger's post (reading is fine, but the page quotes them in full);
how a gloss gets corrected when it is wrong about a person's own joke.

### The weekly hype video (media + lore)

Rob's framing, which is better than on-demand: **a finisher that charges up.**
People tag it during the week with moments, posts, sites, lines. At the end
of the week it unleashes one video built from everything it was handed, plus
what the lore index says mattered. Collaborative and social; never burns big
cycles on demand; can't be spammed into rendering.

- **Cadence:** one per week. The digest already posts Sunday 17:00 UTC with
  the week's text; this is the same week as media. Same cron family, or the
  digest post quotes it.
- **Charging:** a tag with a post, a site, or a line adds it to the week's
  material. The reply is an acknowledgement ("charged, N so far"), not a
  build. A mutual gate on who can charge it, same as buildthis.
- **Render:** kinetic typography over a persistent scene, the shape of the
  astra video. A three.js page that takes the week's material as JSON and
  plays it; the box screenshots frames at 30 fps over a headless browser and
  ffmpeg encodes. The page is also a site, so the video has a URL where it
  plays live and where the material is credited.
- **Music:** generated or licensed, never lifted. TTS of the week's lines
  through pitch and rate is the YTP flavor without clips.
- **Consent:** material is what people tagged in, from accounts that opted in
  by tagging. Faces and avatars only of people who charged it.
- **Limits:** check `uploadVideo`'s current size and length ceiling before
  fixing the format; a 45-second 720p render is the safe target.

### Animation bot (media)

The media path's first real product beyond screenshots: an animated version
of a site, or a short generative loop, rendered and posted. On its own it is
a demo; its job is to prove the render-and-upload path the weekly video needs,
on something with no stakes.

### Screenshots in replies (media)

Cheapest, and the one to do regardless. A headless browser on the box, one
capture of the live URL, `embed.images` on the reply. Also lets the builder
look at its own work before shipping. `buildthis-next.md` has the rest.

### Image generation (media)

Generated images in replies or as a site feature. Real per-call cost and a
content-safety surface. `sites/byok` answers cost for sites, not for bot
posts. A variant of the media path once it exists.

### Song bot (media)

Big wow, a third-party API with its own cost and terms, and Bluesky has no
audio embed, so a song ships inside a video. A variant of the weekly video's
music step, not a separate bot.

### Feed bot (protocol)

A feed per request (`protocol-object-bot.md`). Cool for the requester,
invisible to everyone else; the two feeds already published have zero
subscribers (`feeds-and-labels.md`). Listbot (`notes/88`) is the better form.

## Order

1. **Screenshots on the box.** Headless browser plus one capture. Every reply
   gets better, and it is the first step of the media path.
2. **The librarian, then explainthis as its first reader.** The index is the
   part with lasting value: the digest and the weekly video both read it.
3. **Animation bot,** to prove render-and-upload on something with no stakes.
4. **The weekly hype video,** on top of 1 through 3.
5. Image generation and song as variants, when cost has an answer.

## Watching video from a session

`audit/watch-video.sh <post url>` downloads a Bluesky video and writes a
contact sheet (one frame per second) an agent can read as an image, plus
duration, resolution, and a hard-cut count. No speech-to-text on this machine
yet; add it there when there is one.
