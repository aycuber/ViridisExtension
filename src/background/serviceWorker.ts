// src/background/serviceWorker.ts
// Manifest V3 service-worker (type module)

import lcaMaterials from './lcaData';

/* ----------  Types  ---------- */
export interface ProductData {
  title: string;
  price?: string;
  url: string;
}

export interface ProductInfo extends ProductData {
  description?: string;
  materials?: string;
  brand?: string;
  site?: string;
}

export interface AlternativeProduct {
  brand: string;
  url: string;
  price_estimate?: string;
  type: 'sustainable' | 'second-hand';
  note?: string;
}

// This is the structure that will be stored and passed to the popup
export interface ViridisStorageData {
  product: ProductData;
  score: number;
  breakdown: Record<string, string>; // Values are always plain strings
  alternatives: AlternativeProduct[];
  timestamp: number;
}

/* ----------  Config  ---------- */
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

/* ----------  Helper Functions  ---------- */
function ensureString(x: any): string {
  return x == null ? '' : String(x).trim();
}

async function getClothingCategory(productTitle: string, apiKey: string): Promise<string> {
  if (!apiKey) {
    console.warn('OpenAI API key not configured.');
    return '';
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano-2025-04-14",
        messages: [
          {
            role: "system",
            content: "You are an expert at categorizing clothing items. Your task is to identify the most general, single-word clothing category from a product title. Examples: hoodie, jeans, sweater. Do not include color, brand, style, or material."
          },
          {
            role: "user",
            content: `Extract the single-word clothing category from this title: "${productTitle}"`
          }
        ],
        temperature: 0,
        max_tokens: 10
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('OpenAI API error:', response.status, errorBody);
      return '';
    }

    const data = await response.json();
    const category = data.choices?.[0]?.message?.content.trim().toLowerCase() || '';
    if (category && !category.includes(' ')) {
      return category;
    } else {
      console.warn('Received invalid category from OpenAI:', category);
      return '';
    }

  } catch (error) {
    console.error('Error fetching clothing category:', error);
    return '';
  }
}

