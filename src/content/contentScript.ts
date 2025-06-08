// Viridis content script  ──────────────────────────────────────────────
// Injected on every page. Detects clothing product pages, shows a toast,
// and notifies the background service-worker.

import { getRuleForCurrentSite, SiteRule } from './siteRules';
import './content.css';

/**
 * Add-to-cart related text variants
 */
const ADD_TO_CART_VARIANTS = [
  'add to cart',
  'add to bag',
  'add to basket',
  'buy now',
  'purchase',
  'order now',
  'select size first',
];

/**
 * Check for buttons or links that match common cart wording.
 */
function hasAddToCartButton(): boolean {
  const buttons = Array.from(document.querySelectorAll('button, a'));
  return buttons.some(btn => {
    const text = btn.textContent?.toLowerCase().trim() || '';
    return ADD_TO_CART_VARIANTS.some(variant => text.includes(variant));
  });
}

/**
 * Check for size selectors on the page.
 */
function hasSizeSelector(): boolean {
  const sizePatterns = ['s', 'm', 'l', 'small', 'medium', 'large'];
  const sizeElements = Array.from(document.querySelectorAll('select, button, label, span, div'));

  return sizeElements.some(el => {
    const text = el.textContent?.toLowerCase().trim() || '';
    return sizePatterns.some(size => new RegExp(`\\b${size}\\b`).test(text));
  });
}

/**
 * Check for the presence of customer reviews or ratings.
 */
function hasReviewsOrRatings(): boolean {
  const reviewKeywords = ['review', 'reviews', 'rating', 'ratings', 'stars'];
  const elements = Array.from(document.querySelectorAll('div, span, section, a'));

  return elements.some(el => {
    const text = el.textContent?.toLowerCase().trim() || '';
    return reviewKeywords.some(keyword => text.includes(keyword));
  });
}

/**
 * The main detection engine for the content script.
 */
class ProductDetectionEngine {
  private currentRule: SiteRule;
  private lastProcessedUrl: string = '';

  constructor() {
    this.currentRule = getRuleForCurrentSite();
    console.debug(`Viridis: Using rule for host: ${this.currentRule.host}`);
  }

  public processPage(): void {
    const url = new URL(window.location.href);

    if (url.href === this.lastProcessedUrl) {
      return;
    }

    const isLikelyProductPage =
      hasAddToCartButton() &&
      hasSizeSelector() &&
      hasReviewsOrRatings();

    if (this.currentRule.isProductPage(url) && isLikelyProductPage) {
      console.debug('Viridis: Product page detected.');

      const productInfo = this.currentRule.getProductInfo();

      if (productInfo) {
        console.debug('Viridis: Extracted product info:', productInfo);
        chrome.runtime.sendMessage({
          type: 'VIRIDIS_PRODUCT_VIEW',
          payload: productInfo,
        });
        this.lastProcessedUrl = url.href;
      } else {
        console.debug('Viridis: Could not extract product info despite positive detection.');
      }
    } else {
      console.debug('Viridis: Not a product page.');
      this.lastProcessedUrl = url.href;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Main Execution Logic                                               */
/* ------------------------------------------------------------------ */

const engine = new ProductDetectionEngine();

setTimeout(() => engine.processPage(), 500);

const observer = new MutationObserver(() => {
  if (window.location.href !== engine['lastProcessedUrl']) {
    engine.processPage();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});
