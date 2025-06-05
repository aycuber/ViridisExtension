// Viridis content script  ──────────────────────────────────────────────
// Injected on every page. Detects clothing product pages, shows a toast,
// and notifies the background service-worker.

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

import { ProductInfo } from '../types/product';
import './content.css';

interface ProductData {
    title: string;
    price: string;
    url: string;
  }
  
  /* ------------------------------------------------------------------ */
  /* Visual toast                                                        */
  /* ------------------------------------------------------------------ */
  
  function showDetectionNotification() {
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #22c55e;
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: system-ui,-apple-system,sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,.15);
      z-index: 999999;
      animation: slideIn .3s ease-out;
    `;
    el.textContent = '🌱 Viridis: Product detected!';
  
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn   {from{transform:translateX(100%);opacity:0}
                            to  {transform:translateX(0);opacity:1}}
      @keyframes slideOut  {to{transform:translateX(100%);opacity:0}}
    `;
    document.head.appendChild(style);
    document.body.appendChild(el);
  
    setTimeout(() => {
      el.style.animation = 'slideOut .3s ease-in forwards';
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }
  
  /* ------------------------------------------------------------------ */
  /* Detection helpers                                                   */
  /* ------------------------------------------------------------------ */
  
  const clothingRe =
    /clothing|apparel|shirt|dress|hoodie|jacket|jeans|pants|sneaker|shoe/i;
  
  function isClothingProductPage(): boolean {
    const keywordHit =
      clothingRe.test(location.href) || clothingRe.test(document.title);
  
    const blocks = document.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"]'
    );
  
    for (const el of blocks) {
      try {
        const data = JSON.parse(el.textContent || '{}');
        if (data['@type'] !== 'Product') continue;
        const cat = String(data.category ?? data.productType ?? '');
        // Loosen: proceed even if the category is generic ("Outerwear")
        return keywordHit || clothingRe.test(cat.toLowerCase());
      } catch {
        /* ignore malformed JSON */
      }
    }
    return keywordHit;
  }
  
  function extractProductInfo(): ProductData {
    const blocks = document.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"]'
    );
    for (const el of blocks) {
      try {
        const data = JSON.parse(el.textContent || '{}');
        if (data['@type'] === 'Product') {
          const price =
            data.offers?.price ??
            (typeof data.offers === 'object' ? data.offers.price : '');
          return {
            title: data.name || document.title,
            price: price ? `$${price}` : '',
            url: location.href
          };
        }
      } catch {
        /* ignore */
      }
    }
  
    return {
      title: document.querySelector('h1')?.textContent?.trim() || document.title,
      price:
        document
          .querySelector('[itemprop="price"], .price')
          ?.textContent?.trim() || '',
      url: location.href
    };
  }
  
  /* ------------------------------------------------------------------ */
  /* Main logic                                                          */
  /* ------------------------------------------------------------------ */
  
  let lastProcessedUrl = '';
  
  function processPage() {
    if (location.href === lastProcessedUrl) return;
    if (!isClothingProductPage()) return;
  
    const product = extractProductInfo();
    if (!product.title) return;
  
    console.debug('Viridis: Detected clothing product', product);
    showDetectionNotification();
  
    chrome.runtime.sendMessage(
      { type: 'VIRIDIS_PRODUCT_VIEW', payload: product },
      /* options */ undefined,
      (resp?: { ok?: boolean }) => {
        if (resp?.ok) {
          lastProcessedUrl = location.href;
          console.debug('Viridis: Product info sent successfully');
        } else {
          console.error('Viridis: Background response not ok', resp);
        }
      }
    );
  }
  
  /* ------------------------------------------------------------------ */
  /* Run on load + watch for SPA URL changes                             */
  /* ------------------------------------------------------------------ */
  
  processPage();
  
  let prevUrl = location.href;
  const obs = new MutationObserver(() => {
    if (location.href !== prevUrl) {
      prevUrl = location.href;
      processPage();
    }
  });
  obs.observe(document, { childList: true, subtree: true });
  addEventListener('beforeunload', () => obs.disconnect());
  
interface SiteParser {
  getProductInfo(): ProductInfo | null;
}

class AmazonParser implements SiteParser {
  getProductInfo(): ProductInfo | null {
    const title = document.getElementById('productTitle')?.textContent?.trim();
    const description = document.getElementById('feature-bullets')?.textContent?.trim();
    const materials = document.querySelector('.fabric-type')?.textContent?.trim();
    
    if (!title) return null;

    return {
      title,
      description,
      materials,
      url: window.location.href,
      site: 'amazon',
      price: this.getPrice(),
      brand: this.getBrand()
    };
  }

  private getPrice(): string | undefined {
    const priceElement = document.querySelector('.a-price-whole');
    return priceElement?.textContent?.trim();
  }

  private getBrand(): string | undefined {
    const brandElement = document.querySelector('#bylineInfo');
    return brandElement?.textContent?.trim();
  }
}

// Add more site parsers here...

class ProductDetector {
  private static readonly SUPPORTED_SITES: Record<string, new () => SiteParser> = {
    'amazon.com': AmazonParser,
    // Add more sites here...
  };

  static detectProduct(): void {
    const hostname = window.location.hostname;
    const site = Object.keys(this.SUPPORTED_SITES).find(s => hostname.includes(s));
    
    if (!site) return;

    const parser = new this.SUPPORTED_SITES[site]();
    const productInfo = parser.getProductInfo();

    if (productInfo) {
      this.showSustainabilityScore(productInfo);
    }
  }

  private static async showSustainabilityScore(productInfo: ProductInfo): Promise<void> {
    // Create floating UI element
    const container = document.createElement('div');
    container.id = 'viridis-score-container';
    container.innerHTML = `
      <div class="viridis-score-popup">
        <div class="viridis-header">
          <img src="${chrome.runtime.getURL('public/icon128.png')}" alt="Viridis" width="24" height="24">
          <h2>Analyzing sustainability...</h2>
        </div>
        <div class="viridis-content">
          <div class="viridis-spinner"></div>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    try {
      // Send message to background script to get sustainability score
      const response = await chrome.runtime.sendMessage({
        type: 'GET_SUSTAINABILITY_SCORE',
        data: productInfo
      });

      if (response.success) {
        this.updateScoreDisplay(container, response.score, response.breakdown);
      } else {
        throw new Error('Failed to get sustainability score');
      }
    } catch (error) {
      console.error('Viridis error:', error);
      const content = container.querySelector('.viridis-content');
      if (content) {
        content.innerHTML = 'Failed to analyze product sustainability.';
      }
    }
  }

  private static updateScoreDisplay(
    container: HTMLElement, 
    score: number, 
    breakdown: { [key: string]: string }
  ): void {
    const content = container.querySelector('.viridis-content');
    if (!content) return;

    content.innerHTML = `
      <div class="viridis-score">
        <div class="score-circle">
          <span class="score-number">${score}</span>
          <span class="score-label">Eco Score</span>
        </div>
        <div class="score-breakdown">
          ${Object.entries(breakdown)
            .map(([key, value]) => `
              <div class="breakdown-item">
                <span class="breakdown-key">${key}:</span>
                <span class="breakdown-value">${value}</span>
              </div>
            `).join('')}
        </div>
      </div>
    `;
  }
}

// Start detection when page loads
document.addEventListener('DOMContentLoaded', () => {
  ProductDetector.detectProduct();
});

// Re-run detection on URL changes (for single-page apps)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    ProductDetector.detectProduct();
  }
}).observe(document, { subtree: true, childList: true });
  