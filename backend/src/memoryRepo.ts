import type { Item, ItemPatch, ItemRepo } from "./types";

export class MemoryRepo implements ItemRepo {
  private items = new Map<string, Item>();

  async list(): Promise<Item[]> {
    return [...this.items.values()].map((i) => ({ ...i }));
  }

  async create(item: Item): Promise<boolean> {
    if (this.items.has(item.id)) return false;
    this.items.set(item.id, { ...item });
    return true;
  }

  async update(id: string, patch: ItemPatch, now: string): Promise<Item | null> {
    const existing = this.items.get(id);
    if (!existing) return null;
    const next: Item = { ...existing, ...patch, updatedAt: now };
    this.items.set(id, next);
    return { ...next };
  }

  async remove(id: string): Promise<void> {
    this.items.delete(id);
  }

  async clearChecked(): Promise<number> {
    let removed = 0;
    for (const [id, item] of this.items) {
      if (item.checked) {
        this.items.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
