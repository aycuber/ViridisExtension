import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

describe('Popup App', () => {
  beforeEach(() => {
    // Mock chrome.storage.local
    global.chrome = {
      storage: {
        local: {
          get: vi.fn()
        }
      }
    } as any;
  });

  it('shows loading state initially', () => {
    chrome.storage.local.get.mockImplementation(() => new Promise(() => {}));
    render(<App />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows error state when no data available', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    render(<App />);
    expect(await screen.findByText(/No Product Data/)).toBeInTheDocument();
  });

  it('displays product data when available', async () => {
    const mockData = {
      viridisLast: {
        product: {
          title: 'Test Product',
          price: '$29.99',
          url: 'https://example.com'
        },
        score: 8,
        cashback_pct: 2,
        alternatives: [
          {
            name: 'Better Product',
            score: 9,
            cashback_pct: 3,
            url: 'https://example.com/better'
          }
        ],
        timestamp: Date.now()
      }
    };

    chrome.storage.local.get.mockResolvedValue(mockData);
    render(<App />);

    expect(await screen.findByText('Test Product')).toBeInTheDocument();
    expect(await screen.findByText('8/10')).toBeInTheDocument();
    expect(await screen.findByText('Better Product')).toBeInTheDocument();
  });
});