import { http, createConfig } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { coinbaseWallet, injected, metaMask } from 'wagmi/connectors';

export const CONTRACT_ADDRESS = '0x7b0E6793b043C4fD8c848ED9E14B71a093c9Bb4d';

export const config = createConfig({
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http(),
  },
  connectors: [
    metaMask({ dappMetadata: { name: 'Sentiment Market' } }),
    coinbaseWallet({ appName: 'Sentiment Market' }),
    injected({ shimDisconnect: true }),
  ],
  ssr: true,
});
