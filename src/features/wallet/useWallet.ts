import { useWalletStore } from "./wallet.store";

export const useWallet = () => {
  const { walletAddress, isConnected, setWalletAddress, disconnect } = useWalletStore();

  const connectManually = (address: string) => {
    // TODO: Add address validation
    setWalletAddress(address);
  };

  /**
   * TODO: Add production wallet integrations:
   * - WalletConnect
   * - Coinbase Wallet SDK
   * - MetaMask Mobile
   * - Embedded Wallets (Privy, Dynamic, etc.)
   */

  return {
    walletAddress,
    isConnected,
    connectManually,
    disconnect,
  };
};
