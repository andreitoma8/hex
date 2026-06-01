/**
 * Parse solc compiler outputs: AST JSON and storage layout.
 */

export interface StorageLayoutEntry {
  contract: string;
  label: string;
  type: string;
  slot: number;
  offset: number;
  numberOfBytes: number;
}

export interface StorageLayout {
  entries: StorageLayoutEntry[];
}

/**
 * Parse solc --storage-layout output.
 */
export function parseStorageLayout(json: unknown, contractName: string): StorageLayout {
  const entries: StorageLayoutEntry[] = [];

  if (!json || typeof json !== 'object') return { entries };

  const data = json as Record<string, unknown>;

  // solc outputs nested under contracts
  const contracts = data.contracts as Record<string, Record<string, unknown>> | undefined;
  if (!contracts) return { entries };

  for (const [, fileContracts] of Object.entries(contracts)) {
    for (const [name, contractData] of Object.entries(fileContracts)) {
      if (contractName && name !== contractName) continue;

      const cd = contractData as Record<string, unknown>;
      const layout = cd.storageLayout as Record<string, unknown>;
      if (!layout) continue;

      const storage = layout.storage as unknown[];
      if (!Array.isArray(storage)) continue;

      for (const item of storage) {
        const s = item as Record<string, unknown>;
        entries.push({
          contract: name,
          label: String(s.label ?? ''),
          type: String(s.type ?? ''),
          slot: Number(s.slot ?? 0),
          offset: Number(s.offset ?? 0),
          numberOfBytes: Number(
            ((layout.types as Record<string, Record<string, unknown>>)?.[String(s.type)]
              ?.numberOfBytes) ?? 0,
          ),
        });
      }
    }
  }

  return { entries };
}
