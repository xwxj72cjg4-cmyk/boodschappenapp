// Reverse-engineered client for the WinkelMaatje API at api.scan.devtien.nl.
// Endpoints discovered via /ngsw.json: /search, /stores, /groups/.

export type Store = {
  id: string;
  name: string;
  logoUrl: string | null;
  homepageUrl: string | null;
  serviceModel: "physical_store" | "delivery_only" | string;
  distanceKm: number | null;
};

export type Offer = {
  storeId: string;
  storeName: string;
  price: number;
  unitPrice: number | null;
  url: string | null;
  imageUrl: string | null;
  isCheapest: boolean;
};

export type ProductGroup = {
  id: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  lowestPrice: number | null;
  offers: Offer[];
};

const API = "https://api.scan.devtien.nl";

type RawSearchResponse = {
  meta?: { total?: number; shown?: number; offset?: number; hasMore?: boolean };
  results?: RawGroup[];
};

type RawPricing = {
  price?: number | null;
  effectivePrice?: number | null;
  promoPrice?: number | null;
  unitPrice?: number | null;
  lowestPrice?: number | null;
};

type RawOffer = {
  storeId?: string;
  storeName?: string;
  pricing?: RawPricing;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  isCheapest?: boolean;
};

type RawGroup = {
  groupId?: string;
  title?: string;
  brand?: string | null;
  imageUrl?: string | null;
  pricing?: RawPricing;
  offers?: RawOffer[];
};

const offerPrice = (p?: RawPricing | null): number | null => {
  if (!p) return null;
  const candidates = [p.effectivePrice, p.price, p.promoPrice];
  for (const c of candidates) {
    if (typeof c === "number" && c > 0) return c;
  }
  return null;
};

const normalizeOffer = (
  o: RawOffer,
  groupImage: string | null,
): Offer | null => {
  const price = offerPrice(o.pricing);
  if (!o.storeId || price === null) return null;
  return {
    storeId: o.storeId,
    storeName: o.storeName || o.storeId,
    price,
    unitPrice: o.pricing?.unitPrice ?? null,
    url: o.sourceUrl ?? null,
    imageUrl: o.imageUrl ?? groupImage ?? null,
    isCheapest: !!o.isCheapest,
  };
};

const normalizeGroup = (g: RawGroup): ProductGroup => {
  const img = g.imageUrl ?? null;
  return {
    id: g.groupId || "",
    name: g.title || "",
    brand: g.brand ?? null,
    imageUrl: img,
    lowestPrice: g.pricing?.lowestPrice ?? null,
    offers: (g.offers || [])
      .map((o) => normalizeOffer(o, img))
      .filter((x): x is Offer => x !== null),
  };
};

export type LocationOpts = {
  postalCode?: string | null;
  radiusKm?: number | null;
};

const addLocation = (params: URLSearchParams, opts?: LocationOpts) => {
  if (opts?.postalCode) {
    params.set("postalCode", opts.postalCode.replace(/\s+/g, "").toUpperCase());
  }
  if (opts?.radiusKm) params.set("radiusKm", String(opts.radiusKm));
};

export async function searchProducts(
  query: string,
  opts?: LocationOpts & { signal?: AbortSignal },
): Promise<ProductGroup[]> {
  const params = new URLSearchParams({ q: query });
  addLocation(params, opts);
  const r = await fetch(`${API}/search?${params}`, {
    signal: opts?.signal,
    headers: { accept: "application/json" },
    next: { revalidate: 60 * 30 },
  });
  if (!r.ok) throw new Error(`WinkelMaatje search failed: ${r.status}`);
  const json: RawSearchResponse = await r.json();
  return (json.results || [])
    .map(normalizeGroup)
    .filter((g) => g.offers.length > 0);
}

export async function listStores(opts?: LocationOpts): Promise<Store[]> {
  const params = new URLSearchParams();
  addLocation(params, opts);
  const url = params.toString() ? `${API}/stores?${params}` : `${API}/stores`;
  const r = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 60 * 60 * 6 },
  });
  if (!r.ok) throw new Error(`WinkelMaatje stores failed: ${r.status}`);
  const json = await r.json();
  return (json.stores || []).map(
    (s: Store): Store => ({
      id: s.id,
      name: s.name,
      logoUrl: s.logoUrl,
      homepageUrl: s.homepageUrl,
      serviceModel: s.serviceModel,
      distanceKm: s.distanceKm,
    }),
  );
}
