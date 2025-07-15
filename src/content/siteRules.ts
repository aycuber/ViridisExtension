import { ProductInfo } from '../types/product';

/**
 * A rule defining how to detect and extract product info from a specific site.
 */
export interface SiteRule {
  /** The hostname this rule applies to. */
  host: string;
  /** A function to check if the current page is a product page based on URL and DOM. */
  isProductPage: (url: URL) => boolean;
  /** A function to extract product information from the page. */
  getProductInfo: () => ProductInfo | null;
}


// --- Helper Functions for DOM Validation ---

const getJsonLdProduct = (): any | null => {
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || '{}');
      if (data['@type'] === 'Product') {
        // Ensure it's not a list of products in a graph
        if (Array.isArray(data['@graph']) && data['@graph'].some((item: any) => item['@type'] === 'Product')) {
            const products = data['@graph'].filter((item: any) => item['@type'] === 'Product');
            if(products.length === 1) return products[0];
            else continue; // It's a list, not a single product
        }
        return data;
      }
    } catch {}
  }
  return null;
};

const querySelector = (selector: string): Element | null => document.querySelector(selector);
const queryText = (selector: string): string | undefined => document.querySelector(selector)?.textContent?.trim();

const hasPriceElement = (): boolean => {
    const priceSelectors = '[itemprop*="price"], [class*="price"], [id*="price"]';
    if (document.querySelector(priceSelectors)) return true;

    // Fallback to text search for currency symbols
    const priceRegex = /[\$€£¥]\s*\d+([.,]\d+)?/;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
        const text = node.textContent || '';
        if (priceRegex.test(text)) return true;
    }
    return false;
}

const hasAddToCartButton = (): boolean => {
    const buttonTextRegex = /add to (cart|bag|basket)/i;
    const buttons = document.querySelectorAll('button, input[type="submit"], a[role="button"]');
    for (const button of buttons) {
        if ('textContent' in button && button.textContent && buttonTextRegex.test(button.textContent)) {
            return true;
        }
    }
    return false;
}

// --- Site-Specific Rules ---

const siteRules: SiteRule[] = [
  /**
   * Amazon: Product URLs contain /dp/{ASIN} or /gp/product/{ASIN}.
   * They have strong structured data and clear element IDs.
   */
  {
    host: 'amazon.com',
    isProductPage: (url) => {
      const isProductPath = /^\/(dp|gp\/product)\/[A-Z0-9]{10}/.test(url.pathname);
      return isProductPath && !!querySelector('#productTitle') && !!querySelector('#add-to-cart-button');
    },
    getProductInfo: () => {
      const title = queryText('#productTitle');
      if (!title) return null;
      return {
        title,
        url: window.location.href,
        site: 'amazon.com',
        price: queryText('.a-price .a-offscreen') ?? undefined,
        brand: queryText('#bylineInfo') ?? undefined,
      };
    },
  },
  /**
   * Walmart: Product URLs follow the /ip/{product-name}/{product-id} pattern.
   * They also use itemprop attributes for data.
   */
  {
    host: 'walmart.com',
    isProductPage: (url) => {
      return /^\/ip\//.test(url.pathname) && !!querySelector('h1[itemprop="name"]');
    },
    getProductInfo: () => {
      const title = queryText('h1[itemprop="name"]');
      if (!title) return null;
      return {
        title,
        url: window.location.href,
        site: 'walmart.com',
        price: queryText('span[itemprop="price"]') ?? undefined,
        brand: queryText('a[itemprop="brand"]') ?? undefined
      };
    },
  },
  /**
   * Etsy: Listing URLs are very consistent: /listing/{id}/{name}.
   * DOM relies on specific data attributes and class structures.
   */
  {
    host: 'etsy.com',
    isProductPage: (url) => {
      return /^\/listing\//.test(url.pathname) && !!querySelector('div[data-buy-box]');
    },
    getProductInfo: () => {
      const title = queryText('h1[data-buy-box-listing-title]');
      if(!title) return null;
      return {
        title,
        url: window.location.href,
        site: 'etsy.com',
        price: document.querySelector('.wt-display-flex-xs p.wt-text-title-03')?.textContent?.trim(),
      }
    }
  },
  /**
   * Best Buy: URLs end in .p?skuId={id}.
   * DOM uses specific classes for key info.
   */
  {
      host: 'bestbuy.com',
      isProductPage: (url) => {
          return /\.p$/.test(url.pathname) && !!url.searchParams.get('skuId');
      },
      getProductInfo: () => {
          const title = queryText('h1.heading-5');
          if(!title) return null;
          return {
              title,
              url: window.location.href,
              site: 'bestbuy.com',
              price: queryText('.priceView-hero-price span') ?? undefined,
              brand: queryText('.product-brand a') ?? undefined,
          }
      }
  }
];

// ** bring in your content-script size + review checks **
const hasSizeSelector = (): boolean => {
  const sizePatterns = ['s','m','l','small','medium','large'];
  return Array.from(document.querySelectorAll('button, select, label, span, div'))
    .some(el => sizePatterns.some(sz => new RegExp(`\\b${sz}\\b`, 'i').test(el.textContent||'')));
};
const hasReviewsOrRatings = (): boolean => {
  const reviewKeywords = ['review','rating','stars'];
  return Array.from(document.querySelectorAll('div, span, section, a'))
    .some(el => reviewKeywords.some(kw => (el.textContent||'').toLowerCase().includes(kw)));
};

export const genericRule: SiteRule = {
  host: 'generic',
  // drop the JSON-LD requirement, just use the same heuristics as your contentScript
  isProductPage: () => {
    const ok = hasAddToCartButton()
            && hasSizeSelector()
            && hasReviewsOrRatings()
            && hasPriceElement();
    console.debug('[Viridis Generic] productPage?', ok);
    return ok;
  },
  // if you can’t parse JSON-LD, just fall back to H1 or document.title
  getProductInfo: (): ProductInfo | null => {
    // try JSON-LD first
    const ld = getJsonLdProduct();
    let title = ld?.name;
    if (!title) {
      title = document.querySelector('h1')?.textContent?.trim() || document.title;
    }
    if (!title) return null;
    // try price from JSON-LD or page
    const price = ld?.offers?.price
      ?? document.querySelector('[itemprop*="price"], .price, #price')?.textContent?.trim();
    return {
      title,
      url: window.location.href,
      site: window.location.hostname,
      price: price || undefined,
      brand: ld?.brand?.name || undefined,
    };
  }
};

/**
 * Finds the appropriate rule for the current website.
 */
export function getRuleForCurrentSite(): SiteRule {
  const hostname = window.location.hostname;
  const rule = siteRules.find(rule => hostname.includes(rule.host)) ?? genericRule;
  console.debug(`[Viridis] Using detection rule for host: ${rule.host}`);
  return rule;
} 