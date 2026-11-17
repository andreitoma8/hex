import { describe, it, expect } from 'vitest';
import { splitOverview } from './overview';

describe('splitOverview', () => {
  it('takes the protocol name from the "Protocol Overview: X" heading', () => {
    const { title, body } = splitOverview(
      '# Protocol Overview: DiversiFi v2\n\nThe protocol…\n\n## Key Contracts\n',
      'x',
    );
    expect(title).toBe('DiversiFi v2');
    expect(body).toBe('The protocol…\n\n## Key Contracts');
  });
  it('keeps a plain heading, and falls back to the project name for a generic one', () => {
    expect(splitOverview('# Vault\n\nText', 'x').title).toBe('Vault');
    expect(splitOverview('# Overview\n\nText', 'vault').title).toBe('vault');
    expect(splitOverview('# Protocol overview — Kintsu\nText', 'x').title).toBe('Kintsu');
  });
  it('uses the fallback title and the whole text when there is no H1', () => {
    expect(splitOverview('Just prose.\n\n## Notes', 'vault')).toEqual({
      title: 'vault',
      body: 'Just prose.\n\n## Notes',
    });
  });
});
