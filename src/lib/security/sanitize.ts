import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "blockquote", "code", "pre",
  "h1", "h2", "h3", "h4", "ul", "ol", "li", "a", "img", "figure",
  "figcaption", "table", "thead", "tbody", "tr", "th", "td", "hr", "span",
];

const ALLOWED_ATTR = ["href", "src", "alt", "title", "target", "rel", "class", "colspan", "rowspan"];

export function sanitizeHtml_legacy(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      '*': ['class'],
      'a': ['href', 'target', 'rel', 'title'],
      'img': ['src', 'alt', 'title'],
      'table': [],
      'thead': [],
      'tbody': [],
      'tr': [],
      'th': ['colspan', 'rowspan'],
      'td': ['colspan', 'rowspan'],
      'figure': [],
      'figcaption': [],
    },
    disallowedTagsMode: 'discard',
    transformTags: {
      'a': function(tagName, attribs) {
        // Ensure rel="noopener noreferrer" for links
        if (attribs.target === '_blank') {
          attribs.rel = 'noopener noreferrer';
        }
        return {
          tagName: tagName,
          attribs: attribs
        };
      }
    }
  });
}

/**
 * Sanitize rich HTML content from admin panel.
 * Uses sanitize-html instead of isomorphic-dompurify (which has DOM dependencies).
 */
export function sanitizeRichText(dirty: string): string {
  return sanitizeHtml_legacy(dirty);
}

/** For plain-text fields that must never contain markup at all. */
export function stripHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
