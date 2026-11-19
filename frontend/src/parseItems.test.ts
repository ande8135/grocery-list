import { describe, expect, it } from "vitest";
import { parseItems } from "./parseItems";

describe("parseItems", () => {
  it("splits on commas and 'and', dropping articles", () => {
    expect(parseItems("milk, eggs and a loaf of bread")).toEqual(["milk", "eggs", "loaf of bread"]);
  });
  it("strips command phrases and trailing 'to the list'", () => {
    expect(parseItems("Add bananas and olive oil to the list")).toEqual(["bananas", "olive oil"]);
    expect(parseItems("we need some butter then coffee please")).toEqual(["butter", "coffee"]);
  });
  it("keeps quantities and de-duplicates", () => {
    expect(parseItems("two pounds of chicken and 3 avocados and 3 Avocados")).toEqual([
      "two pounds of chicken",
      "3 avocados",
    ]);
  });
  it("handles empty or filler-only input", () => {
    expect(parseItems("")).toEqual([]);
    expect(parseItems("add, and")).toEqual([]);
  });
});
