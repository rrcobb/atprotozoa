// products.js — turns a reygallery-style exhibit (see ../../reygallery's
// gallery.js, copied in unmodified) into a gift-shop catalog: every work,
// times every kind of tchotchke, at a deterministic (hashed off the work's
// own link, not random) museum-store price ending in .99.

const PRODUCT_TYPES = [
  { key: "tote", name: "Tote Bag", tagline: "canvas, one size fits all conceptual frameworks", min: 28, max: 38 },
  { key: "mug", name: "Museum Mug", tagline: "dishwasher-safe reproduction; microwave at your own curatorial risk", min: 16, max: 22 },
  { key: "poster", name: "Exhibition Poster", tagline: "18×24in, frame not included (see: the other website)", min: 22, max: 34 },
  { key: "postcard", name: "Postcard", tagline: "for when a screenshot feels insufficiently tactile", min: 3, max: 6 },
  { key: "pin", name: "Enamel Pin", tagline: "1.25in, wearable provenance", min: 10, max: 15 },
];

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function priceFor(seed, type) {
  const spread = type.max - type.min;
  const dollars = type.min + (seed % (spread + 1));
  return Math.round((dollars + 0.99) * 100) / 100;
}

export function buildCatalog(exhibit) {
  const works = [];
  if (exhibit.selfPortrait) works.push(exhibit.selfPortrait);
  works.push(...exhibit.pieces);

  const catalog = [];
  works.forEach((work, wi) => {
    PRODUCT_TYPES.forEach((type) => {
      const seedKey = `${work.link}|${type.key}`;
      const seed = hashString(seedKey);
      catalog.push({
        id: `w${wi}-${type.key}`,
        typeKey: type.key,
        typeName: type.name,
        tagline: type.tagline,
        workTitle: work.title,
        workArtist: work.artist,
        workYear: work.year,
        workImage: work.thumb || work.image,
        sourceLink: work.link,
        price: priceFor(seed, type),
      });
    });
  });
  return catalog;
}
