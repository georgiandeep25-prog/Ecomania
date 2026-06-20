import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import * as ecomaniaLib from './lib/ecomania';

vi.mock('./lib/ecomania', () => ({
  discoverWalletState: vi.fn().mockResolvedValue({ account: '' }),
  hasContractConfig: vi.fn().mockReturnValue(true),
  getContractExplorerLink: vi.fn().mockReturnValue(''),
  getNetworkLabel: vi.fn().mockReturnValue('Testnet'),
  getExplorerLink: vi.fn().mockReturnValue(''),
  configuredNetworkPassphrase: 'Test SDF Network ; September 2015',
  configuredContractId: 'CC3I3RHEQ6OOHYWYXUPUUGFOU4MRJEGEIFULJ4UJ3EUE5FATDBAHQ3TM',
  readDashboard: vi.fn(),
  readRecentEcoActions: vi.fn(),
  readContractActivity: vi.fn().mockResolvedValue([]),
}));

describe('Ecomania App', () => {
  it('renders without crashing and displays the brand name', async () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );

    const ecomaniaElements = screen.getAllByText(/Ecomania/i);
    expect(ecomaniaElements.length).toBeGreaterThan(0);
    expect(screen.getByText(/Public climate ledger/i)).toBeInTheDocument();
  });
});
