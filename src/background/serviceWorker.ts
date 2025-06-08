// src/background/serviceWorker.ts
// Manifest V3 service-worker (type module)

/* ----------  Approved Sources ---------- */
const approvedSources: string[] = [
  "https://libstore.ugent.be/fulltxt/RUG01/003/200/778/RUG01-003200778_2024_0001_AC.pdf",
  "https://link.springer.com/article/10.1007/s11367-013-0626-9",
  "https://link.springer.com/article/10.1186/s42825-020-00035-y",
  "https://www.sciencedirect.com/science/article/abs/pii/B9780081001691000101",
  "https://www.mdpi.com/2079-9276/11/5/41",
  "https://www.sciencedirect.com/science/article/pii/S0959652623020358",
  "https://www.diva-portal.org/smash/record.jsf?pid=diva2%3A1299372&dswid=-6736",
  "https://link.springer.com/chapter/10.1007/978-981-97-0910-6_20",
  "https://academic.oup.com/ieam/article/20/6/2347/7897281",
  "https://link.springer.com/article/10.1007/s11367-021-01916-y",
  "https://link.springer.com/chapter/10.1007/978-3-030-22018-1_1",
  "https://www.sciencedirect.com/science/article/abs/pii/S1359835X03002951",
  "https://www.mdpi.com/2504-477X/8/6/196",
  "https://ucalgary.scholaris.ca/items/e892be2a-ab85-4ece-bc38-b457a74e269c",
  "https://www.mdpi.com/2071-1050/15/9/7670",
  "https://www.sciencedirect.com/science/article/abs/pii/S0959652614001346",
  "https://link.springer.com/article/10.1007/s11367-015-1023-3",
  "https://link.springer.com/chapter/10.1007/978-981-13-9578-9_1",
  "https://link.springer.com/article/10.1007/s11367-014-0731-4",
  "https://www.sciencedirect.com/science/article/abs/pii/S0959652620352215",
  "https://www.revistaindustriatextila.ro/images/2021/1/03%20FANGLI%20CHEN%20Industria%20Textila%201_2021.pdf",
  "https://www.sciencedirect.com/science/article/abs/pii/S0959652621042098",
  "https://www.mdpi.com/2073-4360/13/23/4229",
  "https://www.sciencedirect.com/science/article/pii/S277280132200001X",
  "https://link.springer.com/article/10.1007/s11367-011-0264-z",
  "https://www.sciencedirect.com/science/article/abs/pii/S0376738820311716",
  "https://link.springer.com/article/10.1007/s11250-022-03271-y",
  "https://www.mdpi.com/1996-1944/13/16/3541",
  "https://repositum.tuwien.at/bitstream/20.500.12708/4130/2/Surinder%20Sophie%20-%202015%20-%20Sustainable%20supply%20chain%20in%20the%20textile%20industry.pdf",
  "https://link.springer.com/article/10.1007/s10924-008-0092-9",
  "https://www.sciencedirect.com/science/article/abs/pii/S0926669007000775"
  // Assuming the user provided 33, and I have 31 here. Adding two placeholders for count matching if necessary.
  // If these are not the correct ones, the user needs to verify.
  // "placeholder_url_32", 
  // "placeholder_url_33"
];

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

/* ---------- Helper Functions ---------- */
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
        model: "gpt-3.5-turbo",
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
    
    // Basic validation to ensure it's a single word
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

