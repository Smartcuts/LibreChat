/**
 * Content Type Detection Utilities
 *
 * Provides heuristic-based detection of content types (HTML, Markdown, CSV)
 * when explicit MIME types are not available.
 *
 * Detection Priority:
 * 1. HTML (most specific/structured)
 * 2. Markdown (medium structure)
 * 3. CSV (pattern-based)
 * 4. Falls back to null (caller should use text/plain)
 */

const MIN_CONTENT_LENGTH = 10; // Minimum chars to attempt detection

/**
 * Detects HTML content using multiple indicators
 *
 * Strong indicators (single match sufficient):
 * - DOCTYPE declaration
 * - <html> tag
 *
 * Medium indicators (multiple needed):
 * - Block-level tags (div, section, article, etc.)
 * - Void/self-closing tags (br, hr, img, etc.)
 * - Inline tags with closing pairs
 *
 * @param content - String content to analyze
 * @returns true if content appears to be HTML
 */
function hasHTMLIndicators(content: string): boolean {
  if (!content || content.length < MIN_CONTENT_LENGTH) {
    return false;
  }

  const trimmed = content.trim();

  // Very strong indicators - single match is enough
  if (/^\s*<!DOCTYPE\s+html/i.test(trimmed)) {
    return true;
  }

  if (/<html[\s>]/i.test(trimmed)) {
    return true;
  }

  // Scoring system for medium indicators
  let score = 0;

  // Block-level HTML tags (strong signal)
  const blockTags =
    /<(div|section|article|header|footer|main|body|head|nav|aside|form|table|ul|ol|li)/i;
  if (blockTags.test(content)) {
    score += 2;
  }

  // Void/self-closing tags
  const voidTags = /<(br|hr|img|input|link|meta|area|base|col|embed|source|track|wbr)\s*\/?>/i;
  if (voidTags.test(content)) {
    score += 1;
  }

  // Common inline tags
  const inlineTags = /<(span|a|strong|em|b|i|p|h[1-6]|button|label)[\s>]/i;
  if (inlineTags.test(content)) {
    score += 1;
  }

  // Closing tags (indicates structure)
  const closingTags = /<\/\w+>/;
  if (closingTags.test(content)) {
    score += 1;
  }

  // HTML attributes (class, id, style, etc.)
  const htmlAttrs = /<\w+\s+(class|id|style|href|src|type|name|value)=/i;
  if (htmlAttrs.test(content)) {
    score += 1;
  }

  // Need at least 3 points to confidently say it's HTML
  return score >= 3;
}

/**
 * Detects Markdown content using syntax indicators
 *
 * Indicators (scored):
 * - Headings: # ## ### etc. (2 points)
 * - Code blocks: ``` (2 points)
 * - Links: [text](url) (1.5 points)
 * - Bold/Italic: **text** or *text* (1 point each)
 * - Lists: - item or 1. item (1 point each)
 * - Blockquotes: > text (1 point)
 * - Horizontal rules: --- or *** (1 point)
 * - Inline code: `code` (0.5 points)
 *
 * Threshold: 2+ points
 *
 * Note: Returns false if content is detected as HTML to avoid false positives
 * (since Markdown can contain HTML)
 *
 * @param content - String content to analyze
 * @returns true if content appears to be Markdown
 */
