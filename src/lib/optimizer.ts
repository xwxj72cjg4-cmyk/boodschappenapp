// Pick the combination of N stores that minimizes total cost for a list.
// For each item we have one or more candidate offers. We assume the cheapest
// match in the search result for that item is the "right" product, then for
// each chosen-store-set we sum, per item, the cheapest price available in
// that set. Items with no offer in any chosen store fall through as "missing".

import type { ProductGroup } from "./winkelmaatje";

export type ItemQuoteEntry = {
  price: number;
  productName: string;
  productImage: string | null;
};

export type ItemQuote = {
  itemId: string;
  itemName: string;
  qty: number;
  pricesByStore: Record<string, ItemQuoteEntry>;
};

export type StoreCombo = {
  storeIds: string[];
  total: number;
  perItem: {
    itemId: string;
    itemName: string;
    qty: number;
    storeId: string | null;
    productName: string | null;
    productImage: string | null;
    unitPrice: number | null;
    lineTotal: number;
    missing: boolean;
  }[];
  missingCount: number;
};

export const buildItemQuote = (
  itemId: string,
  itemName: string,
  qty: number,
  groups: ProductGroup[],
): ItemQuote => {
  const pricesByStore: ItemQuote["pricesByStore"] = {};
  for (const g of groups) {
    for (const offer of g.offers) {
      const cur = pricesByStore[offer.storeId];
      if (!cur || offer.price < cur.price) {
        pricesByStore[offer.storeId] = {
          price: offer.price,
          productName: g.name,
          productImage: offer.imageUrl ?? g.imageUrl ?? null,
        };
      }
    }
  }
  return { itemId, itemName, qty, pricesByStore };
};

const combinations = <T>(arr: T[], k: number): T[][] => {
  const out: T[][] = [];
  const helper = (start: number, picked: T[]) => {
    if (picked.length === k) {
      out.push(picked.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      picked.push(arr[i]);
      helper(i + 1, picked);
      picked.pop();
    }
  };
  helper(0, []);
  return out;
};

const evalCombo = (storeIds: string[], quotes: ItemQuote[]): StoreCombo => {
  let total = 0;
  let missingCount = 0;
  const perItem = quotes.map((q) => {
    let best:
      | { storeId: string; price: number; productName: string; productImage: string | null }
      | null = null;
    for (const sid of storeIds) {
      const p = q.pricesByStore[sid];
      if (p && (!best || p.price < best.price)) {
        best = {
          storeId: sid,
          price: p.price,
          productName: p.productName,
          productImage: p.productImage,
        };
      }
    }
    if (!best) {
      missingCount++;
      return {
        itemId: q.itemId,
        itemName: q.itemName,
        qty: q.qty,
        storeId: null,
        productName: null,
        productImage: null,
        unitPrice: null,
        lineTotal: 0,
        missing: true,
      };
    }
    const lineTotal = best.price * q.qty;
    total += lineTotal;
    return {
      itemId: q.itemId,
      itemName: q.itemName,
      qty: q.qty,
      storeId: best.storeId,
      productName: best.productName,
      productImage: best.productImage,
      unitPrice: best.price,
      lineTotal,
      missing: false,
    };
  });
  return { storeIds, total, perItem, missingCount };
};

export const optimize = (
  quotes: ItemQuote[],
  storeIds: string[],
  numStores: 1 | 2 | 3,
): StoreCombo | null => {
  const candidates = storeIds.filter((sid) =>
    quotes.some((q) => q.pricesByStore[sid] !== undefined),
  );
  if (candidates.length === 0) return null;
  const k = Math.min(numStores, candidates.length);
  const combos = combinations(candidates, k);
  let best: StoreCombo | null = null;
  for (const c of combos) {
    const res = evalCombo(c, quotes);
    if (
      !best ||
      res.missingCount < best.missingCount ||
      (res.missingCount === best.missingCount && res.total < best.total)
    ) {
      best = res;
    }
  }
  return best;
};