/* ----------  Deep analysis via OpenAI ---------- */
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

    let referenceBlock = "Reference Documents (ONLY cite from these URLs):\n";
    approvedSources.forEach(url => {
      referenceBlock += `${ensureString(url)}\n`;
    });

    const productInfoForPrompt = [
      `- Title: ${ensureString(product.title)}`,
      product.price ? `- Price: ${ensureString(product.price)}` : null,
      // Ensure materials and brand are used if available from the ProductInfo object
      product.materials ? `- Materials: ${ensureString(product.materials)}` : null,
      product.brand ? `- Brand: ${ensureString(product.brand)}` : null,
      product.description && product.description.length > 10 ? `- Description (snippet): ${ensureString(product.description).substring(0, 100)}...` : null, // Add description snippet if long enough
      `- URL: ${ensureString(product.url)}`
    ].filter(Boolean).join('\n');

    const productInfoString = `Product Information (for the specific item being analyzed):
${productInfoForPrompt}
`;

    const category = await getClothingCategory(product.title, OPENAI_API_KEY);

    const alternatives: AlternativeProduct[] = [];
    if (category) {
        alternatives.push({
            brand: 'Patagonia',
            url: `https://www.patagonia.com/search/?q=${category}`,
            type: 'sustainable',
            note: 'High-quality, sustainable outdoor and everyday apparel.'
        });
        alternatives.push({
            brand: 'Poshmark',
            url: `https://poshmark.com/search?query=${category}`,
            type: 'second-hand',
            note: 'A large marketplace for new and used clothing.'
        });
    }

    const instructionBlock = `
Using ONLY the Reference Documents above, analyze THIS SPECIFIC PRODUCT's sustainability based on the Product Information provided.
Return exactly one JSON object with these keys:
  • "score": integer 0–100 (this score MUST be based on your analysis of the specific Product Information above and the Reference Documents. Do NOT return a generic or default score. The score must reflect the actual sustainability aspects of THIS product.)
  • "breakdown": an object where each key is a short identifier (e.g., "material_sourcing", "water_usage") and each value is a single STRING. For example: { "material_sourcing": "Full description with data point for THIS PRODUCT and [Source Name: URL]", "water_usage": "Another full description with data for THIS PRODUCT and [Source Name: URL]" }. The value string must include a numeric data point relevant to THIS PRODUCT and a citation in the format "[Source Name: URL]" (URL must exactly match one of the Reference URLs above).
  
Do not include an "alternatives" key in your response. Output ONLY that JSON object—no extra text or markdown.
`;

    const userPrompt = referenceBlock + "\n" + productInfoString + "\n" + instructionBlock;
    // console.debug("[SW] User Prompt for OpenAI:", userPrompt);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano-2025-04-14", // As per user request
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

    let parsed: { score: number; breakdown: Record<string, any>; };

    try {
      if (!rawContent) throw new Error("No content in AI response");
      // The model might sometimes return the JSON string within a markdown code block.
      const jsonMatch = rawContent.match(/```json\n([\s\S]*?)\n```/); // Removed trailing space from regex
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
      } else if (value !== null && value !== undefined) {
        cleanedBreakdown[factor] = ensureString(String(value)); // Fallback for other primitives
      } else {
        cleanedBreakdown[factor] = ""; // Default for null/undefined or unhandled cases
      }
      cleanedBreakdown[factor] = cleanedBreakdown[factor].trim();
    }
    
    if (Object.keys(cleanedBreakdown).length === 0 && !parsed.score) { // If breakdown is empty and score is 0, likely parsing issue
        console.warn("[SW] Cleaned breakdown is empty and score is 0. Raw parsed data:", parsed);
        if (!cleanedBreakdown.Error) { // Avoid overwriting a more specific parse error
            cleanedBreakdown.Error = "AI response structure was not as expected or content was missing.";
        }
    }

    return {
      product, // Use the original product info passed to the function
      score: typeof parsed.score === 'number' ? parsed.score : 0,
      breakdown: cleanedBreakdown,
      alternatives: alternatives, // Use the dynamically generated alternatives
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

/* ----------  Handle product pages ---------- */
async function handleProductView(
  productDataFromContentScript: ProductData,
  tabId: number,
  sendResponse: (resp: { ok: boolean; error?: string }) => void
): Promise<void> {
  console.debug('[SW] handleProductView: received', productDataFromContentScript, 'for tab', tabId);
  
  let viridisDataToStore: ViridisStorageData;

  try {
    try { await chrome.action.enable(tabId); } catch (e) { console.warn("[SW] Failed to enable action:", e); }
    try { await chrome.action.setBadgeBackgroundColor({ tabId, color: '#FFA500' }); } catch (e) { console.warn("[SW] Failed to set badge background color:", e); }
    try { await chrome.action.setBadgeText({ tabId, text: '...' }); } catch (e) { console.warn("[SW] Failed to set badge text:", e); }

    let siteName = 'Unknown Site';
    try {
      const productUrl = new URL(productDataFromContentScript.url);
      siteName = productUrl.hostname.replace(/^www\./, '');
    } catch (e) {
      console.warn(`Could not parse product URL to extract site: ${productDataFromContentScript.url}`, e);
    }

    const productInfoForAnalysis: ProductInfo = {
      ...productDataFromContentScript, // Spread ProductData
      // Add or overwrite with specific fields for ProductInfo if necessary
      description: ensureString((productDataFromContentScript as any).description),
      materials: ensureString((productDataFromContentScript as any).materials),
      brand: ensureString((productDataFromContentScript as any).brand),
      site: siteName
    };

    viridisDataToStore = await analyzeSustainability(productInfoForAnalysis);
    
    console.log('[SW] Attempting to store viridisDataToStore:', JSON.stringify(viridisDataToStore, null, 2));
    await chrome.storage.local.set({ viridisLast: viridisDataToStore });
    console.debug('[SW] handleProductView: stored viridisLast');
    
    const scoreForBadge = viridisDataToStore.score.toString();
    const badgeColor = viridisDataToStore.score >= 75 ? '#22C55E' : viridisDataToStore.score >= 50 ? '#F59E0B' : '#EF4444';
    try { await chrome.action.setBadgeBackgroundColor({ tabId, color: badgeColor }); } catch (e) { console.warn("[SW] Failed to set badge background color post-analysis:", e); }
    try { await chrome.action.setBadgeText({ tabId, text: scoreForBadge }); } catch (e) { console.warn("[SW] Failed to set badge text post-analysis:", e); }

    sendResponse({ ok: true });

  } catch (err: any) { // Catch errors from analyzeSustainability or other ops here
    const errorMessage = err.message || String(err);
    console.error('[SW] handleProductView: overall error', errorMessage, err);
    
    viridisDataToStore = {
        product: productDataFromContentScript, // Use the initially received product data
        score: 0,
        breakdown: {Error: "Product analysis failed in handleProductView: " + errorMessage}, 
        alternatives: [],
        timestamp: Date.now()
    };
    
    try {
        console.log('[SW] Attempting to store errorDataToStore:', JSON.stringify(viridisDataToStore, null, 2));
        await chrome.storage.local.set({ viridisLast: viridisDataToStore });
    } catch (storageErr: any) {
        console.error("[SW] Failed to store error data to local storage:", storageErr);
    }

    try { await chrome.action.setBadgeText({ tabId, text: 'ERR' }); } catch (e) { console.warn("[SW] Failed to set error badge text:", e); }
    try { await chrome.action.setBadgeBackgroundColor({ tabId, color: '#FF0000' }); } catch (e) { console.warn("[SW] Failed to set error badge background:", e); }
    
    sendResponse({ ok: false, error: errorMessage });
  } finally {
    // Always try to open popup
    try { 
        await chrome.action.openPopup(); 
        console.debug('[SW] handleProductView: Popup open attempt in finally block.');
    } catch (e) { 
        console.warn("[SW] Failed to open popup in finally block:", e); 
    }
  }
}

/* ----------  Message router ---------- */
chrome.runtime.onMessage.addListener(
  (
    msg: { type: string; payload?: any },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ): boolean => {
    const tabId = sender.tab?.id;

    if (msg.type === 'VIRIDIS_PRODUCT_VIEW') {
      if (!tabId) {
        console.warn('[SW] VIRIDIS_PRODUCT_VIEW: no tabId, ignoring', msg);
        sendResponse({ ok: false, error: "Request must come from a tab." });
        return false; 
      }
      const productPayload = msg.payload as ProductData; // ProductData is expected now
      if (!productPayload || 
          typeof productPayload.url !== 'string' || !productPayload.url ||
          typeof productPayload.title !== 'string' || !productPayload.title ||
          (productPayload.price !== undefined && typeof productPayload.price !== 'string')) {
        console.error('[SW] VIRIDIS_PRODUCT_VIEW: invalid payload type or missing essential fields', productPayload);
        sendResponse({ ok: false, error: "Invalid product data: url, title must be non-empty strings. Price, if present, must be string." });
        return false;
      }
      // Minimal cast to ProductInfo, analyzeSustainability will handle defaults
      handleProductView(productPayload as ProductInfo, tabId, sendResponse);
      return true; // Indicate async response
    }
    
    // Keeping GET_SUSTAINABILITY_SCORE for now as per user's file, but simplified.
    if (msg.type === 'GET_SUSTAINABILITY_SCORE') {
        console.warn('[SW] GET_SUSTAINABILITY_SCORE is deprecated. Analysis via VIRIDIS_PRODUCT_VIEW.');
        const productInfo = msg.payload as ProductInfo;
        if (!productInfo || typeof productInfo.url !== 'string' || typeof productInfo.title !== 'string') {
            sendResponse({ success: false, error: "Invalid product info for GET_SUSTAINABILITY_SCORE (non-string url/title)" });
            return false;
        }
        analyzeSustainability(productInfo)
          .then(apiResponse => { // analyzeSustainability now returns ViridisStorageData
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
              breakdown: { "Analysis Error": "GET_SUSTAINABILITY_SCORE failed: " + String(error.message).trim() },
              alternatives: []
            });
          });
        return true; 
    }

    console.debug('[SW] onMessage: unhandled message type', msg.type, msg);
    return false;
  }
);

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log("Viridis extension installed!");
  }
});

console.log("Viridis Service Worker (simplified) initialized.");
