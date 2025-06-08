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

/**
 * The generic rule for sites without a specific configuration.
 * Relies heavily on JSON-LD structured data as a reliable indicator.
 */
export const genericRule: SiteRule = {
    host: 'generic',
    isProductPage: () => {
        const hasProductSchema = !!getJsonLdProduct();
        const hasPrice = hasPriceElement();
        const hasCartButton = hasAddToCartButton();
        
        console.debug(`[Viridis Generic Rule] Detection check: 
          - Has Product Schema: ${hasProductSchema}
          - Has Price Element: ${hasPrice}
          - Has Add-to-Cart Button: ${hasCartButton}`);

        return hasProductSchema && hasPrice && hasCartButton;
    },
    getProductInfo: () => {
        const product = getJsonLdProduct();
        if(!product || !product.name) return null;
        
        const price = product.offers?.price ??
                      (Array.isArray(product.offers) && product.offers[0]?.price) ??
                      '';

        return {
            title: product.name,
            url: window.location.href,
            site: window.location.hostname,
            price: String(price) || undefined,
            brand: product.brand?.name || undefined,
            materials: product.material || undefined
        }
    }
}

/**
 * Finds the appropriate rule for the current website.
 */
export function getRuleForCurrentSite(): SiteRule {
  const hostname = window.location.hostname;
  const rule = siteRules.find(rule => hostname.includes(rule.host)) ?? genericRule;
  console.debug(`[Viridis] Using detection rule for host: ${rule.host}`);
  return rule;
} 