interface ProductDataForFAB {
  title: string;
  price?: string;
  url: string;
  materials?: string; 
  brand?: string;
  description?: string; 
}

// Placeholder: You MUST implement robust, site-specific logic here.
const isClothingPage = (): boolean => {
  const title = document.title.toLowerCase();
  const keywords = ['shirt', 'dress', 'jeans', 'jacket', 'hoodie', 'sweater', 'clothing', 'apparel'];
  if (keywords.some(keyword => title.includes(keyword))) {
    console.log('[Viridis CS] Detected potential clothing page based on title.');
    return true;
  }
  console.log('[Viridis CS] Not detected as a clothing page.');
  return false;
};

// Placeholder: You MUST implement robust, site-specific logic here.
const extractProductData = (): ProductDataForFAB | null => {
  const titleElement = document.querySelector('h1');
  const title = titleElement ? titleElement.innerText.trim() : document.title;
  const url = window.location.href;
  let price: string | undefined = undefined;
  const priceSelectors = [
    '.price', '.product-price', '.sale-price', 
    '[data-testid*="price" i]', '[class*="price" i]', '[id*="price" i]',
    'span[itemprop="price"]', 'div[itemprop="price"]',
  ];
  for (const selector of priceSelectors) {
    const priceEl = document.querySelector(selector) as HTMLElement;
    if (priceEl) {
      price = priceEl.innerText.trim().match(/[\$\€\£]?\d+[.,]?\d*/)?.[0];
      if (price) break;
    }
  }
  let brand: string | undefined = undefined;
  const brandMeta = document.querySelector('meta[property="og:brand"], meta[name="twitter:brand"], meta[itemprop="brand"]');
  if (brandMeta) {
    brand = (brandMeta as HTMLMetaElement).content;
  } else {
    const brandSelectors = ['[data-testid*="brand" i]', '[class*="brand" i]', '.pdp-brand-name', '.product-brand'];
    for (const selector of brandSelectors) {
        const brandEl = document.querySelector(selector) as HTMLElement;
        if (brandEl) {
            brand = brandEl.innerText.trim();
            if (brand) break;
        }
    }
  }
  let materials: string | undefined = undefined;
  const materialKeywords = ['material', 'fabric', 'composition', 'content'];
  const allTextElements = Array.from(document.querySelectorAll('p, span, div, li'));
  for (const el of allTextElements) {
    const text = (el as HTMLElement).innerText?.toLowerCase();
    if (text && materialKeywords.some(kw => text.includes(kw))) {
        if (text.length < 200 && text.length > 5) {
            materials = (el as HTMLElement).innerText.trim();
            break; 
        }
    }
  }
  let description: string | undefined = undefined;
  const descriptionMeta = document.querySelector('meta[property="og:description"], meta[name="description"], meta[name="twitter:description"]');
  if (descriptionMeta) {
    description = (descriptionMeta as HTMLMetaElement).content;
  } else {
    const descSelectors = ['.product-description', '#description', '[data-testid*="description"]' ];
    for (const selector of descSelectors) {
        const descEl = document.querySelector(selector) as HTMLElement;
        if (descEl) {
            description = descEl.innerText.trim().substring(0, 500);
            if (description) break;
        }
    }
  }
  if (!title || !url) {
    console.warn('[Viridis CS] Could not extract essential product data (title or URL).');
    return null;
  }
  return { title, price, url, materials, brand, description };
};

function createFloatingButton() {
  if (document.getElementById('viridis-fab-container')) {
    return;
  }
  const fabContainer = document.createElement('div');
  fabContainer.id = 'viridis-fab-container';
  document.body.appendChild(fabContainer);
  const shadowRoot = fabContainer.attachShadow({ mode: 'open' });
  const viridisButton = document.createElement('button');
  viridisButton.id = 'viridis-button';
  viridisButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: white;">
      <path d="M11 20A7 7 0 0 1 4 13H2a9 9 0 0 0 18 0h-2a7 7 0 0 1-7 7Z"></path>
      <path d="M12 12A3 3 0 0 0 9 9v1a3 3 0 0 0 6 0V9a3 3 0 0 0-3-3Z"></path>
    </svg>
  `;
  viridisButton.title = "Analyze with Viridis";
  const style = document.createElement('style');
  style.textContent = `
    #viridis-button {
      position: fixed;
      bottom: 25px;
      right: 25px;
      width: 56px;
      height: 56px;
      background-color: #22c55e;
      color: white;
      border-radius: 50%;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border: none;
      outline: none;
      transition: background-color 0.2s ease-in-out, transform 0.15s ease-in-out;
    }
    #viridis-button:hover {
      background-color: #16a34a;
      transform: scale(1.05);
    }
    #viridis-button:active {
        transform: scale(0.95);
    }
  `;
  shadowRoot.appendChild(style);
  shadowRoot.appendChild(viridisButton);

  viridisButton.addEventListener('click', async () => {
    console.log('[Viridis CS] Viridis FAB clicked!');
    try {
      const productData = extractProductData();
      if (productData && productData.url && productData.title) {
        console.log('[Viridis CS] Sending VIRIDIS_PRODUCT_VIEW with payload:', productData);
        
        const messageToSW = { type: 'VIRIDIS_PRODUCT_VIEW', payload: productData };

        // Explicitly define the expected signature type for sendMessage
        type SendMessageSignature = (
          message: any, 
          responseCallback?: (response: any) => void
        ) => void;

        // Use type assertion on chrome.runtime.sendMessage
        (chrome.runtime.sendMessage as SendMessageSignature)(messageToSW, function(response: any) {
          const errorIfAny = (chrome.runtime as any).lastError;
          if (errorIfAny && typeof errorIfAny.message === 'string') {
            console.error('[Viridis CS] Error sending message:', errorIfAny.message);
          } else {
            console.log('[Viridis CS] Message sent, response:', response);
          }
        });

      } else {
        console.warn('[Viridis CS] Could not extract sufficient product data to send.');
        alert("Viridis couldn't automatically detect product details on this page. Please navigate to a clear product page or try again.");
      }
    } catch (error) {
        console.error('[Viridis CS] Error on FAB click:', error);
        alert("An unexpected error occurred with the Viridis button.");
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (isClothingPage()) createFloatingButton();
  });
} else {
  if (isClothingPage()) createFloatingButton();
}

const handleNavigation = () => {
  setTimeout(() => {
    const fabContainer = document.getElementById('viridis-fab-container');
    if (isClothingPage()) {
      if (!fabContainer) createFloatingButton();
    } else {
      if (fabContainer) fabContainer.remove();
    }
  }, 500);
};

window.addEventListener('popstate', handleNavigation);
window.addEventListener('hashchange', handleNavigation);

let oldHrefForObserver = document.location.href;
const bodyMutationObserver = new MutationObserver((mutations) => {
  mutations.forEach(() => {
    if (oldHrefForObserver !== document.location.href) {
      oldHrefForObserver = document.location.href;
      console.log('[Viridis CS] URL changed to:', document.location.href, 'via MutationObserver');
      handleNavigation();
    }
  });
});

if (document.body) {
    bodyMutationObserver.observe(document.body, { childList: true, subtree: true });
} else {
    document.addEventListener('DOMContentLoaded', () => {
        if(document.body) bodyMutationObserver.observe(document.body, { childList: true, subtree: true });
    });
}

console.log('[Viridis CS] Content script loaded and initialized.'); 