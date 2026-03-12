/**
 * Detect ERC/EIP usage from inheritance and function signatures.
 */

const KNOWN_ERC_BASES: Record<string, string> = {
  // ERC-20
  ERC20: 'ERC20',
  IERC20: 'ERC20',
  ERC20Burnable: 'ERC20',
  ERC20Pausable: 'ERC20',
  ERC20Permit: 'ERC20',
  ERC20Votes: 'ERC20',
  ERC20Wrapper: 'ERC20',
  ERC20FlashMint: 'ERC20',

  // ERC-721
  ERC721: 'ERC721',
  IERC721: 'ERC721',
  ERC721Enumerable: 'ERC721',
  ERC721URIStorage: 'ERC721',
  ERC721Burnable: 'ERC721',
  ERC721Pausable: 'ERC721',
  ERC721Royalty: 'ERC721',

  // ERC-1155
  ERC1155: 'ERC1155',
  IERC1155: 'ERC1155',
  ERC1155Supply: 'ERC1155',
  ERC1155Burnable: 'ERC1155',
  ERC1155Pausable: 'ERC1155',
  ERC1155URIStorage: 'ERC1155',

  // ERC-4626
  ERC4626: 'ERC4626',
  IERC4626: 'ERC4626',

  // EIP-2612
  ERC20Permit2: 'EIP-2612',

  // ERC-2981
  ERC2981: 'ERC-2981',

  // EIP-712
  EIP712: 'EIP-712',
};

const ERC_FUNCTION_SIGNATURES: Record<string, string[]> = {
  ERC20: ['totalSupply', 'balanceOf', 'transfer', 'allowance', 'approve', 'transferFrom'],
  ERC721: ['balanceOf', 'ownerOf', 'safeTransferFrom', 'transferFrom', 'approve', 'getApproved', 'setApprovalForAll', 'isApprovedForAll'],
  ERC1155: ['balanceOf', 'balanceOfBatch', 'setApprovalForAll', 'isApprovedForAll', 'safeTransferFrom', 'safeBatchTransferFrom'],
  ERC4626: ['asset', 'totalAssets', 'convertToShares', 'convertToAssets', 'maxDeposit', 'previewDeposit', 'deposit', 'maxMint', 'previewMint', 'mint'],
  'EIP-2612': ['permit', 'nonces', 'DOMAIN_SEPARATOR'],
};

/**
 * Detect ERCs from contract inheritance names.
 */
export function detectErcsFromInheritance(baseContracts: string[]): string[] {
  const detected = new Set<string>();
  for (const base of baseContracts) {
    const erc = KNOWN_ERC_BASES[base];
    if (erc) detected.add(erc);
  }
  return [...detected];
}

/**
 * Detect ERCs from function signatures present in a contract.
 */
export function detectErcsFromFunctions(functionNames: string[]): string[] {
  const detected = new Set<string>();
  const nameSet = new Set(functionNames);

  for (const [erc, signatures] of Object.entries(ERC_FUNCTION_SIGNATURES)) {
    const matchCount = signatures.filter((s) => nameSet.has(s)).length;
    // Require at least 60% of signatures to match
    if (matchCount >= Math.ceil(signatures.length * 0.6)) {
      detected.add(erc);
    }
  }

  return [...detected];
}

/**
 * Detect all ERCs for a contract using both inheritance and function matching.
 */
export function detectErcs(
  baseContracts: string[],
  functionNames: string[],
): string[] {
  const fromInheritance = detectErcsFromInheritance(baseContracts);
  const fromFunctions = detectErcsFromFunctions(functionNames);
  return [...new Set([...fromInheritance, ...fromFunctions])].sort();
}
