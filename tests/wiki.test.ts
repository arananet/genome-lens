import { describe, expect, it } from "vitest";
import { loadGlossary } from "../src/wiki/glossary";
import { renderMarkdown } from "../src/wiki/markdown";

describe("glossary loader", () => {
  it("loads glossary pages with parsed front-matter", () => {
    const pages = loadGlossary();
    expect(pages.length).toBeGreaterThan(5);
    const terms = pages.map((p) => p.term);
    expect(terms).toContain("SNP");
    expect(terms).toContain("Evidence tiers");
    const snp = pages.find((p) => p.term === "SNP")!;
    expect(snp.category).toBe("core");
    expect(snp.body).not.toContain("---"); // front-matter stripped
  });
});

describe("markdown renderer", () => {
  it("renders headings, bold, lists, and links and escapes HTML", () => {
    const html = renderMarkdown("# Title\n\nSome **bold** text.\n\n- one\n- two\n");
    expect(html).toContain("<h1");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<ul");
    expect(html).toContain("<li>one</li>");
  });

  it("escapes raw HTML to prevent injection", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders safe links with external attributes", () => {
    const html = renderMarkdown("[dbSNP](https://www.ncbi.nlm.nih.gov)");
    expect(html).toContain('href="https://www.ncbi.nlm.nih.gov"');
    expect(html).toContain('rel="noreferrer noopener"');
  });
});
