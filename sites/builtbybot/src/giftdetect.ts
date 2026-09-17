// Gift-link detection — the whole factual basis for the label.
//
// COPIED, not imported, from sites/giftlinks/public/gift-index.js (the house
// rule, notes/10: no shared package across sites). The rules below are the
// same ones giftlinks has been running in the browser; keeping them as a
// separate file with its own tests is the concession to the fact that this
// copy now underwrites a public claim about someone else's post, so being
// wrong here is more expensive than being wrong on a page that just lists
// links.
//
// What a match MEANS, stated precisely because the label repeats it: the URL
// carries a publisher's unlock token. Not "this article is free", not "this
// link works" — tokens expire, and nothing here checks whether one is still
// live. See /policy.

export interface GiftSource {
  key: string;
  name: string;
  domains: string[];
  match: (url: URL) => boolean;
}

// Several publishers use an ad-hoc `gift`-ish query param rather than a
// documented one, so this is a deliberately loose check applied ONLY to hosts
// already on the list below — never to the open web.
function hasGiftParam(url: URL): boolean {
  for (const [key, value] of url.searchParams) {
    if (/gift/i.test(key) || /gift/i.test(value)) return true;
  }
  return false;
}

export const GIFT_SOURCES: GiftSource[] = [
  { key: "nyt", name: "The New York Times", domains: ["nytimes.com", "nyti.ms"], match: (url) => url.searchParams.has("unlocked_article_code") },
  { key: "wsj", name: "The Wall Street Journal", domains: ["wsj.com"], match: (url) => url.searchParams.has("st") },
  // wapo.st is the Post's gift-link shortener specifically, so the host alone
  // is the signal. Note this is the one source with no token visible in the
  // URL — the token is behind the redirect.
  { key: "wapo", name: "The Washington Post", domains: ["wapo.st"], match: () => true },
  { key: "athletic", name: "The Athletic", domains: ["theathletic.com"], match: (url) => url.searchParams.has("unlocked_article_code") || hasGiftParam(url) },
  { key: "atlantic", name: "The Atlantic", domains: ["theatlantic.com"], match: hasGiftParam },
  { key: "bloomberg", name: "Bloomberg", domains: ["bloomberg.com"], match: hasGiftParam },
  { key: "economist", name: "The Economist", domains: ["economist.com"], match: hasGiftParam },
  { key: "ft", name: "Financial Times", domains: ["ft.com"], match: hasGiftParam },
  { key: "newyorker", name: "The New Yorker", domains: ["newyorker.com"], match: hasGiftParam },
  { key: "latimes", name: "Los Angeles Times", domains: ["latimes.com"], match: hasGiftParam },
  { key: "businessinsider", name: "Business Insider", domains: ["businessinsider.com"], match: hasGiftParam },
];

// Exact host or a subdomain of it — never a suffix match on the raw string,
// which would make `notnytimes.com` look like `nytimes.com`.
function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function detectGiftSource(rawUrl: string): GiftSource | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return (
    GIFT_SOURCES.find(
      (source) => source.domains.some((domain) => hostMatches(url.hostname, domain)) && source.match(url),
    ) || null
  );
}

// Every URL a post points at: the external embed card plus every link facet.
// giftlinks' browser index only reads the embed card, which is right for a
// page that wants a thumbnail and a title. A labeler shouldn't miss a gift
// link because the author pasted it inline instead of letting the card
// attach, so this looks at both.
export function postLinkUrls(record: unknown): string[] {
  const rec = record as {
    embed?: { $type?: string; external?: { uri?: string }; media?: { $type?: string; external?: { uri?: string } } };
    facets?: { features?: { $type?: string; uri?: string }[] }[];
  };
  const out: string[] = [];

  const embed = rec?.embed;
  const external =
    embed?.$type === "app.bsky.embed.external"
      ? embed.external
      : embed?.$type === "app.bsky.embed.recordWithMedia" && embed.media?.$type === "app.bsky.embed.external"
        ? embed.media.external
        : null;
  if (external?.uri) out.push(external.uri);

  for (const facet of rec?.facets || []) {
    for (const feature of facet?.features || []) {
      if (feature?.$type === "app.bsky.richtext.facet#link" && typeof feature.uri === "string") {
        out.push(feature.uri);
      }
    }
  }
  return out;
}

// The one question the labeler asks of a post. Returns the matching source, or
// null — first match wins, since the label says "carried an unlock token", not
// "carried N of them".
export function detectInPost(record: unknown): GiftSource | null {
  for (const url of postLinkUrls(record)) {
    const source = detectGiftSource(url);
    if (source) return source;
  }
  return null;
}
