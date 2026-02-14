// ============================================================
// Content Fetcher
// Gets source content from Lunary grimoire, URLs, or files
// ============================================================

import { readFile } from "fs/promises";

/**
 * Fetch a Lunary grimoire page and extract text content.
 * Tries the page URL and strips HTML to get raw text.
 */
export async function fetchGrimoirePage(path: string): Promise<string> {
  const baseUrl = process.env.LUNARY_BASE_URL || "https://lunary.app";
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;

  console.log(`📖 Fetching grimoire: ${url}`);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "LunaryPodcastBot/1.0",
      Accept: "text/html",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }

  const html = await res.text();
  return stripHtmlToText(html);
}

/**
 * Read content from a local file
 */
export async function readLocalFile(filePath: string): Promise<string> {
  console.log(`📖 Reading file: ${filePath}`);
  const content = await readFile(filePath, "utf-8");

  // If it's HTML, strip tags
  if (filePath.endsWith(".html") || filePath.endsWith(".htm")) {
    return stripHtmlToText(content);
  }

  return content;
}

/**
 * Fetch content from any URL
 */
export async function fetchUrl(url: string): Promise<string> {
  console.log(`📖 Fetching URL: ${url}`);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "LunaryPodcastBot/1.0",
      Accept: "text/html,text/plain",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  if (contentType.includes("text/html")) {
    return stripHtmlToText(text);
  }

  return text;
}

/**
 * Strip HTML tags and extract readable text content.
 * Handles both traditional HTML and Next.js RSC streaming pages.
 */
function stripHtmlToText(html: string): string {
  // First, try to extract content from JSON-LD structured data (works for
  // Next.js RSC pages where content is in Flight protocol, not HTML tags)
  const jsonLdContent = extractJsonLdContent(html);

  // Also try to extract text from Next.js RSC Flight chunks
  const rscContent = extractRscTextContent(html);

  // Fall back to traditional HTML stripping
  let text = html;

  // Remove script, style, nav, footer, header elements entirely
  text = text.replace(
    /<(script|style|nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,
    ""
  );

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Try to extract article or main content if available.
  // Prefer <article> over <main> since some frameworks put a loading
  // spinner in <main> while the real content is in <article>.
  const articleMatch = text.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = text.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const containerMatch = articleMatch && articleMatch[1].length > 200
    ? articleMatch
    : mainMatch && mainMatch[1].length > 200
      ? mainMatch
      : null;
  if (containerMatch) {
    text = containerMatch[1];
  }

  // Convert headings to text with newlines
  text = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, "\n\n$1\n\n");

  // Convert paragraphs and divs to newlines
  text = text.replace(/<\/?(p|div|br|li|tr)[^>]*>/gi, "\n");

  // Convert list items
  text = text.replace(/<li[^>]*>/gi, "\n- ");

  // Strip all remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2019;/g, "'")
    .replace(/&#x201C;/g, '"')
    .replace(/&#x201D;/g, '"');

  // Clean up whitespace
  text = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

  // Remove very short lines (likely UI fragments)
  text = text
    .split("\n")
    .filter((line) => line.length > 10 || line.startsWith("-"))
    .join("\n");

  const htmlText = text.trim();

  // Use the richest source of content
  const candidates = [jsonLdContent, rscContent, htmlText].filter(Boolean);
  return candidates.sort((a, b) => b.length - a.length)[0] || "";
}

/**
 * Extract article content from JSON-LD structured data.
 * Works for pages that embed Schema.org Article/FAQPage data.
 */
function extractJsonLdContent(html: string): string {
  const parts: string[] = [];

  // Match all JSON-LD script blocks
  const jsonLdBlocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  for (const match of jsonLdBlocks) {
    try {
      const data = JSON.parse(match[1]);
      extractJsonLdText(data, parts);
    } catch {
      // Invalid JSON, skip
    }
  }

  return parts.join("\n\n").trim();
}

function extractJsonLdText(data: any, parts: string[]): void {
  if (!data || typeof data !== "object") return;

  // Article content
  if (data["@type"] === "Article" || data["@type"] === "BlogPosting") {
    if (data.headline) parts.push(data.headline);
    if (data.description) parts.push(data.description);
    if (data.articleBody) parts.push(data.articleBody);
  }

  // FAQ content
  if (data["@type"] === "FAQPage" && Array.isArray(data.mainEntity)) {
    for (const qa of data.mainEntity) {
      if (qa.name) parts.push(`Q: ${qa.name}`);
      if (qa.acceptedAnswer?.text) parts.push(`A: ${qa.acceptedAnswer.text}`);
    }
  }

  // Handle arrays (e.g. @graph)
  if (Array.isArray(data)) {
    for (const item of data) extractJsonLdText(item, parts);
  }
  if (data["@graph"]) extractJsonLdText(data["@graph"], parts);
}

/**
 * Extract readable text from Next.js RSC Flight protocol chunks.
 * The Flight format serializes React component trees as escaped JSON.
 * Text content appears as "children" values in the serialized elements.
 */
function extractRscTextContent(html: string): string {
  const texts: string[] = [];

  // Match self.__next_f.push() calls — get the raw chunk content
  const pushCalls = html.matchAll(/self\.__next_f\.push\(\s*\[[\d,]*"([\s\S]*?)"\s*\]\s*\)/g);

  for (const match of pushCalls) {
    let chunk = match[1];
    // Unescape the double-escaped JSON: \\" → "
    chunk = chunk.replace(/\\\\"/g, '"').replace(/\\\\/g, "\\");

    // Extract "children":"text" values (direct text nodes)
    const childrenStrings = chunk.matchAll(/"children"\s*:\s*"((?:[^"\\]|\\.)*)"/g);
    for (const m of childrenStrings) {
      const text = m[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .trim();
      if (text.length > 0 && !isCssOrCode(text)) {
        texts.push(text);
      }
    }

    // Extract text from "children":["text", ...] arrays (mixed content nodes)
    const childrenArrays = chunk.matchAll(/"children"\s*:\s*\[([^\]]*)\]/g);
    for (const m of childrenArrays) {
      const arrayContent = m[1];
      const strings = arrayContent.matchAll(/"((?:[^"\\]|\\.)*)"/g);
      for (const s of strings) {
        const text = s[1]
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\")
          .trim();
        if (text.length > 1 && !isCssOrCode(text)) {
          texts.push(text);
        }
      }
    }
  }

  // Deduplicate while preserving order
  return [...new Set(texts)].join("\n").trim();
}

/** Filter out CSS classes, React internals, and HTML element names */
function isCssOrCode(str: string): boolean {
  // CSS class names
  if (/^[\w-]+(?:\s[\w-]+)*$/.test(str) && /(?:flex|grid|text-|bg-|p-|m-|w-|h-|space-|rounded|border|gap|items-|justify-)/.test(str)) return true;
  // React markers
  if (str === "$" || str === "$undefined" || str.startsWith("$L") || str.startsWith("$R")) return true;
  // HTML element names
  if (/^(?:div|span|section|ul|li|h[1-6]|p|a|img|button|nav|header|footer|main|article)$/.test(str)) return true;
  // Purely numeric or single special chars
  if (/^[\d.•·–—]+$/.test(str)) return true;
  // URLs and paths
  if (/^(?:https?:\/\/|\/[\w-])/.test(str) && !str.includes(" ")) return true;
  return false;
}
