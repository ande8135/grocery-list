import { describe, expect, it } from "vitest";
import { CATEGORIES, categoryKey, categorizerSystemPrompt, isCategoryId, parseCategory } from "./categories";

describe("categoryKey", () => {
  it("treats case, spacing, punctuation and plurals as the same item", () => {
    const keys = ["Bananas", "banana", "  BANANAS ", "banana!"].map(categoryKey);
    expect(new Set(keys)).toEqual(new Set(["banana"]));
  });

  it("only changes the last word's plural", () => {
    expect(categoryKey("Cherry tomatoes")).toBe("cherry tomato");
    expect(categoryKey("Blueberries")).toBe("blueberry");
    expect(categoryKey("Paper towels")).toBe("paper towel");
  });

  it("leaves words that only look plural alone", () => {
    expect(categoryKey("Hummus")).toBe("hummus");
    expect(categoryKey("Asparagus")).toBe("asparagus");
  });

  it("drops accents", () => {
    expect(categoryKey("Jalapeño")).toBe("jalapeno");
  });

  it("keeps different items apart", () => {
    expect(categoryKey("Milk")).not.toBe(categoryKey("Almond milk"));
  });

  it("still returns something for a name with no letters", () => {
    expect(categoryKey("🍌")).toBe("🍌");
  });
});

describe("parseCategory", () => {
  it("accepts an id, a label, or either with decoration", () => {
    expect(parseCategory("produce")).toBe("produce");
    expect(parseCategory("Meat & seafood")).toBe("meat-seafood");
    expect(parseCategory("  dairy-eggs.\n")).toBe("dairy-eggs");
    expect(parseCategory('"Frozen"')).toBe("frozen");
  });

  it("rejects anything that is not exactly a section", () => {
    expect(parseCategory("")).toBeNull();
    expect(parseCategory("fruit")).toBeNull();
    expect(parseCategory("produce, because it is a fruit")).toBeNull();
    expect(parseCategory("I think produce")).toBeNull();
  });
});

describe("sections", () => {
  it("have unique ids and end with other", () => {
    const ids = CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.at(-1)).toBe("other");
  });

  it("isCategoryId only accepts known ids", () => {
    expect(isCategoryId("produce")).toBe(true);
    expect(isCategoryId("Produce")).toBe(false);
    expect(isCategoryId(undefined)).toBe(false);
  });

  it("the model prompt lists every section", () => {
    const prompt = categorizerSystemPrompt();
    for (const c of CATEGORIES) expect(prompt).toContain(`- ${c.id}:`);
  });
});
