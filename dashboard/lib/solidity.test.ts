import { describe, it, expect } from 'vitest';
import { applyRefs, highlightSolidity } from './solidity';

describe('applyRefs', () => {
  const line = '        IToken(token).transferFrom(msg.sender, address(this), amount);';
  const toks = highlightSolidity(line)[0];
  const at = (word: string) => line.indexOf(word);

  it('cuts references out of tokens without changing the text', () => {
    const segs = applyRefs(toks, [
      { col: at('IToken'), len: 6, key: 'IToken', def: false },
      { col: at('token)'), len: 5, key: 'Vault.token', def: false },
      {
        col: at('transferFrom'),
        len: 12,
        key: 'IToken.transferFrom(address,address,uint256)',
        def: false,
      },
    ]);
    expect(segs.map((s) => s.text).join('')).toBe(line);
    expect(segs.filter((s) => s.ref).map((s) => [s.text, s.ref])).toEqual([
      ['IToken', 'IToken'],
      ['token', 'Vault.token'],
      ['transferFrom', 'IToken.transferFrom(address,address,uint256)'],
    ]);
  });

  it('marks a declaration name and leaves lines without references alone', () => {
    const decl = '    function deposit(uint256 amount) external returns (uint256 shares) {';
    const t = highlightSolidity(decl)[0];
    const segs = applyRefs(t, [
      { col: decl.indexOf('deposit'), len: 7, key: 'Vault.deposit(uint256)', def: true },
    ]);
    expect(segs.find((s) => s.ref)).toMatchObject({ text: 'deposit', def: true });
    expect(applyRefs(t, [])).toBe(t);
  });
});
