// Minimal, dependency-free Markdown -> HTML renderer for the small subset of
// Markdown used by our own (trusted) wiki pages. All text is HTML-escaped first,
// so the only HTML produced is what these transforms emit.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(text: string): string {
  let out = escapeHtml(text);
  // inline code
  out = out.replace(/`([^`]+)`/g, '<code class="rounded bg-white/10 px-1 py-0.5 text-[0.85em]">$1</code>');
  // links [text](url) — only http(s) and in-page anchors
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|#[^)\s]+)\)/g, (_m, t, href) => {
    const ext = href.startsWith("http");
    const attrs = ext ? ' target="_blank" rel="noreferrer noopener"' : "";
    return `<a href="${href}"${attrs} class="text-indigo-300 underline decoration-dotted hover:text-indigo-200">${t}</a>`;
  });
  // bold then italic
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return out;
}

// Render a Markdown string to a sanitized HTML string.
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      closeList();
      i++;
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      closeList();
      html.push('<hr class="my-4 border-white/10" />');
      i++;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const sizes = ["text-2xl", "text-xl", "text-lg", "text-base"];
      html.push(`<h${level} class="${sizes[level - 1]} mt-4 mb-2 font-bold">${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(trimmed);
    const ol = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (ul || ol) {
      const want = ul ? "ul" : "ol";
      if (listType !== want) {
        closeList();
        listType = want;
        const cls = want === "ul" ? "list-disc" : "list-decimal";
        html.push(`<${want} class="${cls} ml-5 space-y-1 my-2">`);
      }
      html.push(`<li>${inline((ul ?? ol)![1])}</li>`);
      i++;
      continue;
    }
    if (trimmed.startsWith(">")) {
      closeList();
      html.push(`<blockquote class="border-l-2 border-white/20 pl-3 my-2 text-white/70">${inline(trimmed.replace(/^>\s?/, ""))}</blockquote>`);
      i++;
      continue;
    }
    // paragraph (gather consecutive non-empty, non-special lines)
    closeList();
    const para: string[] = [trimmed];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,4}\s|[-*]\s|\d+\.\s|>|---+$)/.test(lines[i].trim())) {
      para.push(lines[i].trim());
      i++;
    }
    html.push(`<p class="my-2 leading-relaxed text-white/85">${inline(para.join(" "))}</p>`);
  }
  closeList();
  return html.join("\n");
}
