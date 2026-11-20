import type { Category, Item } from "./types";

/** Where an item goes when its section isn't one the server listed. */
export const FALLBACK_CATEGORY = "other";

export interface Group extends Category {
  items: Item[];
}

/**
 * Splits items into store sections, in the server's order (a walk through the store).
 * Sections with nothing in them are left out. Items keep the order they came in.
 */
export function groupByCategory(items: Item[], categories: Category[]): Group[] {
  const known = new Set(categories.map((c) => c.id));
  const byId = new Map<string, Item[]>();
  for (const item of items) {
    const id = known.has(item.category) ? item.category : FALLBACK_CATEGORY;
    const list = byId.get(id);
    if (list) list.push(item);
    else byId.set(id, [item]);
  }
  const groups: Group[] = [];
  for (const c of categories) {
    const list = byId.get(c.id);
    if (list) {
      groups.push({ ...c, items: list });
      byId.delete(c.id);
    }
  }
  for (const [id, list] of byId) groups.push({ id, label: "Other", items: list }); // only if the server's list lacks "other"
  return groups;
}

/**
 * Headings only help when there is something to tell apart. If everything is in "Other"
 * (for example categorization is switched off) the list looks as it always did.
 */
export function showSectionHeadings(groups: Group[]): boolean {
  return groups.length > 1 || (groups.length === 1 && groups[0]!.id !== FALLBACK_CATEGORY);
}
