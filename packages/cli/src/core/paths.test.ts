import { describe, it, expect } from 'vitest';
import { normalizePath, makeRelative, splitLines } from './paths.js';

describe('normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('D:\\project\\src\\Vault.sol')).toBe('D:/project/src/Vault.sol');
  });

  it('leaves forward slashes unchanged', () => {
    expect(normalizePath('src/Vault.sol')).toBe('src/Vault.sol');
  });

  it('handles mixed slashes', () => {
    expect(normalizePath('src\\core/Vault.sol')).toBe('src/core/Vault.sol');
  });
});

describe('splitLines', () => {
  it('splits Unix line endings', () => {
    expect(splitLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('splits Windows line endings', () => {
    expect(splitLines('a\r\nb\r\nc')).toEqual(['a', 'b', 'c']);
  });

  it('handles empty string', () => {
    expect(splitLines('')).toEqual(['']);
  });
});
