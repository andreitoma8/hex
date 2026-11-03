import { describe, it, expect } from 'vitest';
import { classifyCard, commitsForCard, findUnmappedChange, rewriteIssueBody } from './fix-review.js';

const BODY = `**File(s)**: [\`Vault.sol\`](https://x/Vault.sol)

**Description**: The fee is unbounded.

\`\`\`solidity
feeBps = _feeBps;
\`\`\`

**Recommendation(s)**: Consider a cap.

**Status**: Unresolved

**Update from the client**: `;

describe('rewriteIssueBody', () => {
  it('changes only Status and Update, byte-exact elsewhere', () => {
    const out = rewriteIssueBody(BODY, {
      status: 'Fixed',
      update: 'Fixed in a1b2c3d by capping feeBps at 10_000.',
    });
    expect(out).toContain('**Status**: Fixed\n');
    expect(
      out.endsWith('**Update from the client**: Fixed in a1b2c3d by capping feeBps at 10_000.\n'),
    ).toBe(true);
    const strip = (s: string) =>
      s.replace(/\*\*Status\*\*:.*\n/, '').replace(/\*\*Update from the client\*\*:[\s\S]*$/, '');
    expect(strip(out)).toBe(strip(BODY));
  });

  it('appends missing fields in template order', () => {
    const out = rewriteIssueBody('**Description**: x', {
      status: 'Acknowledged',
      update: 'Accepted risk.',
    });
    expect(out).toBe(
      '**Description**: x\n\n**Status**: Acknowledged\n\n**Update from the client**: Accepted risk.\n',
    );
  });
});

describe('classifyCard', () => {
  const base = {
    cardFunctions: ['Vault.setFee(uint256)'],
    changedFunctions: [],
    removedFunctions: [],
    commits: [],
  };
  it('trusts the PoC first', () => {
    expect(classifyCard({ ...base, pocBefore: 'passing', pocAfter: 'failing' }).status).toBe(
      'fixed',
    );
    expect(
      classifyCard({
        ...base,
        pocBefore: 'passing',
        pocAfter: 'passing',
        changedFunctions: ['Vault.setFee(uint256)'],
      }).status,
    ).toBe('not_fixed');
  });
  it('treats removed code as fixed, touched code as needing judgement, and the rest as unaddressed', () => {
    expect(classifyCard({ ...base, removedFunctions: ['Vault.setFee(uint256)'] }).status).toBe(
      'fixed',
    );
    expect(
      classifyCard({ ...base, changedFunctions: ['Vault.setFee(uint256)'], pocAfter: 'error' })
        .evidence,
    ).toContain('no longer compiles');
    expect(classifyCard({ ...base, commits: ['abc1234'] }).status).toBe('unknown');
    expect(classifyCard(base).status).toBe('unaddressed');
  });
});

describe('commitsForCard', () => {
  it('matches card ids and GitHub issue numbers, not substrings', () => {
    const log = [
      { sha: 'a', subject: 'cap fee (fixes H-001)' },
      { sha: 'b', subject: 'refactor', body: 'Closes #12' },
      { sha: 'c', subject: 'touch H-0012 and #120' },
    ];
    expect(commitsForCard(log, { id: 'H-001', github_issue: 12 })).toEqual(['a', 'b']);
  });
});

describe('findUnmappedChange', () => {
  const changes = [
    { contract: 'Vault', entity: 'sweep(address,address,uint256)' },
    { contract: 'Vault', entity: 'pause()' },
    { contract: 'Router', entity: 'pause()' },
  ];
  it('matches Contract.name with or without the signature, and unique bare names', () => {
    expect(findUnmappedChange(changes, 'Vault.sweep')).toBe(0);
    expect(findUnmappedChange(changes, 'Vault.sweep(address,address,uint256)')).toBe(0);
    expect(findUnmappedChange(changes, 'sweep')).toBe(0);
    expect(findUnmappedChange(changes, 'Router.pause')).toBe(2);
  });
  it('refuses ambiguous and unknown references', () => {
    expect(() => findUnmappedChange(changes, 'pause')).toThrow(/matches 2/);
    expect(() => findUnmappedChange(changes, 'Vault.swee')).toThrow(/No unmapped change/);
  });
});