/* ----------  Deep analysis via OpenAI  ---------- */
async function analyzeSustainability(product: ProductInfo): Promise<ViridisStorageData> {
  try {
    if (!OPENAI_API_KEY) {
      console.warn('OpenAI API key is not configured.');
      return {
        product,
        score: 0,
        breakdown: { Error: "Analysis failed: OpenAI API key not configured." },
        alternatives: [],
        timestamp: Date.now()
      };
    }

    let referenceBlock = "Reference LCA Data (USE ONLY THIS DATA for numeric facts and citations):\n\n";
    lcaMaterials.forEach(item => {
      referenceBlock += `Material: ${item.material}
    - Carbon: ${item.carbonFootprint}
    - End-of-Life: ${item.endOfLife}
    - Sourcing: ${item.sourcing}
    - Water: ${item.waterUse}
    - Score: ${item.score}
    - Ref: _${item.citation}_\n\n`;
    });

    const productInfoForPrompt = [
      `- Title: ${ensureString(product.title)}`,
      product.price ? `- Price: ${ensureString(product.price)}` : null,
      product.materials ? `- Materials: ${ensureString(product.materials)}` : null,
      product.brand ? `- Brand: ${ensureString(product.brand)}` : null,
      product.description && product.description.length > 10 ? `- Description (snippet): ${ensureString(product.description).substring(0, 100)}...` : null,
      `- URL: ${ensureString(product.url)}`
    ].filter(Boolean).join('\n');

    const productInfoString = `Product Information (for the specific item being analyzed):
${productInfoForPrompt}
`;

    const category = await getClothingCategory(product.title, OPENAI_API_KEY);

    const alternatives: AlternativeProduct[] = [];
    if (category) {
      alternatives.push({
        brand: 'Poshmark',
        url: `https://poshmark.com/search?query=${category}`,
        type: 'second-hand',
        note: 'A large marketplace for new and used clothing.'
      });
    }

    const instructionBlock = `
    Using ONLY the Reference LCA Data above, analyze THIS SPECIFIC PRODUCT’s sustainability based on the Product Information provided.
    All numeric facts and citations MUST come from the Reference LCA Data.
    You may integrate your general domain knowledge to interpret or contextualize, but you cannot cite any sources other than those in the Reference LCA Data.
    Return exactly one JSON object with these keys:
      • "score": integer 0–100, calculated based on the dataset’s scores and the specific product’s characteristics.
      • "breakdown": an object containing exactly 3 key-value pairs. Each key should be a concise identifier for one of the TOP 3 most important sustainability factors (e.g., "carbon_footprint", "water_use", "end_of_life").
        Each value must be a STRING that:
          – Includes at least one numeric fact from the Reference LCA Data.
          – Ends with a citation in the format: Title. Author, Year. , matching the dataset’s citation field.
    Do NOT include any URLs or external references.
    Output ONLY the JSON object—no additional text, markdown, or explanation.
    `;
    
    const userPrompt = `${referenceBlock}\n${productInfoString}\n${instructionBlock}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano-2025-04-14",
        messages: [
          { role: "system", content: "You are a sustainability expert. Output exactly one JSON object as instructed." },
          { role: "user", content: userPrompt }
        ],
        temperature: 0
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('OpenAI API error:', response.status, errorBody);
      throw new Error("OpenAI API request failed: " + response.status + " " + errorBody);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    let parsed: { score: number; breakdown: Record<string, any> };

    try {
      if (!rawContent) throw new Error("No content in AI response");
      const jsonMatch = rawContent.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        parsed = JSON.parse(ensureString(jsonMatch[1]));
      } else {
        parsed = JSON.parse(ensureString(rawContent));
      }
    } catch (e: any) {
      console.error('Failed to parse JSON response from OpenAI:', rawContent, e);
      return {
        product,
        score: 0,
        breakdown: { Error: "Invalid JSON from model: " + e.message },
        alternatives: [],
        timestamp: Date.now()
      };
    }

    const cleanedBreakdown: Record<string, string> = {};
    for (const [factor, value] of Object.entries(parsed.breakdown || {})) {
      if (typeof value === "string") {
        cleanedBreakdown[factor] = ensureString(value);
      } else if (value && typeof value === "object") {
        const explanation = typeof (value as any).explanation === "string"
          ? ensureString((value as any).explanation)
          : "";
        const citation = typeof (value as any).citation === "string"
          ? ensureString((value as any).citation)
          : "";
        cleanedBreakdown[factor] = explanation + (citation ? ` [${citation}]` : "");
      } else if (value != null) {
        cleanedBreakdown[factor] = ensureString(String(value));
      } else {
        cleanedBreakdown[factor] = "";
      }
      cleanedBreakdown[factor] = cleanedBreakdown[factor].trim();
    }

    if (Object.keys(cleanedBreakdown).length === 0 && !parsed.score) {
      console.warn("[SW] Cleaned breakdown empty and score is 0. Raw parsed data:", parsed);
      if (!cleanedBreakdown.Error) {
        cleanedBreakdown.Error = "AI response structure was not as expected or content was missing.";
      }
    }

    return {
      product,
      score: typeof parsed.score === 'number' ? parsed.score : 0,
      breakdown: cleanedBreakdown,
      alternatives,
      timestamp: Date.now()
    };

  } catch (error: any) {
    console.error('Error in analyzeSustainability:', error);
    return {
      product,
      score: 0,
      breakdown: { Error: "Analysis failed: " + (error.message || String(error)) },
      alternatives: [],
      timestamp: Date.now()
    };
  }
}

/* ----------  Handle product pages  ---------- */
async function handleProductView(
  productDataFromContentScript: ProductData,
  tabId: number,
  sendResponse: (resp: { ok: boolean; error?: string }) => void
): Promise<void> {
  console.debug('[SW] handleProductView: received', productDataFromContentScript, 'for tab', tabId);

  let viridisDataToStore: ViridisStorageData;

  try {
    await chrome.action.enable(tabId);
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#FFA500' });
    await chrome.action.setBadgeText({ tabId, text: '...' });

    let siteName = 'Unknown Site';
    try {
      const productUrl = new URL(productDataFromContentScript.url);
      siteName = productUrl.hostname.replace(/^www\./, '');
    } catch {}

    const productInfoForAnalysis: ProductInfo = {
      ...productDataFromContentScript,
      description: ensureString((productDataFromContentScript as any).description),
      materials: ensureString((productDataFromContentScript as any).materials),
      brand: ensureString((productDataFromContentScript as any).brand),
      site: siteName
    };

    viridisDataToStore = await analyzeSustainability(productInfoForAnalysis);
    await chrome.storage.local.set({ viridisLast: viridisDataToStore });

    const scoreForBadge = viridisDataToStore.score.toString();
    const badgeColor = viridisDataToStore.score >= 75 ? '#22C55E' : viridisDataToStore.score >= 50 ? '#F59E0B' : '#EF4444';
    await chrome.action.setBadgeBackgroundColor({ tabId, color: badgeColor });
    await chrome.action.setBadgeText({ tabId, text: scoreForBadge });

    sendResponse({ ok: true });

  } catch (err: any) {
    const errorMessage = err.message || String(err);
    viridisDataToStore = {
      product: productDataFromContentScript,
      score: 0,
      breakdown: { Error: "Product analysis failed: " + errorMessage },
      alternatives: [],
      timestamp: Date.now()
    };
    await chrome.storage.local.set({ viridisLast: viridisDataToStore });
    await chrome.action.setBadgeText({ tabId, text: 'ERR' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#FF0000' });
    sendResponse({ ok: false, error: errorMessage });

  } finally {
    try { await chrome.action.openPopup(); } catch {}
  }
}

/* ----------  Message router  ---------- */
chrome.runtime.onMessage.addListener(
  (
    msg: { type: string; payload?: any },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ): boolean => {
    const tabId = sender.tab?.id;

    if (msg.type === 'VIRIDIS_PRODUCT_VIEW' && tabId) {
      const productPayload = msg.payload as ProductData;
      handleProductView(productPayload, tabId, sendResponse);
      return true;
    }

    if (msg.type === 'GET_SUSTAINABILITY_SCORE') {
      const productInfo = msg.payload as ProductInfo;
      analyzeSustainability(productInfo)
        .then(apiResponse => {
          sendResponse({
            success: true,
            score: apiResponse.score,
            breakdown: apiResponse.breakdown,
            alternatives: apiResponse.alternatives
          });
        })
        .catch(error => {
          sendResponse({
            success: false,
            error: error.message,
            breakdown: { "Analysis Error": error.message },
            alternatives: []
          });
        });
      return true;
    }

    return false;
  }
);

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    console.log("Viridis extension installed!");
  }
});

console.log("Viridis Service Worker initialized.");
