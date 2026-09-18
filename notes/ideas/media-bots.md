# Media bots, ranked (Rob and the coordinator, 2026-09-17)

Prompted by abeliansoup.bsky.social's YTP hype video for astra
(`bsky.app/profile/abeliansoup.bsky.social/post/3mvq6hnzzxk2w`, "astra needs
you to lock in", 1080p, replies of "you actually did it" and "this is art").
Nothing in this repo posts media. Every bot below would be the first.

Ranking rule: how surprising the output is in the feed, times how much it
reads as the bot's own voice, divided by cost and risk. Media beats protocol
objects on that scale because a page behind a link is what people already
expect.

## 1. YTP hype video bot

Tag it on a person or thread; get a ~30s chaos edit about them: avatar and
post images zoom-punched and stuttered, their own posts read by TTS and
pitch-bent, caption slams, a beat. Autoplays in the feed, is about one
specific person, is shareable.

- **Sequence, don't generate.** A library of ffmpeg filtergraph templates
  built once (stutter loop, reverse, zoom burst, chromatic flash, caption
  slam, speed ramp). The model writes an edit list against the source
  material; ffmpeg renders it on the box. No video model.
- **Source material:** the target's avatar, images from their recent posts,
  their post text through TTS, a music bed that is generated or licensed.
  Never lifted clips or music.
- **Consent:** target is the requester, or a mutual who asked for it in the
  thread. Not strangers. This is the one bot idea where "wrong target" is a
  real harm, not a bad build.
- **Cap:** one per person per week, a small daily total. Rendering is CPU
  minutes on the box, cheap; the cap is about not flooding the feed.
- **Upload:** `app.bsky.video.uploadVideo` via the service-auth flow with the
  bot's app password; check the current size and length limits before
  designing the output.

## 2. Animation bot

Same pipeline without the chaos, and the substrate #1 needs: render frames on
the box (canvas via a headless browser, or ffmpeg from stills), encode,
upload. Build first, on something small like an animated version of a site
the bot already shipped. Less wow alone; it proves the media path.

## 3. Image bot

Two flavors. Screenshots of what it built cost nothing once the box has a
headless browser and improve every reply; do these regardless
(`buildthis-next.md`, "Images"). Generated images cost per call and carry the
content-safety surface; `sites/byok` answers cost for sites, not for bot
posts.

## 4. Song bot (Suno or similar)

Big wow, but a third-party API with its own cost and terms, and Bluesky has
no audio embed, so a song ships as a video anyway. A variant of #1 once the
video path exists, not a separate bot.

## 5. Feed bot

A protocol object per request (`protocol-object-bot.md`). Cool for the
person who asked, invisible to everyone else; the two feeds already published
have zero subscribers (`feeds-and-labels.md`). Listbot (`notes/88`) is the
better version of this idea.

## 6. explainthis

Useful, cheap, low surprise (`buildthis-next.md`). Worth having, not worth
leading with.

## The shared substrate

One media path on the box: gather sources, render, encode, upload. The box
already dispatches jobs by kind (2026-09-17, listbot), so each bot is a
template on that path. Order that reaches the hype video soonest: #2, then
#1, then #4 and #3 as variants.
