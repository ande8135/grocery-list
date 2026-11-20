import { type CategoryId } from "./categories";

/**
 * Picks the store section for an item name.
 *
 * Returns null when it could not decide (the model was unreachable, timed out, or said something
 * that is not a section). A null answer is never remembered, so the next add of that item tries
 * again. Implementations must not throw.
 */
export interface Categorizer {
  categorize(name: string): Promise<CategoryId | null>;
}

/** Used when categorization is switched off: every item stays in "Other". */
export const noopCategorizer: Categorizer = {
  categorize: async () => null,
};

/**
 * A tiny keyword lookup for the local dev server, so the sections can be tried without AWS.
 * Not used in production and deliberately small.
 */
const DEV_WORDS: Record<Exclude<CategoryId, "other">, string[]> = {
  produce: ["banana", "apple", "lettuce", "tomato", "onion", "potato", "carrot", "spinach", "avocado", "lemon", "berry", "grape"],
  bakery: ["bread", "bagel", "tortilla", "bun", "roll", "croissant"],
  "meat-seafood": ["chicken", "beef", "pork", "salmon", "shrimp", "bacon", "sausage", "steak", "turkey"],
  // frozen first: "ice cream" must win over "cream"
  frozen: ["frozen", "ice cream", "pizza"],
  "dairy-eggs": ["milk", "cheese", "yogurt", "butter", "cream", "egg"],
  pantry: ["rice", "pasta", "flour", "sugar", "oil", "cereal", "sauce", "beans", "salt", "pepper"],
  snacks: ["chips", "cookie", "cracker", "candy", "nuts", "popcorn"],
  beverages: ["water", "juice", "soda", "coffee", "tea", "beer", "wine"],
  household: ["paper towel", "trash bag", "detergent", "dish soap", "sponge", "battery", "foil"],
  "personal-care": ["shampoo", "toothpaste", "deodorant", "soap", "vitamin"],
};

export const devCategorizer: Categorizer = {
  async categorize(name) {
    const lower = name.toLowerCase();
    for (const [id, words] of Object.entries(DEV_WORDS)) {
      if (words.some((w) => lower.includes(w))) return id as CategoryId;
    }
    return "other";
  },
};
