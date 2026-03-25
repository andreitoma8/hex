import fs from 'node:fs';
import path from 'node:path';
import { normalizePath } from '../core/paths.js';

export interface PatternLocation {
  file: string;
  line: number;
  match: string;
}

export interface PatternFlag {
  detected: boolean;
  locations: PatternLocation[];
  count: number;
}

export interface PatternResult {
  flags: Record<string, PatternFlag>;
  protocol_hints: string[];
  risk_areas: string[];
}

interface PatternDef {
  flag: string;
  patterns: RegExp[];
  hint?: string; // protocol type hint when detected
  risk_template?: string; // risk description template ("{file}" replaced)
}

const PATTERN_DEFS: PatternDef[] = [
  {
    flag: 'TEMPORAL',
    patterns: [
      /block\.timestamp/,
      /block\.number/,
      /\b(interval|epoch|period|duration|deadline|expiry|cooldown)\b/i,
    ],
    risk_template: 'Time-dependent logic in {file}',
  },
  {
    flag: 'ORACLE',
    patterns: [
      /latestRoundData/,
      /latestAnswer/,
      /\bTWAP\b/,
      /\b(chainlink|pyth|redstone)\b/i,
      /priceFeed/i,
      /getPrice/,
      /IOracle/,
    ],
    hint: 'oracle-dependent',
    risk_template: 'Oracle integration in {file}',
  },
  {
    flag: 'FLASH_LOAN',
    patterns: [
      /flashLoan/,
      /onFlashLoan/,
      /IERC3156/,
      /flashFee/,
      /IFlash/,
    ],
    risk_template: 'Flash loan callback in {file}',
  },
  {
    flag: 'BALANCE_DEPENDENT',
    patterns: [
      /balanceOf\s*\(\s*address\s*\(\s*this\s*\)/,
      /\.balance\b/,
      /address\(this\)\.balance/,
    ],
    risk_template: 'Direct balance read in {file} — donation attack surface',
  },
  {
    flag: 'CROSS_CHAIN',
    patterns: [
      /\b(bridge|crossChain|cross_chain)\b/i,
      /\b(layerZero|wormhole|axelar|ccip)\b/i,
      /\b(L1|L2)\b/,
      /\bmessenger\b/i,
      /\blzReceive\b/,
      /\bccipReceive\b/,
    ],
    hint: 'cross-chain',
    risk_template: 'Cross-chain interaction in {file}',
  },
  {
    flag: 'SEMI_TRUSTED_ROLE',
    patterns: [
      /onlyKeeper/,
      /onlyBot/,
      /onlyOperator/,
      /onlyRelayer/,
      /\bBOT_ROLE\b/,
      /\bKEEPER_ROLE\b/,
      /\bOPERATOR_ROLE\b/,
      /\bRELAYER_ROLE\b/,
    ],
    risk_template: 'Semi-trusted role in {file}',
  },
  {
    flag: 'SHARE_ALLOCATION',
    patterns: [
      /\bshares\b/,
      /\ballocation\b/i,
      /pro.?rata/i,
      /\bdistribution\b/i,
      /convertToShares/,
      /convertToAssets/,
    ],
    hint: 'vault',
    risk_template: 'Share math in {file}',
  },
  {
    flag: 'MONETARY_PARAMETER',
    patterns: [
      /\b(interestRate|feeRate|emissionRate|rewardRate)\b/,
      /\brebase\b/i,
      /\bemission\b/i,
      /\.mint\s*\(/,
      /\.burn\s*\(/,
    ],
    risk_template: 'Economic parameter in {file}',
  },
  {
    flag: 'UPGRADEABLE',
    patterns: [
      /\bdelegatecall\b/,
      /\bproxy\b/i,
      /\binitializer\b/,
      /\breinitializer\b/,
      /_disableInitializers/,
      /\bUUPS\b/,
      /\bTransparentProxy\b/,
    ],
    hint: 'upgradeable',
    risk_template: 'Upgrade pattern in {file}',
  },
  {
    flag: 'ERC4626',
    patterns: [
      /\bERC4626\b/,
      /convertToShares/,
      /convertToAssets/,
      /\bmaxDeposit\b/,
      /\bmaxWithdraw\b/,
    ],
    hint: 'vault',
    risk_template: 'ERC4626 vault math in {file}',
  },
  {
    flag: 'RANDOMNESS',
    patterns: [
      /\bprevrandao\b/,
      /block\.difficulty/,
      /keccak256\s*\(\s*abi\.encodePacked\s*\(\s*block/,
    ],
    risk_template: 'Weak randomness source in {file}',
  },
  {
    flag: 'HAS_SIGNATURES',
    patterns: [
      /\becrecover\b/,
      /ECDSA\.recover/,
      /\bEIP712\b/,
      /domainSeparator/,
      /\bpermit\b/,
      /isValidSignature/,
    ],
    risk_template: 'Signature handling in {file}',
  },
  {
    flag: 'CALLBACK',
    patterns: [
      /_safeMint/,
      /onERC721Received/,
      /onERC1155Received/,
      /onFlashLoan/,
      /\breceive\s*\(\s*\)/,
      /\bfallback\s*\(/,
    ],
    risk_template: 'Callback / reentrancy entry in {file}',
  },
  {
    flag: 'ASSEMBLY',
    patterns: [
      /assembly\s*\{/,
      /\bsstore\b/,
      /\bsload\b/,
      /\bmstore\b/,
      /\bmload\b/,
      /\bcalldatacopy\b/,
    ],
    risk_template: 'Inline assembly in {file}',
  },
  {
    flag: 'UNCHECKED',
    patterns: [/unchecked\s*\{/],
    risk_template: 'Unchecked arithmetic in {file}',
  },
  {
    flag: 'DELEGATECALL',
    patterns: [/\.delegatecall\s*\(/],
    risk_template: 'Delegatecall in {file}',
  },
];

/**
 * Scan in-scope files for security-relevant patterns and return detection flags.
 */
export function detectPatterns(projectDir: string, scopeFiles: string[]): PatternResult {
  const flags: Record<string, PatternFlag> = {};
  const hintSet = new Set<string>();
  const riskSet = new Set<string>();

  // Initialize all flags
  for (const def of PATTERN_DEFS) {
    flags[def.flag] = { detected: false, locations: [], count: 0 };
  }

  for (const scopeFile of scopeFiles) {
    const filePath = path.resolve(projectDir, scopeFile);
    if (!fs.existsSync(filePath)) continue;

    const source = fs.readFileSync(filePath, 'utf-8');
    const lines = source.split('\n');
    const normalFile = normalizePath(scopeFile);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment-only lines
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      for (const def of PATTERN_DEFS) {
        for (const pattern of def.patterns) {
          const match = line.match(pattern);
          if (match) {
            const flag = flags[def.flag];
            flag.detected = true;
            flag.count++;
            // Keep max 5 locations per flag to avoid bloat
            if (flag.locations.length < 5) {
              flag.locations.push({
                file: normalFile,
                line: i + 1,
                match: match[0],
              });
            }
            if (def.hint) hintSet.add(def.hint);
            if (def.risk_template) {
              riskSet.add(def.risk_template.replace('{file}', normalFile));
            }
            break; // one match per pattern def per line
          }
        }
      }
    }
  }

  // Deduplicate risk areas (same template + same file → one entry)
  const risk_areas = [...riskSet].slice(0, 20);
  const protocol_hints = [...hintSet];

  return { flags, protocol_hints, risk_areas };
}
