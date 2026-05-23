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

export type Pkg = {
  displayQuantity: number | null;
  displayUnit: string | null;
  pieceCount: number | null;
  normalizedUnit: string | null;
};

export type Offer = {
  storeId: string;
  storeName: string;
  price: number;
  unitPrice: number | null; // prijs per genormaliseerde eenheid (per kg / per l)
  pricePerPiece: number | null; // prijs per stuk, indien bekend
  pkg: Pkg;
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
  lowestUnitPrice: number | null;
  pkg: Pkg;
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
  lowestUnitPrice?: number | null;
};

type RawPackage = {
  displayQuantity?: number | null;
  displayUnit?: string | null;
  pieceCount?: number | null;
  normalizedUnit?: string | null;
};

type RawOffer = {
  storeId?: string;
  storeName?: string;
  pricing?: RawPricing;
  package?: RawPackage;
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
  package?: RawPackage;
  offers?: RawOffer[];
};

const normalizePkg = (p?: RawPackage | null): Pkg => ({
  displayQuantity: p?.displayQuantity ?? null,
  displayUnit: p?.displayUnit ?? null,
  pieceCount: p?.pieceCount ?? null,
  normalizedUnit: p?.normalizedUnit ?? null,
});

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
  groupPkg: Pkg,
): Offer | null => {
  const price = offerPrice(o.pricing);
  if (!o.storeId || price === null) return null;
  const pkg = o.package ? normalizePkg(o.package) : groupPkg;
  const pieces = pkg.pieceCount && pkg.pieceCount > 0 ? pkg.pieceCount : null;
  return {
    storeId: o.storeId,
    storeName: o.storeName || o.storeId,
    price,
    unitPrice: o.pricing?.unitPrice ?? null,
    pricePerPiece: pieces ? price / pieces : null,
    pkg,
    url: o.sourceUrl ?? null,
    imageUrl: o.imageUrl ?? groupImage ?? null,
    isCheapest: !!o.isCheapest,
  };
};

const normalizeGroup = (g: RawGroup): ProductGroup => {
  const img = g.imageUrl ?? null;
  const pkg = normalizePkg(g.package);
  return {
    id: g.groupId || "",
    name: g.title || "",
    brand: g.brand ?? null,
    imageUrl: img,
    lowestPrice: g.pricing?.lowestPrice ?? null,
    lowestUnitPrice: g.pricing?.lowestUnitPrice ?? null,
    pkg,
    offers: (g.offers || [])
      .map((o) => normalizeOffer(o, img, pkg))
      .filter((x): x is Offer => x !== null),
  };
};

// --- Ontdubbeling --------------------------------------------------------
// Supermarkten (vooral AH) hebben soms meerdere productpagina's voor exact
// hetzelfde artikel, met verschillende prijzen — vaak een verouderde pagina
// zonder barcode naast de actuele. We voegen die samen tot één product en
// houden per winkel alleen de goedkoopste aanbieding.

const normalizeTitle = (s: string): string =>
  s
    .toLowerCase()
    .replace(
      /\b\d+(?:[.,]\d+)?\s*(?:st|stuks?|stuk|x|g|gr|gram|ml|cl|l|kg)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const dedupeKey = (g: ProductGroup): string =>
  `${normalizeTitle(`${g.brand ?? ""} ${g.name}`)}|p:${g.pkg.pieceCount ?? ""}`;

const cheapestOfferPrice = (g: ProductGroup): number =>
  g.offers.reduce((m, o) => (o.price < m ? o.price : m), Infinity);

const mergeGroups = (bucket: ProductGroup[]): ProductGroup => {
  // Representant = goedkoopste variant (heeft meestal de actuele, nette data).
  const sorted = [...bucket].sort(
    (a, b) => cheapestOfferPrice(a) - cheapestOfferPrice(b),
  );
  const rep = sorted[0];

  // Combineer alle aanbiedingen, hou per winkel de goedkoopste.
  const bestByStore = new Map<string, Offer>();
  for (const g of bucket) {
    for (const o of g.offers) {
      const cur = bestByStore.get(o.storeId);
      if (!cur || o.price < cur.price) bestByStore.set(o.storeId, o);
    }
  }
  const offers = [...bestByStore.values()].sort((a, b) => a.price - b.price);
  const minPrice = offers.length ? offers[0].price : null;
  offers.forEach((o) => (o.isCheapest = o.price === minPrice));

  const unitPrices = offers
    .map((o) => o.unitPrice)
    .filter((v): v is number => v != null);

  return {
    ...rep,
    offers,
    lowestPrice: minPrice,
    lowestUnitPrice: unitPrices.length ? Math.min(...unitPrices) : rep.lowestUnitPrice,
  };
};

const dedupeGroups = (groups: ProductGroup[]): ProductGroup[] => {
  const buckets = new Map<string, ProductGroup[]>();
  for (const g of groups) {
    const key = dedupeKey(g);
    const arr = buckets.get(key);
    if (arr) arr.push(g);
    else buckets.set(key, [g]);
  }
  return [...buckets.values()].map((b) => (b.length === 1 ? b[0] : mergeGroups(b)));
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
  const groups = (json.results || [])
    .map(normalizeGroup)
    .filter((g) => g.offers.length > 0);
  return dedupeGroups(groups);
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
