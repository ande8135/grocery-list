export interface Item {
  id: string;
  name: string;
  checked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ItemPatch {
  name?: string;
  checked?: boolean;
}

/** Storage abstraction so the handler can run against DynamoDB or memory (tests, local dev). */
export interface ItemRepo {
  list(): Promise<Item[]>;
  /** Returns false when an item with that id already exists. */
  create(item: Item): Promise<boolean>;
  /** Returns the updated item, or null when it does not exist. */
  update(id: string, patch: ItemPatch, now: string): Promise<Item | null>;
  remove(id: string): Promise<void>;
  /** Deletes every checked item and returns how many were removed. */
  clearChecked(): Promise<number>;
}
