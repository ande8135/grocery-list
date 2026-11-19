import type { ItemStore, Store } from "./store";
import type { GroceryList, Household, Invite, Item, ItemPatch, Member, Membership, User } from "./types";

class MemoryItems implements ItemStore {
  private lists = new Map<string, Map<string, Item>>();
  private forList(listId: string) {
    let m = this.lists.get(listId);
    if (!m) this.lists.set(listId, (m = new Map()));
    return m;
  }
  async list(listId: string) {
    return [...this.forList(listId).values()].map((i) => ({ ...i }));
  }
  async create(listId: string, item: Item) {
    const m = this.forList(listId);
    if (m.has(item.id)) return false;
    m.set(item.id, { ...item });
    return true;
  }
  async update(listId: string, id: string, patch: ItemPatch, now: string) {
    const m = this.forList(listId);
    const existing = m.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updatedAt: now };
    m.set(id, next);
    return { ...next };
  }
  async remove(listId: string, id: string) {
    this.forList(listId).delete(id);
  }
  async clearChecked(listId: string) {
    const m = this.forList(listId);
    let removed = 0;
    for (const [id, item] of m) {
      if (item.checked) {
        m.delete(id);
        removed++;
      }
    }
    return removed;
  }
  async clearAll(listId: string) {
    this.lists.delete(listId);
  }
}

/** In-memory Store used by tests and the local dev server. Mirrors the DynamoDB store's semantics. */
export class MemoryStore implements Store {
  items = new MemoryItems();
  private users = new Map<string, User>();
  private households = new Map<string, Household>();
  private members = new Map<string, Member>(); // `${hid}/${uid}`
  private lists = new Map<string, GroceryList>(); // `${hid}/${lid}`
  private invites = new Map<string, Invite>();

  async upsertUser(u: { userId: string; email: string; name: string }, now: string) {
    const existing = this.users.get(u.userId);
    const user: User = { ...existing, ...u, createdAt: existing?.createdAt ?? now };
    this.users.set(u.userId, user);
    return { ...user };
  }
  async getUser(userId: string) {
    const u = this.users.get(userId);
    return u ? { ...u } : null;
  }

  async createHousehold({ household, owner, firstList }: { household: Household; owner: Member; firstList: GroceryList }) {
    const user = this.users.get(owner.userId);
    if (user?.ownedHouseholdId) return "already-owner" as const;
    this.users.set(owner.userId, { ...(user as User), ownedHouseholdId: household.id });
    this.households.set(household.id, { ...household, listCount: 1 });
    this.members.set(`${household.id}/${owner.userId}`, { ...owner });
    this.lists.set(`${household.id}/${firstList.id}`, { ...firstList });
    return "ok" as const;
  }
  async getHousehold(id: string) {
    const h = this.households.get(id);
    return h ? { ...h } : null;
  }
  async listMemberships(userId: string): Promise<Membership[]> {
    return [...this.members.values()]
      .filter((m) => m.userId === userId)
      .map((m) => ({
        householdId: m.householdId,
        householdName: this.households.get(m.householdId)?.name ?? "",
        role: m.role,
        joinedAt: m.joinedAt,
      }));
  }
  async getMember(hid: string, uid: string) {
    const m = this.members.get(`${hid}/${uid}`);
    return m ? { ...m } : null;
  }
  async listMembers(hid: string) {
    return [...this.members.values()].filter((m) => m.householdId === hid).map((m) => ({ ...m }));
  }
  async removeMember(hid: string, uid: string) {
    return this.members.delete(`${hid}/${uid}`);
  }

  async createList(list: GroceryList, max: number) {
    const h = this.households.get(list.householdId);
    if (!h || h.listCount >= max) return "limit" as const;
    h.listCount++;
    this.lists.set(`${list.householdId}/${list.id}`, { ...list });
    return "ok" as const;
  }
  async listLists(hid: string) {
    return [...this.lists.values()].filter((l) => l.householdId === hid).map((l) => ({ ...l }));
  }
  async getList(hid: string, lid: string) {
    const l = this.lists.get(`${hid}/${lid}`);
    return l ? { ...l } : null;
  }
  async renameList(hid: string, lid: string, name: string) {
    const l = this.lists.get(`${hid}/${lid}`);
    if (!l) return null;
    l.name = name;
    return { ...l };
  }
  async deleteList(hid: string, lid: string) {
    if (!this.lists.delete(`${hid}/${lid}`)) return false;
    const h = this.households.get(hid);
    if (h) h.listCount--;
    await this.items.clearAll(lid);
    return true;
  }

  async createInvite(invite: Invite) {
    this.invites.set(invite.token, { ...invite });
  }
  async getInvite(token: string) {
    const i = this.invites.get(token);
    return i ? { ...i } : null;
  }
  async acceptInvite(invite: Invite, member: Member, nowSeconds: number) {
    const current = this.invites.get(invite.token);
    if (!current || current.expiresAt <= nowSeconds) return "invalid" as const;
    if (this.members.has(`${member.householdId}/${member.userId}`)) return "already-member" as const;
    this.invites.delete(invite.token);
    this.members.set(`${member.householdId}/${member.userId}`, { ...member });
    return "ok" as const;
  }
}
