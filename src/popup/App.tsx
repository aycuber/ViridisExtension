import * as React from 'react';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { Leaf, ExternalLink, Twitter, AlertCircle, CheckCircle, ShoppingBag, Repeat, X as XIcon } from 'lucide-react';

// Types (ensure these match or are compatible with service worker types)
interface ProductData {
  title: string;
  price?: string; 
  url: string;
}

interface AlternativeProduct {
  brand: string;
  url: string;
  price_estimate?: string;
  type: 'sustainable' | 'second-hand';
  note?: string;
}

// Restore breakdown type to Record<string, string>
interface ViridisData {
  product: ProductData;
  score: number;
  breakdown: Record<string, string>; // Values should now be strings from service worker
  alternatives?: AlternativeProduct[];
  timestamp: number;
  error?: string; // Optional error message at the top level
}

// --- Helper function to parse breakdown string for text and source link (for Point 2) ---
interface ParsedBreakdownDetail {
  text: string;
  sourceName?: string;
  sourceUrl?: string;
}

const parseBreakdownStringForLink = (detailString: string): ParsedBreakdownDetail => {
  if (typeof detailString !== 'string') {
    return { text: "Invalid detail format" };
  }
  // Regex to find [Source Name: URL] at the end, capturing name and URL
  // It allows for optional whitespace and ensures URL starts with http/https.
  const citationRegex = /^(.*?)(?:\s*\[([A-Za-z0-9\s._-]+):\s*(https?:\/\/[^\s\]]+)\])?\s*$/s;
  const match = detailString.match(citationRegex);

  if (match) {
    const text = ensureString(match[1]); // The main text part
    const sourceName = match[2] ? ensureString(match[2]) : undefined; 
    const sourceUrl = match[3] ? ensureString(match[3]) : undefined;
    
    if (sourceName && sourceUrl && isValidUrl(sourceUrl)) {
      return { text, sourceName, sourceUrl };
    }
    return { text: detailString.trim() }; // Return original if citation parts are incomplete or URL invalid
  }
  return { text: detailString.trim() }; // No citation found, return original text
};

// Animation Variants
const popupVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.2, ease: "easeIn" } },
};

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.05, // 50ms stagger
      duration: 0.4,
      ease: [0.25, 0.1, 0.25, 1.0], // ease-out cubic/quintic like
    },
  }),
};

const listItemVariants: Variants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i: number = 0) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.05, // 50ms stagger within lists
      duration: 0.3,
      ease: "easeOut",
    },
  }),
};

// Helper (from previous, might be needed by parseBreakdownStringForLink)
function ensureString(x: any): string {
  return x == null ? '' : String(x).trim();
}

// isValidUrl and ensureProtocol (from previous, needed for links)
const isValidUrl = (urlString?: string): boolean => {
  if (!urlString) return false;
  try {
    const url = new URL(urlString.startsWith('//') ? `https:${urlString}` : urlString);
    return (url.protocol === "http:" || url.protocol === "https:") && url.host !== "";
  } catch (_) {
    return false;
  }
};
const ensureProtocol = (url?: string): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith('//') && typeof window !== 'undefined') return `${window.location.protocol}${url}`;
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
};

