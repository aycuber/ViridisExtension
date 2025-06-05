import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Content Script', () => {
  beforeEach(() => {
    // Reset the DOM
    document.body.innerHTML = '';
    // Mock chrome API
    global.chrome = {
      runtime: {
        sendMessage: vi.fn(),
        lastError: null
      }
    } as any;
  });

  it('should detect clothing product pages', () => {
    // Set up test DOM
    document.title = 'Men\'s Cotton T-Shirt';
    const h1 = document.createElement('h1');
    h1.textContent = 'Men\'s Cotton T-Shirt';
    document.body.appendChild(h1);

    const price = document.createElement('span');
    price.setAttribute('itemprop', 'price');
    price.textContent = '$19.99';
    document.body.appendChild(price);

    // Import and run the content script
    const script = await import('../contentScript');
    
    // Check if message was sent to background
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      {
        type: 'VIRIDIS_PRODUCT_VIEW',
        payload: {
          title: 'Men\'s Cotton T-Shirt',
          price: '$19.99',
          url: expect.any(String)
        }
      },
      expect.any(Function)
    );
  });

  it('should not process non-clothing pages', () => {
    document.title = 'Kitchen Appliances';
    
    const script = await import('../contentScript');
    
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});