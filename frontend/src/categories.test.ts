import { describe, expect, it } from "vitest";
import { groupByCategory, showSectionHeadings } from "./categories";
import type { Category, Item } from "./types";

const sections: Category[] = [
  { id: "produce", label: "Produce" },
  { id: "dairy-eggs", label: "Dairy & eggs" },
  { id: "other", label: "Other" },
];
let n = 0;
const item = (name: string, category: string): Item => ({
  id: `i${++n}`,
  name,
  category,
  checked: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("groupByCategory", () => {
  it("orders sections the way the server listed them, not by when items were added", () => {
    const groups = groupByCategory([item("Milk", "dairy-eggs"), item("Bananas", "produce"), item("Foil", "other")], sections);
    expect(groups.map((g) => g.label)).toEqual(["Produce", "Dairy & eggs", "Other"]);
  });

  it("leaves out empty sections and keeps the order within a section", () => {
    const groups = groupByCategory([item("Pears", "produce"), item("Apples", "produce")], sections);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => i.name)).toEqual(["Pears", "Apples"]);
  });

  it("puts an item with an unknown section in Other instead of dropping it", () => {
    const groups = groupByCategory([item("Mystery", "something-new")], sections);
    expect(groups.map((g) => [g.id, g.items.length])).toEqual([["other", 1]]);
  });

  it("copes with a server list that has no Other", () => {
    const groups = groupByCategory([item("Mystery", "x")], [{ id: "produce", label: "Produce" }]);
    expect(groups.map((g) => g.label)).toEqual(["Other"]);
  });

  it("returns nothing for no items", () => {
    expect(groupByCategory([], sections)).toEqual([]);
  });
});

describe("showSectionHeadings", () => {
  it("is off when everything is in Other, so the list looks as before", () => {
    expect(showSectionHeadings(groupByCategory([item("a", "other"), item("b", "other")], sections))).toBe(false);
  });
  it("is on as soon as there is a real section, even just one", () => {
    expect(showSectionHeadings(groupByCategory([item("a", "produce")], sections))).toBe(true);
    expect(showSectionHeadings(groupByCategory([item("a", "other"), item("b", "produce")], sections))).toBe(true);
  });
  it("is off for an empty list", () => {
    expect(showSectionHeadings([])).toBe(false);
  });
});