function hasMarkdownIndicators(content: string): boolean {
  if (!content || content.length < MIN_CONTENT_LENGTH) {
    return false;
  }

  // Don't detect markdown if it's HTML
  // (Markdown can contain HTML, but HTML is more specific)
  if (hasHTMLIndicators(content)) {
    return false;
  }

  let score = 0;

  // ATX Headings (# heading) - strong indicator
  if (/^#{1,6}\s+.+$/m.test(content)) {
    score += 2;
  }

  // Setext headings (underlined with = or -)
  if (/^.+\n[=\-]{2,}\s*$/m.test(content)) {
    score += 1.5;
  }

  // Code blocks (fenced with ```)
  if (/```[\s\S]*?```/.test(content)) {
    score += 2;
  }

  // Links: [text](url)
  if (/\[.+?\]\(.+?\)/.test(content)) {
    score += 1.5;
  }

  // Bold: **text** or __text__
  if (/(\*\*|__).+?(\*\*|__)/.test(content)) {
    score += 1;
  }

  // Italic: *text* or _text_ (but not part of bold)
  // Use negative lookbehind/lookahead to avoid matching ** or __
  if (/(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)/.test(content) || /(?<!_)_(?!_)([^_\n]+)_(?!_)/.test(content)) {
    score += 1;
  }

  // Unordered lists: - item, * item, + item
  if (/^\s*[-*+]\s+.+$/m.test(content)) {
    score += 1;
  }

  // Ordered lists: 1. item
  if (/^\s*\d+\.\s+.+$/m.test(content)) {
    score += 1;
  }

  // Blockquotes: > text
  if (/^\s*>.+$/m.test(content)) {
    score += 1;
  }

  // Horizontal rules: ---, ***, ___
  if (/^(\*{3,}|-{3,}|_{3,})\s*$/m.test(content)) {
    score += 1;
  }

  // Inline code: `code`
  if (/`[^`\n]+`/.test(content)) {
    score += 0.5;
  }

  // Tables: | col1 | col2 |
  if (/\|.+\|/.test(content) && /\|[\s:-]+\|/.test(content)) {
    score += 1.5;
  }

  // Task lists: - [ ] or - [x]
  if (/^\s*[-*+]\s+\[[ xX]\]\s+.+$/m.test(content)) {
    score += 1;
  }

  // Need at least 2 points to confidently say it's Markdown
  return score >= 2;
}

/**
 * Detects CSV content by analyzing structure
 *
 * Requirements:
 * - At least 2 lines
 * - Consistent comma-separated values
 * - Similar comma count across lines (±1 tolerance)
 *
 * @param content - String content to analyze
 * @returns true if content appears to be CSV
 */
function hasCSVStructure(content: string): boolean {
  if (!content || content.length < MIN_CONTENT_LENGTH) {
    return false;
  }

  // Split into lines and filter empty lines
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  // Need at least 2 lines (header + data)
  if (lines.length < 2) {
    return false;
  }

  const firstLine = lines[0];
  const secondLine = lines[1];

  // First line must have commas
  if (!firstLine.includes(',')) {
    return false;
  }

  // Count commas in first two lines
  const firstCommas = (firstLine.match(/,/g) || []).length;
  const secondCommas = (secondLine.match(/,/g) || []).length;

  // Lines should have similar comma counts (±1 tolerance for edge cases)
  if (firstCommas === 0 || Math.abs(firstCommas - secondCommas) > 1) {
    return false;
  }

  // Additional validation: check a few more lines if available
  if (lines.length >= 4) {
    const thirdCommas = (lines[2].match(/,/g) || []).length;
    const fourthCommas = (lines[3].match(/,/g) || []).length;

    // If we have more data, be more strict
    const avgCommas = (firstCommas + secondCommas + thirdCommas + fourthCommas) / 4;
    const maxDeviation = lines
      .slice(0, 4)
      .reduce((max, line) => {
        const commas = (line.match(/,/g) || []).length;
        return Math.max(max, Math.abs(commas - avgCommas));
      }, 0);

    // Allow max deviation of 1.5 for CSV with optional fields
    if (maxDeviation > 1.5) {
      return false;
    }
  }

  return true;
}

/**
 * Detects content type from raw string content
 *
 * Detection order (by specificity):
 * 1. HTML (most structured)
 * 2. Markdown (medium structure)
 * 3. CSV (pattern-based)
 *
 * @param content - String content to analyze
 * @returns Detected MIME type or null if unknown
 */
export function detectContentType(content: string): string | null {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // Trim and check minimum length
  const trimmed = content.trim();
  if (trimmed.length < MIN_CONTENT_LENGTH) {
    return null;
  }

  // Check in order of specificity
  if (hasHTMLIndicators(trimmed)) {
    return 'text/html';
  }

  if (hasMarkdownIndicators(trimmed)) {
    return 'text/markdown';
  }

  if (hasCSVStructure(trimmed)) {
    return 'text/csv';
  }

  // Unknown type
  return null;
}

/**
 * Re-export individual detection functions for testing/specific use cases
 */
export { hasHTMLIndicators, hasMarkdownIndicators, hasCSVStructure };
