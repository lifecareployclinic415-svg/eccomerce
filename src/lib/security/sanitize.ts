import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "blockquote", "code", "pre",
  "h1", "h2", "h3", "h4", "ul", "ol", "li", "a", "img", "figure",
  "figcaption", "table", "thead", "tbody", "tr", "th", "td", "hr", "span",
];

const ALLOWED_ATTR = ["href", "src", "alt", "title", "target", "rel", "class", "colspan", "rowspan"];

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Blocks javascript:, data: and vbscript: URLs in href/src.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/|#)/i,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "style", "formaction"],
  });
}

/**
 * Any link that opens a new tab must carry rel="noopener", or the opened
 * page can reach back through window.opener and navigate the original.
 */
export function sanitizeRichText(dirty: string): string {
  const clean = sanitizeHtml(dirty);
  return clean.replace(
    /<a\s+([^>]*target=["']_blank["'][^>]*)>/gi,
    (match, attrs: string) =>
      attrs.includes("rel=") ? match : `<a ${attrs} rel="noopener noreferrer">`,
  );
}

/** For plain-text fields that must never contain markup at all. */
export function stripHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
