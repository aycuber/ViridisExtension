// src/background/lcaData.ts
import raw from './lcaDataCleanUnicode.json';

export interface MaterialLCA {
  material: string;
  carbonFootprint: string;
  endOfLife: string;
  sourcing: string;
  waterUse: string;
  score: number;
  citation: string;
}

// The JSON keys might still be "Carbon footprint" (with space). We normalize them here:
export const lcaMaterials: MaterialLCA[] = (raw as any[]).map(item => ({
  material: String(item.material),
  carbonFootprint: String(item['carbonFootprint'] ?? item['Carbon footprint'] ?? ''),
  endOfLife: String(item.endOfLife ?? item['End-of-life'] ?? ''),
  sourcing: String(item.sourcing ?? item['Material sourcing'] ?? ''),
  waterUse: String(item.waterUse ?? item['Water use'] ?? ''),
  score: Number(item.score ?? item['Score / 100'] ?? 0),
  citation: String(item.citation ?? item['Ref./Date'] ?? '')
}));

export default lcaMaterials;
