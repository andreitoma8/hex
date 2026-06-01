import { describe, it, expect } from 'vitest';
import { detectErcsFromInheritance, detectErcsFromFunctions, detectErcs } from './erc-detection.js';

describe('detectErcsFromInheritance', () => {
  it('detects ERC20 from inheritance', () => {
    expect(detectErcsFromInheritance(['ERC20'])).toEqual(['ERC20']);
    expect(detectErcsFromInheritance(['IERC20'])).toEqual(['ERC20']);
    expect(detectErcsFromInheritance(['ERC20Burnable'])).toEqual(['ERC20']);
  });

  it('detects ERC721', () => {
    expect(detectErcsFromInheritance(['ERC721'])).toEqual(['ERC721']);
    expect(detectErcsFromInheritance(['ERC721Enumerable'])).toEqual(['ERC721']);
  });

  it('detects ERC4626', () => {
    expect(detectErcsFromInheritance(['ERC4626'])).toEqual(['ERC4626']);
  });

  it('detects multiple ERCs', () => {
    const result = detectErcsFromInheritance(['ERC20', 'ERC4626']);
    expect(result).toContain('ERC20');
    expect(result).toContain('ERC4626');
  });

  it('ignores unknown base contracts', () => {
    expect(detectErcsFromInheritance(['MyContract', 'Ownable'])).toEqual([]);
  });
});

describe('detectErcsFromFunctions', () => {
  it('detects ERC20 from function signatures', () => {
    const funcs = ['totalSupply', 'balanceOf', 'transfer', 'allowance', 'approve', 'transferFrom'];
    expect(detectErcsFromFunctions(funcs)).toContain('ERC20');
  });

  it('requires sufficient signature matches', () => {
    // Only 2 of 6 required — should not match
    const funcs = ['totalSupply', 'balanceOf'];
    expect(detectErcsFromFunctions(funcs)).not.toContain('ERC20');
  });
});

describe('detectErcs', () => {
  it('combines inheritance and function detection', () => {
    const result = detectErcs(
      ['ERC4626'],
      ['totalSupply', 'balanceOf', 'transfer', 'allowance', 'approve', 'transferFrom'],
    );
    expect(result).toContain('ERC20');
    expect(result).toContain('ERC4626');
  });
});
