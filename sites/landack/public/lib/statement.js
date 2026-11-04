// Pure text-building for the land acknowledgement. No DOM, so tests can call it.
// It only ever states what the user typed in: nations, treaty status and
// actions are inputs, never guesses.

export function joinList(items) {
  const xs = items.map((s) => s.trim()).filter(Boolean);
  if (xs.length <= 1) return xs.join("");
  if (xs.length === 2) return xs[0] + " and " + xs[1];
  return xs.slice(0, -1).join(", ") + ", and " + xs[xs.length - 1];
}

// Split a free-text box on newlines / semicolons / commas into names.
export function parseNations(text) {
  return String(text || "")
    .split(/[\n;,]+/)
    .map((s) => s.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
}

// opts: { place, nations[], status: "unknown"|"unceded"|"treaty"|"ceded",
//         treaty, timeImmemorial, enslaved, action, format: "full"|"spoken"|"line" }
export function buildStatement(opts) {
  const place = (opts.place || "").trim();
  const nations = (opts.nations || []).map((s) => s.trim()).filter(Boolean);
  if (!nations.length) return "";
  const list = joinList(nations);
  const plural = nations.length > 1;
  const where = place ? place : "this place";
  const parts = [];

  parts.push(
    `I want to acknowledge that ${where} sits on the traditional and ancestral territory of the ${list}.`
  );

  if (opts.format === "line") {
    return `I acknowledge that ${where} is on the traditional territory of the ${list}.`;
  }

  if (opts.timeImmemorial) {
    parts.push(
      `${plural ? "These peoples have" : "This people has"} lived here and cared for this land since time immemorial, and ${plural ? "are" : "is"} still here today.`
    );
  } else {
    parts.push(`${plural ? "These nations are" : "This nation is"} still here today.`);
  }

  const treaty = (opts.treaty || "").trim();
  if (opts.status === "unceded") {
    parts.push("This land was never ceded; it is unceded territory.");
  } else if (opts.status === "treaty" && treaty) {
    parts.push(`This land is covered by ${treaty}, and its obligations are still in force.`);
  } else if (opts.status === "ceded") {
    parts.push(
      treaty
        ? `This land was taken through ${treaty}, an agreement made under pressure whose promises have often gone unkept.`
        : "This land was taken through agreements made under pressure, whose promises have often gone unkept."
    );
  }

  if (opts.enslaved) {
    parts.push(
      "I also acknowledge the people who were brought to this continent against their will and whose forced labour built much of what stands here."
    );
  }

  const action = (opts.action || "").trim();
  if (action && opts.format !== "spoken") {
    parts.push(action.endsWith(".") ? action : action + ".");
  }
  return parts.join(" ");
}

// Which statements of fact the page can't vouch for. Shown next to the output.
export function checklist(opts) {
  const warn = [];
  if (!(opts.nations || []).length) warn.push("Add at least one nation.");
  if (opts.status === "treaty" && !(opts.treaty || "").trim()) warn.push("Treaty status is set but no treaty is named, so that sentence is left out.");
  if (!(opts.action || "").trim()) warn.push("No commitment added. An acknowledgement with no action behind it is the part people criticise most.");
  return warn;
}