// --- Helper function to generate smarter alternative URLs (for Point 3 from previous, now Point 2) ---
const getSmartAlternativeUrl = (alternative: AlternativeProduct, productTitle?: string): string => {
  let baseUrl = ensureProtocol(alternative.url) || '';
  const originalProductKeywords = productTitle 
    ? productTitle
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "") // Remove non-alphanumeric chars except spaces
        .trim()
        .split(/\s+/)
        .filter(word => word.length > 2) // Keep words longer than 2 chars
        .slice(0, 3) // Take first 3 significant keywords
    : [];
  const categoryQuery = originalProductKeywords.join('+');
  const categoryQuerySpaced = originalProductKeywords.join(' ');

  if (alternative.type === 'second-hand' && categoryQuery) {
    const domain = (() => {
      try {
        return new URL(baseUrl).hostname.toLowerCase();
      } catch {
        // If baseUrl is not a valid URL (e.g., just a brand name), try to match brand name
        const altBrandLower = alternative.brand.toLowerCase();
        if (altBrandLower.includes('thredup')) return 'www.thredup.com';
        if (altBrandLower.includes('depop')) return 'www.depop.com';
        if (altBrandLower.includes('poshmark')) return 'poshmark.com';
        return ''; // No match
      }
    })();

    if (domain.includes('thredup.com')) {
      return `https://www.thredup.com/resale/shop?search_opts[keyword]=${categoryQuery}&sizing_id=750%2C755%2C756%2C762%2C768&department_tags=womens`; // Added some common filters for better results
    }
    if (domain.includes('depop.com')) {
      return `https://www.depop.com/search/?q=${categoryQuerySpaced}`; // Depop seems to handle spaces well in q
    }
    if (domain.includes('poshmark.com')) {
      return `https://poshmark.com/search?query=${categoryQuerySpaced}&type=listings&src=dir`; // Poshmark specific
    }
    if (domain.includes('ebay.com')) {
      return `https://www.ebay.com/sch/i.html?_nkw=${categoryQuerySpaced}+clothing&LH_ItemCondition=4`; // Condition for pre-owned
    }
    // Fallback for other second-hand sites or if domain not matched, but we have keywords
    // This is a generic guess; many sites won't support this query structure.
    // However, it's better than a potentially dead direct link.
    console.warn(`[Popup] Unknown second-hand domain: ${domain} for brand ${alternative.brand}. Attempting generic search URL construction.`);
    return `${baseUrl.split('/').slice(0,3).join('/')}/s?k=${categoryQuery}`; // Generic guess: /s?k= or /search?q=
  }

  // Original logic for non-second-hand or if categoryQuery couldn't be formed
  const genericDomains = ['tentree.com', 'patagonia.com', 'everlane.com', 'wearpact.com'];
  let isLikelyGenericHomepage = baseUrl.split('/').length <= 3; 
  if (!isLikelyGenericHomepage) {
    try {
        const parsedUrl = new URL(baseUrl);
        isLikelyGenericHomepage = genericDomains.some(domain => parsedUrl.hostname.includes(domain)) && 
                                  (parsedUrl.pathname === '/' || parsedUrl.pathname === '');
    } catch(e) { /* ignore malformed base URLs */ }
  }

  if (isLikelyGenericHomepage && categoryQuery) {
    try {
        const parsedBaseUrl = new URL(baseUrl);
        // For sustainable brands, try common search paths if product keywords are available
        if (parsedBaseUrl.hostname.includes('google.com')) { // Avoid messing with existing Google search links if AI returns one
            return baseUrl;
        }
        return `${baseUrl}${baseUrl.endsWith('/') ? '' : '/'}search?q=${categoryQuerySpaced}`;
    } catch (e) {
        console.warn("[Popup] Could not parse alternative URL for search query construction:", baseUrl, e);
        return baseUrl; 
    }
  }
  return baseUrl; // Return original if it seems specific enough, is not second-hand with keywords, or if errors occurred
};

