import { describe, it, expect } from 'vitest';
import { escapeBlockMarkers } from '../components/MarkdownRenderer';

describe('escapeBlockMarkers', () => {
  it('keeps numbered steps, bullets, headings and quotes inline', () => {
    expect(escapeBlockMarkers('1. pull  2. price')).toBe('1\\. pull  2. price');
    expect(escapeBlockMarkers('- one\n# two\n> three')).toBe('\\- one\n\\# two\n\\> three');
    expect(escapeBlockMarkers('plain `code` and **bold**')).toBe('plain `code` and **bold**');
    expect(escapeBlockMarkers('shares > 0 stays')).toBe('shares > 0 stays');
  });
});
