/**
 * Cake Ordering Swarm — Cake Catalog
 * Used by the Sommelier Agent's RAG (vector similarity search) tool.
 * No external database needed: similarity is computed in-process via cosine distance
 * over TF-IDF term vectors built from each cake's tags + description tokens.
 */

export interface CakeItem {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  allergens: string[];
  tags: string[];
  availableSizes: string[];
  servings: Record<string, string>; // size → approx servings
}

export const CAKE_CATALOG: CakeItem[] = [
  {
    id: 'vegan-choc-001',
    name: 'Vegan Dark Chocolate Torte',
    description:
      'Rich dark chocolate cake made with oat milk, coconut oil, and fair-trade cocoa. Moist, decadent, and completely plant-based. Topped with a glossy dark chocolate ganache and crushed cacao nibs.',
    price: 42.0,
    currency: 'USD',
    allergens: [],
    tags: [
      'vegan', 'chocolate', 'dark', 'plant-based', 'dairy-free', 'egg-free',
      'torte', 'rich', 'ganache', 'cocoa', 'oat milk', 'coconut', 'cacao nibs',
      'allergen-free', 'decadent', 'moist',
    ],
    availableSizes: ['6-inch', '8-inch', '10-inch'],
    servings: { '6-inch': '8–10', '8-inch': '14–16', '10-inch': '22–26' },
  },
  {
    id: 'gf-vanilla-002',
    name: 'Gluten-Free Vanilla Layer Cake',
    description:
      'Classic vanilla sponge made with almond and rice flour blend. Light, fluffy layers with vanilla bean buttercream frosting and raspberry jam filling. Perfect for gluten intolerance or celiac disease.',
    price: 38.0,
    currency: 'USD',
    allergens: ['eggs', 'dairy', 'nuts'],
    tags: [
      'gluten-free', 'vanilla', 'classic', 'sponge', 'buttercream', 'almond',
      'celiac', 'layer', 'fluffy', 'rice flour', 'raspberry', 'jam', 'light',
    ],
    availableSizes: ['6-inch', '8-inch', '10-inch'],
    servings: { '6-inch': '8–10', '8-inch': '14–16', '10-inch': '22–26' },
  },
  {
    id: 'red-velvet-003',
    name: 'Classic Red Velvet',
    description:
      'Iconic red velvet cake with a subtle cocoa flavor and smooth cream cheese frosting. Moist crumb with a brilliant red color from natural beet coloring. A perennial crowd favorite for celebrations.',
    price: 40.0,
    currency: 'USD',
    allergens: ['gluten', 'eggs', 'dairy'],
    tags: [
      'red velvet', 'classic', 'cream cheese', 'cocoa', 'celebration', 'frosting',
      'crowd pleaser', 'moist', 'beetroot', 'red', 'birthday', 'party', 'wedding',
    ],
    availableSizes: ['6-inch', '8-inch', '10-inch', '12-inch'],
    servings: { '6-inch': '8–10', '8-inch': '14–16', '10-inch': '22–26', '12-inch': '30–36' },
  },
  {
    id: 'lemon-drizzle-004',
    name: 'Zesty Lemon Drizzle',
    description:
      'Bright and tangy lemon drizzle cake with fresh lemon zest and a crunchy crystallised sugar crust. Light sponge soaked through with lemon syrup. A beloved classic, refreshing and sharp.',
    price: 32.0,
    currency: 'USD',
    allergens: ['gluten', 'eggs', 'dairy'],
    tags: [
      'lemon', 'citrus', 'drizzle', 'zesty', 'bright', 'tangy', 'classic',
      'sponge', 'syrup', 'sugar crust', 'refreshing', 'sharp', 'afternoon tea',
    ],
    availableSizes: ['6-inch', '8-inch'],
    servings: { '6-inch': '8–10', '8-inch': '14–16' },
  },
  {
    id: 'vegan-carrot-005',
    name: 'Vegan Spiced Carrot Cake',
    description:
      'Warmly spiced carrot cake with cinnamon, ginger, and nutmeg. Fully plant-based using flaxseed eggs and coconut cream cheese frosting. Studded with walnuts and golden raisins. Autumnal and comforting.',
    price: 39.0,
    currency: 'USD',
    allergens: ['nuts'],
    tags: [
      'vegan', 'carrot', 'spiced', 'cinnamon', 'ginger', 'nutmeg', 'plant-based',
      'dairy-free', 'egg-free', 'walnut', 'raisin', 'autumn', 'warm', 'cosy',
      'flaxseed', 'coconut', 'comforting',
    ],
    availableSizes: ['6-inch', '8-inch', '10-inch'],
    servings: { '6-inch': '8–10', '8-inch': '14–16', '10-inch': '22–26' },
  },
  {
    id: 'gf-choc-hazelnut-006',
    name: 'Gluten-Free Chocolate Hazelnut Cake',
    description:
      'Indulgent chocolate hazelnut cake using almond flour and hazelnut paste. Rich, fudgy texture with a hazelnut praline crunch topping. Gluten-free and grain-free, suitable for celiac guests.',
    price: 45.0,
    currency: 'USD',
    allergens: ['nuts', 'eggs', 'dairy'],
    tags: [
      'gluten-free', 'chocolate', 'hazelnut', 'praline', 'fudgy', 'grain-free',
      'almond flour', 'rich', 'indulgent', 'celiac', 'nutty', 'crunchy', 'fudge',
    ],
    availableSizes: ['6-inch', '8-inch'],
    servings: { '6-inch': '8–10', '8-inch': '14–16' },
  },
  {
    id: 'strawberry-cream-007',
    name: 'Summer Strawberry Cream Cake',
    description:
      'Light and airy vanilla sponge layered with fresh local strawberries and whipped cream. Decorated with whole strawberries and edible flowers. Seasonal, elegant, and perfect for summer parties.',
    price: 44.0,
    currency: 'USD',
    allergens: ['gluten', 'eggs', 'dairy'],
    tags: [
      'strawberry', 'cream', 'summer', 'fresh', 'fruit', 'light', 'airy',
      'seasonal', 'elegant', 'flowers', 'vanilla', 'party', 'local', 'garden',
    ],
    availableSizes: ['6-inch', '8-inch', '10-inch'],
    servings: { '6-inch': '8–10', '8-inch': '14–16', '10-inch': '22–26' },
  },
  {
    id: 'vegan-gf-matcha-008',
    name: 'Vegan & Gluten-Free Matcha Cake',
    description:
      'Japanese-inspired matcha green tea cake, fully vegan and gluten-free. Made with rice flour, coconut milk, and premium ceremonial-grade matcha from Uji, Japan. Earthy, slightly bitter, and beautifully green.',
    price: 48.0,
    currency: 'USD',
    allergens: [],
    tags: [
      'vegan', 'gluten-free', 'matcha', 'green tea', 'japanese', 'plant-based',
      'dairy-free', 'egg-free', 'rice flour', 'ceremonial', 'earthy', 'allergen-free',
      'uji', 'coconut milk', 'unique', 'exotic', 'bitter', 'green',
    ],
    availableSizes: ['6-inch', '8-inch'],
    servings: { '6-inch': '8–10', '8-inch': '14–16' },
  },
  {
    id: 'coffee-walnut-009',
    name: 'Coffee & Walnut Celebration Cake',
    description:
      'Classic coffee and walnut cake with espresso-infused sponge, coffee buttercream, and walnut halves arranged on top. Bold coffee flavor balanced with the earthiness of walnuts.',
    price: 36.0,
    currency: 'USD',
    allergens: ['gluten', 'eggs', 'dairy', 'nuts'],
    tags: [
      'coffee', 'walnut', 'espresso', 'classic', 'traditional', 'buttercream',
      'celebration', 'bold', 'nuts', 'afternoon tea', 'classic', 'earthy', 'caffeine',
    ],
    availableSizes: ['6-inch', '8-inch', '10-inch'],
    servings: { '6-inch': '8–10', '8-inch': '14–16', '10-inch': '22–26' },
  },
  {
    id: 'choc-birthday-010',
    name: 'Ultimate Chocolate Birthday Cake',
    description:
      'Triple-layered chocolate sponge with milk chocolate ganache and chocolate buttercream between each layer. Decorated with chocolate curls, sprinkles, and a handwritten edible message. The definitive birthday experience.',
    price: 50.0,
    currency: 'USD',
    allergens: ['gluten', 'eggs', 'dairy', 'soy'],
    tags: [
      'chocolate', 'birthday', 'celebration', 'triple layer', 'ganache', 'buttercream',
      'sprinkles', 'party', 'milk chocolate', 'decadent', 'personalised', 'message',
      'kids', 'festive',
    ],
    availableSizes: ['6-inch', '8-inch', '10-inch', '12-inch'],
    servings: { '6-inch': '8–10', '8-inch': '14–16', '10-inch': '22–26', '12-inch': '30–36' },
  },
  {
    id: 'vegan-biscoff-011',
    name: 'Vegan Biscoff Caramel Cake',
    description:
      'Showstopping vegan cake with caramelised Biscoff spread, salted caramel drizzle, and crushed Lotus biscuits. Dairy-free and egg-free. Utterly indulgent and Instagram-worthy.',
    price: 46.0,
    currency: 'USD',
    allergens: ['gluten'],
    tags: [
      'vegan', 'biscoff', 'caramel', 'salted caramel', 'lotus', 'dairy-free',
      'egg-free', 'showstopper', 'instagram', 'trendy', 'indulgent', 'sweet',
      'biscuit', 'plant-based',
    ],
    availableSizes: ['6-inch', '8-inch'],
    servings: { '6-inch': '8–10', '8-inch': '14–16' },
  },
  {
    id: 'gf-orange-almond-012',
    name: 'Gluten-Free Orange & Almond Flourless Cake',
    description:
      'Whole-orange almond cake: entire oranges are boiled then blended into an almond meal batter. Dense, moist, fragrant, and naturally gluten-free. Served with a Grand Marnier orange glaze.',
    price: 40.0,
    currency: 'USD',
    allergens: ['nuts', 'eggs'],
    tags: [
      'gluten-free', 'orange', 'almond', 'flourless', 'citrus', 'fragrant',
      'dense', 'moist', 'grand marnier', 'glaze', 'mediterranean', 'whole orange',
      'grain-free', 'dairy-free',
    ],
    availableSizes: ['6-inch', '8-inch'],
    servings: { '6-inch': '8–10', '8-inch': '14–16' },
  },
];

