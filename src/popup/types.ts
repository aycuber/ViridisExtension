// Types used throughout the extension

export interface ProductData {
  title: string;
  price: string;
  url: string;
}

export interface Alternative {
  name: string;
  score: number;
  cashback_pct: number;
  url: string;
}

export interface ViridisData {
  product: ProductData;
  score: number;
  cashback_pct: number;
  alternatives: Alternative[];
  timestamp: number;
}