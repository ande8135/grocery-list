import type {
  GroceryList,
  Household,
  Invite,
  Item,
  ItemPatch,
  Member,
  Membership,
  User,
} from "./types";

/** Items belong to a list. */
export interface ItemStore {
  list(listId: string): Promise<Item[]>;
  /** Returns false when an item with that id already exists. */
  create(listId: string, item: Item): Promise<boolean>;
  /** Returns the updated item, or null when it does not exist. */
  update(listId: string, id: string, patch: ItemPatch, now: string): Promise<Item | null>;
  remove(listId: string, id: string): Promise<void>;
  /** Deletes every checked item and returns how many were removed. */
  clearChecked(listId: string): Promise<number>;
  /** Deletes every item (used when a list is deleted). */
  clearAll(listId: string): Promise<void>;
}

/**
 * Storage port. Every method that touches more than one record is atomic
 * (a DynamoDB transaction in AWS), because the household rules are invariants:
 *  - a user owns at most one household,
 *  - a household has at most `max` lists,
 *  - an invite can be used once.
 * Authorization lives in the service; the store only enforces those invariants.
 */
export interface Store {
  items: ItemStore;

  upsertUser(user: { userId: string; email: string; name: string }, now: string): Promise<User>;
  getUser(userId: string): Promise<User | null>;

  /** "already-owner" when the user already owns a household (nothing is written). */
  createHousehold(args: { household: Household; owner: Member; firstList: GroceryList }): Promise<"ok" | "already-owner">;
  getHousehold(id: string): Promise<Household | null>;
  listMemberships(userId: string): Promise<Membership[]>;
  getMember(householdId: string, userId: string): Promise<Member | null>;
  listMembers(householdId: string): Promise<Member[]>;
  /** Returns false when the user was not a member. */
  removeMember(householdId: string, userId: string): Promise<boolean>;

  /** "limit" when the household already has `max` lists. */
  createList(list: GroceryList, max: number): Promise<"ok" | "limit">;
  listLists(householdId: string): Promise<GroceryList[]>;
  getList(householdId: string, listId: string): Promise<GroceryList | null>;
  renameList(householdId: string, listId: string, name: string): Promise<GroceryList | null>;
  /** Deletes the list and its items. Returns false when it did not exist. */
  deleteList(householdId: string, listId: string): Promise<boolean>;

  createInvite(invite: Invite): Promise<void>;
  getInvite(token: string): Promise<Invite | null>;
  /** Atomically consumes the invite and adds the member. */
  acceptInvite(invite: Invite, member: Member, nowSeconds: number): Promise<"ok" | "invalid" | "already-member">;
}