// ─────────────────────────────────────────────────
// Pure-TypeScript cosine-similarity RAG engine
// No external dependencies required.
// ─────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'with', 'of', 'in', 'on', 'at', 'to',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'its', 'from',
  'this', 'that', 'by', 'as', 'if', 'so', 'but', 'not', 'no',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

/** Build a vocabulary from the entire catalog. */
function buildVocabulary(): string[] {
  const vocab = new Set<string>();
  for (const cake of CAKE_CATALOG) {
    for (const t of tokenize(cake.description + ' ' + cake.tags.join(' '))) {
      vocab.add(t);
    }
  }
  return Array.from(vocab).sort();
}

const VOCABULARY = buildVocabulary();

/** Build a TF-IDF-style term vector for a block of text. */
function buildVector(text: string): number[] {
  const tokens = tokenize(text);
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  return VOCABULARY.map(v => counts.get(v) || 0);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// Pre-build document vectors once at module load (fast at query time).
const CAKE_VECTORS: number[][] = CAKE_CATALOG.map(cake =>
  buildVector(cake.description + ' ' + cake.tags.join(' '))
);

export interface SearchResult {
  cake: CakeItem;
  score: number;
}

/**
 * Search the cake catalog using cosine similarity.
 * Returns the top-k results sorted by relevance (descending).
 */
export function searchCakeCatalog(query: string, topK = 3): SearchResult[] {
  const qVec = buildVector(query);
  const scored = CAKE_CATALOG.map((cake, i) => ({
    cake,
    score: cosine(qVec, CAKE_VECTORS[i]),
  }));
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(r => r.score > 0);
}
