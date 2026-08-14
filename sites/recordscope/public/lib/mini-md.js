// mini-md.js — a small, dependency-free markdown-to-HTML renderer.
// Not a spec-complete implementation, just enough for the kind of documents
// people paste into a PDS record: headers, bold/italic/code, blockquotes,
// lists, hr, and paragraphs with soft line breaks preserved (screenplay-style
// text leans on single newlines meaning something, unlike prose markdown).
(function (global) {
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  function mdToHtml(md) {
    const blocks = String(md || "").replace(/\r\n/g, "\n").split(/\n{2,}/);
    const out = [];
    for (const raw of blocks) {
      const block = raw.replace(/^\n+|\n+$/g, "");
      if (!block) continue;
      const lines = block.split("\n");

      const h = block.match(/^(#{1,6})\s+(.*)$/);
      if (h && lines.length === 1) {
        out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(block)) {
        out.push("<hr>");
        continue;
      }

      if (lines.every((l) => /^>\s?/.test(l))) {
        out.push(`<blockquote>${inline(lines.map((l) => l.replace(/^>\s?/, "")).join("\n"))}</blockquote>`);
        continue;
      }

      if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
        const ordered = /^\s*\d+\./.test(lines[0]);
        const tag = ordered ? "ol" : "ul";
        const items = lines.map((l) => `<li>${inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ""))}</li>`).join("");
        out.push(`<${tag}>${items}</${tag}>`);
        continue;
      }

      out.push(`<p>${inline(block).replace(/\n/g, "<br>")}</p>`);
    }
    return out.join("\n");
  }

  global.miniMarkdown = mdToHtml;
})(window);
