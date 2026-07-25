// videopost.js — upload a recorded clip through Bluesky's video pipeline and
// fire a post carrying it. Writes go to the user's own PDS (record creation) and
// to the separate video-processing service (upload + transcode), the same two
// hops the official app uses:
//
//   1. com.atproto.server.getServiceAuth on the user's PDS — mints a short-lived
//      token scoped to app.bsky.video.uploadVideo, audienced to the video service.
//   2. POST the raw clip bytes to video.bsky.app with that token. Response is a
//      job you poll until it's done, which gives back a blob ref.
//   3. com.atproto.repo.createRecord with an app.bsky.embed.video embed carrying
//      that blob ref.
//
// Copy of trigrams/public/lib/post.js's createRecord shape, extended for video
// instead of images.

import { dpopFetch } from "./oauth.js";

const VIDEO_SERVICE = "https://video.bsky.app";
const VIDEO_SERVICE_DID = "did:web:video.bsky.app";

function pdsXrpc(session, method) {
  return `${session.pdsUrl.replace(/\/$/, "")}/xrpc/${method}`;
}

async function getServiceAuthToken(session, lxm) {
  const url = new URL(pdsXrpc(session, "com.atproto.server.getServiceAuth"));
  url.searchParams.set("aud", VIDEO_SERVICE_DID);
  url.searchParams.set("lxm", lxm);
  url.searchParams.set("exp", String(Math.floor(Date.now() / 1000) + 5 * 60));
  const res = await dpopFetch(session, url.toString());
  if (!res.ok) {
    throw new Error(
      `couldn't get a video upload token (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
  const j = await res.json();
  return j.token;
}

async function pollJob(jobId, onStep, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(
      `${VIDEO_SERVICE}/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(jobId)}`,
    );
    if (res.ok) {
      const { jobStatus } = await res.json();
      if (jobStatus?.state === "JOB_STATE_COMPLETED" && jobStatus.blob) {
        return jobStatus.blob;
      }
      if (jobStatus?.state === "JOB_STATE_FAILED") {
        throw new Error(jobStatus.error || "video processing failed");
      }
      onStep?.(
        jobStatus?.progress != null
          ? `processing video… ${jobStatus.progress}%`
          : "processing video…",
      );
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("timed out waiting for video processing");
}

// Upload a clip and wait for it to finish transcoding. `bytes` is a
// Uint8Array of the recorded blob (whatever container MediaRecorder produced —
// the service transcodes it). Returns the blob ref to embed.
export async function uploadVideo(session, bytes, filename, onStep) {
  onStep?.("requesting upload token…");
  const token = await getServiceAuthToken(session, "app.bsky.video.uploadVideo");

  onStep?.("uploading clip…");
  const uploadUrl = new URL(`${VIDEO_SERVICE}/xrpc/app.bsky.video.uploadVideo`);
  uploadUrl.searchParams.set("did", session.did);
  uploadUrl.searchParams.set("name", filename || "mootdrone.webm");
  const res = await fetch(uploadUrl.toString(), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "video/webm" },
    body: bytes,
  });
  // 409 = a job for this exact upload is already running; it still carries a jobId.
  if (!res.ok && res.status !== 409) {
    throw new Error(`video upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const job = await res.json();
  if (!job.jobId) throw new Error("upload response had no jobId");

  onStep?.("processing video…");
  return pollJob(job.jobId, onStep);
}

// Create a post carrying the uploaded video. `videoBlob` is the blob ref
// returned by uploadVideo.
export async function firePostWithVideo(session, { text, videoBlob, alt, aspectRatio }) {
  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
    embed: {
      $type: "app.bsky.embed.video",
      video: videoBlob,
      alt: alt || text,
      ...(aspectRatio ? { aspectRatio } : {}),
    },
  };

  const res = await dpopFetch(session, pdsXrpc(session, "com.atproto.repo.createRecord"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record }),
  });
  if (!res.ok) {
    throw new Error(`createRecord failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return res.json(); // { uri, cid }
}
