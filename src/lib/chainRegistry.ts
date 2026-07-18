/**
 * chainRegistry.ts
 *
 * A static allow-list of EVM-compatible chain IDs that this version of the
 * GuildPass mobile app recognises. Its primary purpose is to provide a safe
 * fallback when guild or role data references a chain the app has not been
 * updated to support yet (e.g., a new L2 added server-side before the next
 * app release).
 *
 * Any chain ID that is NOT present in this registry is treated as "unknown"
 * and rendered as "Unsupported network" instead of crashing the guild detail
 * screen (see RequirementCard and the guild detail screen).
 *
 * Adding support for a new chain
 * --------------------------------
 * 1. Add an entry to KNOWN_CHAINS below.
 * 2. Bump the app version and release.
 *
 * Do NOT throw from this module – it is designed to degrade gracefully.
 */

export type ChainInfo = {
  chainId: number;
  name: string;
  shortName: string;
  isTestnet: boolean;
};

/**
 * Known EVM chains. Covers mainnet, major testnets, and widely-deployed L2s
 * that GuildPass currently supports.
 */
export const KNOWN_CHAINS: ReadonlyArray<ChainInfo> = [
  // Ethereum
  { chainId: 1, name: "Ethereum Mainnet", shortName: "Ethereum", isTestnet: false },
  { chainId: 11155111, name: "Sepolia Testnet", shortName: "Sepolia", isTestnet: true },
  { chainId: 5, name: "Goerli Testnet", shortName: "Goerli", isTestnet: true },

  // Polygon
  { chainId: 137, name: "Polygon Mainnet", shortName: "Polygon", isTestnet: false },
  { chainId: 80001, name: "Polygon Mumbai", shortName: "Mumbai", isTestnet: true },
  { chainId: 80002, name: "Polygon Amoy", shortName: "Amoy", isTestnet: true },

  // BNB Smart Chain
  { chainId: 56, name: "BNB Smart Chain", shortName: "BSC", isTestnet: false },
  { chainId: 97, name: "BNB Testnet", shortName: "BSC Testnet", isTestnet: true },

  // Arbitrum
  { chainId: 42161, name: "Arbitrum One", shortName: "Arbitrum", isTestnet: false },
  { chainId: 421614, name: "Arbitrum Sepolia", shortName: "Arb Sepolia", isTestnet: true },

  // Optimism
  { chainId: 10, name: "Optimism Mainnet", shortName: "Optimism", isTestnet: false },
  { chainId: 11155420, name: "Optimism Sepolia", shortName: "Op Sepolia", isTestnet: true },

  // Base
  { chainId: 8453, name: "Base Mainnet", shortName: "Base", isTestnet: false },
  { chainId: 84532, name: "Base Sepolia", shortName: "Base Sepolia", isTestnet: true },

  // Avalanche
  { chainId: 43114, name: "Avalanche C-Chain", shortName: "Avalanche", isTestnet: false },
  { chainId: 43113, name: "Avalanche Fuji", shortName: "Fuji", isTestnet: true },
];

/** Indexed lookup by chain ID for O(1) access. */
const CHAIN_MAP = new Map<number, ChainInfo>(KNOWN_CHAINS.map((c) => [c.chainId, c]));

/**
 * Returns `true` if the given chain ID is in the app's supported allow-list.
 * Returns `false` for any chain not yet listed (e.g., a new L2 added
 * server-side before the app is updated).
 *
 * This function never throws.
 */
export function isKnownChainId(chainId: number): boolean {
  return CHAIN_MAP.has(chainId);
}

/**
 * Returns the human-readable name for a known chain ID, or `null` if the
 * chain is not in the registry.
 *
 * Callers that need a display string should use `getChainDisplayName` instead,
 * which always returns a non-null fallback.
 *
 * This function never throws.
 */
export function getChainInfo(chainId: number): ChainInfo | null {
  return CHAIN_MAP.get(chainId) ?? null;
}

/**
 * Returns a human-readable display name for the chain.
 * Falls back to "Unsupported network" for unrecognised chain IDs.
 *
 * This function never throws.
 */
export function getChainDisplayName(chainId: number): string {
  const info = CHAIN_MAP.get(chainId);
  if (info) {
    return info.shortName;
  }
  return "Unsupported network";
}