const App: React.FC = () => {
  const [data, setData] = useState<ViridisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(true); // For controlling popup presence for exit animation
  const [error, setError] = useState<string | null>(null); // Added error state

  // Placed handleClose here as it uses setIsVisible and is called by UI
  const handleClose = () => {
    setIsVisible(false);
    // Give time for animation before window.close might be called by Chrome
    setTimeout(() => window.close(), 250); // Matches exit animation duration + buffer
  };

  useEffect(() => {
    const fetchData = async () => {
      console.log("[Popup] fetchData started.");
      try {
        const result = await chrome.storage.local.get("viridisLast");
        console.log("[Popup] Raw result from chrome.storage.local.get:", JSON.parse(JSON.stringify(result))); // Deep copy for reliable logging
        console.log("[Popup] Raw viridisLast from storage:", JSON.parse(JSON.stringify(result.viridisLast))); // Deep copy

        if (result.viridisLast && Object.keys(result.viridisLast).length > 0) {
          const fetchedData = result.viridisLast as ViridisData;
          console.log("[Popup] Fetched data that will be set to state:", JSON.parse(JSON.stringify(fetchedData)));
          setData(fetchedData);
          console.log("[Popup] Breakdown from fetchedData immediately after potential setData:", JSON.parse(JSON.stringify(fetchedData.breakdown)));
          
          if (fetchedData.error) {
            console.log("[Popup] Error found in fetchedData.error:", fetchedData.error);
            setError(fetchedData.error);
          } else if (fetchedData.breakdown && fetchedData.breakdown.Error && typeof fetchedData.breakdown.Error === 'string') {
            console.log("[Popup] Error found in fetchedData.breakdown:", fetchedData.breakdown.Error);
            setError(fetchedData.breakdown.Error);
          } else {
            setError(null); // Clear any previous error if data is fine
          }
        } else {
          console.log("[Popup] No viridisLast data found in storage or it was empty. result.viridisLast:", result.viridisLast);
          setError("No product data currently available.");
          setData(null); // Ensure data is null if nothing is found
        }
      } catch (err: any) {
        console.error("[Popup] Failed to fetch data from storage:", err);
        setError(`Failed to load data: ${err.message || String(err)}`);
        setData(null); // Ensure data is null on error
      } finally {
        setLoading(false);
        console.log("[Popup] fetchData finished. Loading set to false.");
      }
    };

    fetchData();

    // Listener for real-time updates (e.g., if SW completes analysis while popup is open)
    const messageListener = (
      message: any, 
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (response?: any) => void
    ): boolean | undefined => {
      console.log("[Popup] Message received type:", message.type);
      if (message.type === 'VIRIDIS_DATA_UPDATED' && message.payload) {
        console.log("[Popup] Received VIRIDIS_DATA_UPDATED with payload:", JSON.parse(JSON.stringify(message.payload)));
        const updatedData = message.payload as ViridisData;
        setData(updatedData);
        if (updatedData.error) {
          console.log("[Popup] Error found in VIRIDIS_DATA_UPDATED error:", updatedData.error);
          setError(updatedData.error);
        } else if (updatedData.breakdown && updatedData.breakdown.Error && typeof updatedData.breakdown.Error === 'string') {
          console.log("[Popup] Error found in VIRIDIS_DATA_UPDATED breakdown:", updatedData.breakdown.Error);
          setError(updatedData.breakdown.Error);
        } else {
          setError(null);
        }
        return true; // Indicate message was handled
      }
      return undefined; // Indicate message was not handled by this listener
    };
    chrome.runtime.onMessage.addListener(messageListener);

    // Optional: Listen for Escape key to close popup
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Log data state when it changes
  useEffect(() => {
    console.log("[Popup] data state changed. Current data:", JSON.parse(JSON.stringify(data)));
    console.log("[Popup] data state changed. Current error state:", error);
  }, [data, error]);

  const ScoreDisplay: React.FC<{ score: number }> = ({ score }) => {
    let scoreColor = 'text-gray-700';
    let ringColor = 'ring-gray-300';
    if (score >= 75) { scoreColor = 'text-emerald-600'; ringColor = 'ring-emerald-500'; }
    else if (score >= 50) { scoreColor = 'text-amber-500'; ringColor = 'ring-amber-400'; }
    else { scoreColor = 'text-red-500'; ringColor = 'ring-red-400'; }

    return (
      <motion.div 
        className={`relative w-36 h-36 mx-auto flex items-center justify-center rounded-full ring-4 ${ringColor} bg-white shadow-lg`}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, transition: { delay: 0.1, duration: 0.4, type: "spring", stiffness: 100 } }}
      >
        <span className={`text-6xl font-bold ${scoreColor}`}>{score}</span>
        <span className="absolute bottom-5 text-sm text-gray-500">/100</span>
      </motion.div>
    );
  };

  // Framer Motion button/link variants for hover and tap
  const interactiveVariants: Variants = {
    hover: { scale: 1.03, transition: { duration: 0.15, ease: "easeInOut" } },
    tap: { scale: 0.97, transition: { duration: 0.1, ease: "easeInOut" } },
  };
  const buttonPressVariants: Variants = {
    hover: { backgroundColor: "rgba(0,0,0,0.05)", scale:1.02, transition: { duration: 0.15 } },
    tap: { scale: 0.95, backgroundColor: "rgba(0,0,0,0.1)", transition: { duration: 0.1 } },
  };

  if (loading) {
    console.log("[Popup] Rendering Loading state.");
    return (
      <div className="w-[300px] p-6 flex flex-col items-center justify-center bg-white rounded-lg shadow-xl min-h-[350px] font-[system-ui,sans-serif]">
        <motion.div initial={{ opacity:0, scale:0.8}} animate={{opacity:1, scale:1}} transition={{duration:0.3}}>
            <Leaf className="w-12 h-12 text-emerald-500 animate-pulse mb-4" />
        </motion.div>
        <h2 className="text-lg font-semibold text-gray-700">Viridis</h2>
        <p className="text-gray-500 text-sm">Analyzing sustainability...</p>
      </div>
    );
  }

  // Handle error state from service worker
  if (error) {
    console.log("[Popup] Rendering Error state with error:", error);
    return (
      <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible" className="p-5 text-center w-[300px] bg-white rounded-lg shadow-xl font-[system-ui,sans-serif] text-gray-800 flex flex-col items-center justify-center min-h-[350px]">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4 mx-auto" />
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Analysis Error</h2>
        <p className="text-gray-600 text-sm leading-relaxed">
          {error.replace("[No Link Available]", "").trim() || "An unexpected error occurred during analysis."}
        </p>
        {data?.product?.title && <p className="text-xs text-gray-400 mt-3 truncate">Regarding: {data.product.title}</p>}
      </motion.div>
    );
  }
  
  if (!data || typeof data.score !== 'number') { // Handles both no data and non-error missing score
    console.log("[Popup] Rendering No Product Data state. Data:", JSON.parse(JSON.stringify(data)));
    return (
      <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible" className="p-6 flex flex-col items-center justify-center min-h-[200px] w-[300px] bg-white rounded-lg shadow-xl font-[system-ui,sans-serif] text-gray-800">
          <AlertCircle className="w-12 h-12 text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">No Product Data</h2>
          <p className="text-gray-600 text-sm leading-relaxed text-center">
            Navigate to a clothing product page. Viridis will analyze its sustainability, or previous data might be unavailable.
          </p>
      </motion.div>
    );
  }

  console.log("[Popup] Rendering Main Content. Data:", JSON.parse(JSON.stringify(data)));
  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          className="w-[300px] bg-white rounded-lg shadow-xl font-[system-ui,sans-serif] text-gray-800 flex flex-col max-h-[580px] overflow-hidden"
          variants={popupVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.header custom={0} variants={sectionVariants} initial="hidden" animate="visible" className="px-5 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center flex-grow min-w-0">
                <Leaf className="w-6 h-6 text-emerald-600 mr-2 flex-shrink-0" />
                <h1 className="text-xl font-bold text-gray-800 truncate">Viridis</h1>
              </div>
              <div className="flex items-center ml-2 flex-shrink-0">
                {data?.product && isValidUrl(data.product.url) && (
                  <motion.a
                    variants={interactiveVariants} whileHover="hover" whileTap="tap"
                    href={ensureProtocol(data.product.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View Original Product Page"
                    className="text-gray-400 hover:text-emerald-600 transition-colors duration-150 mr-2"
                  >
                    <ExternalLink size={18} />
                  </motion.a>
                )}
                <motion.button
                  onClick={handleClose} 
                  title="Close Popup"
                  variants={interactiveVariants} whileHover="hover" whileTap="tap"
                  className="text-gray-400 hover:text-red-500 transition-colors duration-150 p-1 rounded-full"
                  aria-label="Close popup"
                >
                  <XIcon size={20} />
                </motion.button>
              </div>
            </div>
            {data?.product?.title && (
                <p className="text-xs text-gray-500 mt-1 truncate" title={data.product.title}>
                    {data.product.title}
                </p>
            )}
          </motion.header>

          <main className="flex-grow p-5 space-y-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400 scrollbar-track-slate-100">
            <motion.section custom={1} variants={sectionVariants} initial="hidden" animate="visible" className="text-center mb-5">
              <ScoreDisplay score={data.score} />
              <p className="mt-3 text-base font-medium text-gray-700">Overall Eco Score</p>
            </motion.section>

            {data.breakdown && Object.keys(data.breakdown).length > 0 && (
              <motion.section custom={2} variants={sectionVariants} initial="hidden" animate="visible">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                  Breakdown
                </h3>
                <div className="space-y-2">
                  {Object.entries(data.breakdown).map(([factor, detailString], idx) => {
                    const { text, sourceName, sourceUrl } = parseBreakdownStringForLink(detailString);
                    const factorIsError = factor.toLowerCase() === 'error';
                    
                    return (
                      <motion.div 
                        key={factor} 
                        custom={idx} variants={listItemVariants} initial="hidden" animate="visible"
                        className="bg-slate-50 p-3 rounded-md border border-gray-200 text-sm transition-shadow hover:shadow-md"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 mr-2">
                            <p className="font-medium text-gray-700 capitalize">
                              {factor.replace(/_/g, ' ')}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5">
                              {text || (factorIsError ? "" : "Detail not available")}
                            </p>
                          </div>
                          {factorIsError ? 
                            <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" /> :
                            <CheckCircle size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" /> 
                          }
                        </div>
                        {sourceUrl && (
                          <motion.a
                            variants={interactiveVariants} whileHover={{scale:1.05}} whileTap={{scale:0.95}}
                            href={ensureProtocol(sourceUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1.5 inline-flex items-center text-xs text-emerald-600 hover:text-emerald-700 hover:underline transition-colors duration-150 group"
                          >
                            {sourceName || "Source"} <ExternalLink size={11} className="ml-0.5 opacity-70 group-hover:opacity-100" />
                          </motion.a>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </motion.section>
            )}

            {data.alternatives && data.alternatives.length > 0 && (
              <motion.section custom={3} variants={sectionVariants} initial="hidden" animate="visible">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                  Sustainable Alternatives
                </h3>
                <div className="space-y-2.5">
                  {data.alternatives.map((alt: AlternativeProduct, index: number) => {
                    const smartUrl = getSmartAlternativeUrl(alt, data.product?.title);
                    const isLinkValid = isValidUrl(smartUrl); 
                    const Icon = alt.type === 'sustainable' ? ShoppingBag : Repeat;
                    return (
                      <motion.div 
                        key={index} 
                        custom={index} variants={listItemVariants} initial="hidden" animate="visible"
                        className="bg-slate-50 p-3 rounded-md border border-gray-200 transition-shadow hover:shadow-md group"
                      >
                        <div className="flex items-center mb-1">
                          <Icon size={16} className={`mr-2 flex-shrink-0 ${alt.type === 'sustainable' ? 'text-emerald-600' : 'text-blue-600'}`} />
                          <p className="text-sm font-semibold text-gray-800 truncate max-w-[150px]" title={alt.brand}>{alt.brand}</p>
                          {alt.price_estimate && (
                            <span className="ml-auto text-xs text-gray-600 bg-gray-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                              {alt.price_estimate}
                            </span>
                          )}
                        </div>
                        {alt.note && <p className="text-xs text-gray-600 mb-1.5 italic leading-tight">
                          {alt.note}
                        </p>}
                        {isLinkValid ? (
                          <motion.a
                            variants={interactiveVariants} whileHover={{scale:1.05}} whileTap={{scale:0.95}}
                            href={smartUrl} 
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-xs text-emerald-700 hover:text-emerald-800 hover:underline group-hover:text-emerald-800"
                          >
                            View Product <ExternalLink size={11} className="ml-0.5 opacity-80 group-hover:opacity-100" />
                          </motion.a>
                        ) : (
                          <span className="inline-flex items-center text-xs text-gray-500">
                            Link not available for: {alt.url} (Debug: {smartUrl})
                          </span>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </motion.section>
            )}
          </main>

          <motion.footer custom={4} variants={sectionVariants} initial="hidden" animate="visible" className="px-5 py-3 bg-slate-50 border-t border-gray-200 flex items-center justify-between">
            <motion.button
              variants={buttonPressVariants} whileHover="hover" whileTap="tap"
              onClick={() => chrome.tabs.create({ url: 'https://twitter.com/viridis_dev' })}
              className="flex items-center space-x-1.5 text-xs text-gray-500 hover:text-emerald-700 px-2.5 py-1.5 rounded-md transition-all duration-150 group"
            >
              <Twitter size={14} className="opacity-70 group-hover:opacity-100" />
              <span>Follow</span>
            </motion.button>
            <motion.button
              variants={buttonPressVariants} whileHover="hover" whileTap="tap"
              onClick={() => chrome.tabs.create({ url: 'https://www.viridisshopping.com' })}
              className="flex items-center space-x-1.5 text-xs text-gray-500 hover:text-emerald-700 px-2.5 py-1.5 rounded-md transition-all duration-150 group"
            >
              <ExternalLink size={14} className="opacity-70 group-hover:opacity-100"/>
              <span>Viridis Site</span>
            </motion.button>
          </motion.footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default App;
