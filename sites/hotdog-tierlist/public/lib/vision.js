// vision.js — loads CLIP (transformers.js) in the browser and reads toppings
// off post photos. Runs entirely on the visitor's device: the ~90MB model
// comes from the jsdelivr/huggingface CDNs and is cached by the browser, so
// the Worker does no inference and pays for nothing.
import { VISUAL_PROMPTS, GATE_PROMPTS, BASELINE_PROMPT, scoreImage } from "./vision-score.js";

const CDN = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
const MODEL = "Xenova/clip-vit-base-patch32";

let loading = null;

export function loadVision(onStatus = () => {}) {
  if (loading) return loading;
  loading = (async () => {
    onStatus("loading the photo model (one-time ~90MB download)…");
    const tf = await import(/* @vite-ignore */ CDN);
    tf.env.allowLocalModels = false;
    const [tokenizer, textModel, processor, visionModel] = await Promise.all([
      tf.AutoTokenizer.from_pretrained(MODEL),
      tf.CLIPTextModelWithProjection.from_pretrained(MODEL),
      tf.AutoProcessor.from_pretrained(MODEL),
      tf.CLIPVisionModelWithProjection.from_pretrained(MODEL),
    ]);
    const names = Object.keys(VISUAL_PROMPTS);
    const prompts = [...GATE_PROMPTS, BASELINE_PROMPT, ...names.map((n) => VISUAL_PROMPTS[n])];
    const inputs = tokenizer(prompts, { padding: true, truncation: true });
    const { text_embeds } = await textModel(inputs);
    const dim = text_embeds.dims[1];
    const row = (k) => Array.from(text_embeds.data.slice(k * dim, (k + 1) * dim));
    const text = {
      gate: GATE_PROMPTS.map((_, k) => row(k)),
      baseline: row(GATE_PROMPTS.length),
      toppings: Object.fromEntries(names.map((n, k) => [n, row(GATE_PROMPTS.length + 1 + k)])),
    };
    return { tf, processor, visionModel, text };
  })();
  loading.catch(() => (loading = null));
  return loading;
}

// -> {hotdog, toppings:[{name,p}]} or null if the image can't be fetched/read.
export async function readImage(url) {
  const { tf, processor, visionModel, text } = await loadVision();
  try {
    const image = await tf.RawImage.read(url);
    const { image_embeds } = await visionModel(await processor(image));
    return scoreImage(Array.from(image_embeds.data), text);
  } catch {
    return null;
  }
}
