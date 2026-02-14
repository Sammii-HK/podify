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
 * Focuses on main content area, strips nav/footer/scripts.
 */
function stripHtmlToText(html: string): string {
  let text = html;

  // Remove script, style, nav, footer, header elements entirely
  text = text.replace(
    /<(script|style|nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,
    ""
  );

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Try to extract main/article content if available
  const mainMatch = text.match(
    /<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i
  );
  if (mainMatch) {
    text = mainMatch[1];
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

  return text.trim();
}
