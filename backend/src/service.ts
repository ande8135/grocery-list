import { randomBytes, randomUUID } from "node:crypto";
import { HttpError } from "./errors";
import type { Store } from "./store";
import {
  type AuthUser,
  type GroceryList,
  INVITE_TTL_SECONDS,
  type Invite,
  type Item,
  MAX_LISTS_PER_HOUSEHOLD,
  type Member,
} from "./types";

const ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** Collapse whitespace, drop control characters, enforce a length. */
export function cleanText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") throw new HttpError(400, `${label} must be a string`);
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length === 0) throw new HttpError(400, `${label} cannot be empty`);
  if (text.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer`);
  return text;
}

const notFound = () => new HttpError(404, "Not found");

/**
 * All the rules. Every method takes the authenticated user; a household's data is
 * only visible to its members (non-members get a 404, never a hint it exists).
 *
 *   owner  : everything a member can do, plus invite, remove members, delete lists
 *   member : view the household, create/rename lists, use items, leave
 */
export class Service {
  constructor(
    private readonly store: Store,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private now() {
    return this.clock().toISOString();
  }
  private nowSeconds() {
    return Math.floor(this.clock().getTime() / 1000);
  }

  private async requireMember(hid: string, userId: string): Promise<Member> {
    const member = await this.store.getMember(hid, userId);
    if (!member) throw notFound();
    return member;
  }

  private async requireOwner(hid: string, userId: string): Promise<Member> {
    const member = await this.requireMember(hid, userId);
    if (member.role !== "owner") throw new HttpError(403, "Only the household owner can do that");
    return member;
  }

  private async requireList(hid: string, lid: string, userId: string): Promise<GroceryList> {
    await this.requireMember(hid, userId);
    const list = await this.store.getList(hid, lid);
    if (!list) throw notFound();
    return list;
  }

  // ---------- account ----------

  async me(auth: AuthUser) {
    const user = await this.store.upsertUser(auth, this.now());
    const memberships = await this.store.listMemberships(auth.userId);
    return {
      user: { id: user.userId, name: user.name, email: user.email, ownsHousehold: Boolean(user.ownedHouseholdId) },
      households: memberships
        .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
        .map((m) => ({ id: m.householdId, name: m.householdName, role: m.role })),
    };
  }

  // ---------- households ----------

  async createHousehold(auth: AuthUser, body: { name?: unknown; listName?: unknown }) {
    const name = cleanText(body.name, "name", 60);
    const listName = body.listName === undefined ? "Groceries" : cleanText(body.listName, "listName", 40);
    const now = this.now();
    await this.store.upsertUser(auth, now);

    const householdId = randomUUID();
    const result = await this.store.createHousehold({
      household: { id: householdId, name, ownerId: auth.userId, createdAt: now, listCount: 1 },
      owner: { householdId, userId: auth.userId, name: auth.name, email: auth.email, role: "owner", joinedAt: now },
      firstList: { id: randomUUID(), householdId, name: listName, createdAt: now },
    });
    if (result === "already-owner") throw new HttpError(409, "You already own a household");
    return this.getHousehold(auth, householdId);
  }

  async getHousehold(auth: AuthUser, hid: string) {
    const me = await this.requireMember(hid, auth.userId);
    const [household, members, lists] = await Promise.all([
      this.store.getHousehold(hid),
      this.store.listMembers(hid),
      this.store.listLists(hid),
    ]);
    if (!household) throw notFound();
    return {
      household: { id: household.id, name: household.name, ownerId: household.ownerId, role: me.role, maxLists: MAX_LISTS_PER_HOUSEHOLD },
      members: members
        .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
        .map((m) => ({ userId: m.userId, name: m.name, email: m.email, role: m.role })),
      lists: lists.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((l) => ({ id: l.id, name: l.name })),
    };
  }

  async removeMember(auth: AuthUser, hid: string, targetId: string) {
    const me = await this.requireMember(hid, auth.userId);
    if (targetId === auth.userId) {
      if (me.role === "owner") throw new HttpError(400, "The owner can't leave their household");
    } else {
      await this.requireOwner(hid, auth.userId);
    }
    if (!(await this.store.removeMember(hid, targetId))) throw notFound();
  }

  // ---------- invites ----------

  async createInvite(auth: AuthUser, hid: string) {
    await this.requireOwner(hid, auth.userId);
    const household = await this.store.getHousehold(hid);
    if (!household) throw notFound();
    const now = this.nowSeconds();
    const invite: Invite = {
      token: randomBytes(24).toString("base64url"),
      householdId: hid,
      householdName: household.name,
      invitedBy: auth.userId,
      createdAt: this.now(),
      expiresAt: now + INVITE_TTL_SECONDS,
    };
    await this.store.createInvite(invite);
    return { token: invite.token, expiresAt: invite.expiresAt };
  }

  private async liveInvite(token: string): Promise<Invite> {
    const invite = await this.store.getInvite(token);
    if (!invite || invite.expiresAt <= this.nowSeconds()) throw new HttpError(404, "This invite is invalid or has expired");
    return invite;
  }

  async previewInvite(auth: AuthUser, token: string) {
    const invite = await this.liveInvite(token);
    const existing = await this.store.getMember(invite.householdId, auth.userId);
    return { householdName: invite.householdName, alreadyMember: Boolean(existing), householdId: invite.householdId };
  }

  async acceptInvite(auth: AuthUser, token: string) {
    const invite = await this.liveInvite(token);
    await this.store.upsertUser(auth, this.now());
    const member: Member = {
      householdId: invite.householdId,
      userId: auth.userId,
      name: auth.name,
      email: auth.email,
      role: "member",
      joinedAt: this.now(),
    };
    const result = await this.store.acceptInvite(invite, member, this.nowSeconds());
    if (result === "invalid") throw new HttpError(404, "This invite is invalid or has expired");
    if (result === "already-member") throw new HttpError(409, "You're already in this household");
    return this.getHousehold(auth, invite.householdId);
  }

  // ---------- lists ----------

  async createList(auth: AuthUser, hid: string, body: { name?: unknown }) {
    await this.requireMember(hid, auth.userId);
    const list: GroceryList = {
      id: randomUUID(),
      householdId: hid,
      name: cleanText(body.name, "name", 40),
      createdAt: this.now(),
    };
    if ((await this.store.createList(list, MAX_LISTS_PER_HOUSEHOLD)) === "limit") {
      throw new HttpError(409, `A household can have at most ${MAX_LISTS_PER_HOUSEHOLD} lists`);
    }
    return { id: list.id, name: list.name };
  }

  async renameList(auth: AuthUser, hid: string, lid: string, body: { name?: unknown }) {
    await this.requireList(hid, lid, auth.userId);
    const list = await this.store.renameList(hid, lid, cleanText(body.name, "name", 40));
    if (!list) throw notFound();
    return { id: list.id, name: list.name };
  }

  async deleteList(auth: AuthUser, hid: string, lid: string) {
    await this.requireOwner(hid, auth.userId);
    const household = await this.store.getHousehold(hid);
    if (household && household.listCount <= 1) throw new HttpError(400, "A household needs at least one list");
    if (!(await this.store.deleteList(hid, lid))) throw notFound();
  }

  // ---------- items ----------

  async listItems(auth: AuthUser, hid: string, lid: string): Promise<Item[]> {
    await this.requireList(hid, lid, auth.userId);
    return this.store.items.list(lid);
  }

  async createItem(auth: AuthUser, hid: string, lid: string, body: { id?: unknown; name?: unknown }) {
    await this.requireList(hid, lid, auth.userId);
    let id: string = randomUUID();
    if (body.id !== undefined) {
      // Clients may supply the id so optimistic UI updates need no id swap.
      if (typeof body.id !== "string" || !ID_PATTERN.test(body.id)) throw new HttpError(400, "id is invalid");
      id = body.id;
    }
    const now = this.now();
    const item: Item = { id, name: cleanText(body.name, "name", 80), checked: false, createdAt: now, updatedAt: now };
    if (!(await this.store.items.create(lid, item))) throw new HttpError(409, "Item already exists");
    return item;
  }

  async updateItem(auth: AuthUser, hid: string, lid: string, id: string, body: { name?: unknown; checked?: unknown }) {
    await this.requireList(hid, lid, auth.userId);
    const patch: { name?: string; checked?: boolean } = {};
    if (body.name !== undefined) patch.name = cleanText(body.name, "name", 80);
    if (body.checked !== undefined) {
      if (typeof body.checked !== "boolean") throw new HttpError(400, "checked must be a boolean");
      patch.checked = body.checked;
    }
    if (Object.keys(patch).length === 0) throw new HttpError(400, "Nothing to update");
    const item = await this.store.items.update(lid, id, patch, this.now());
    if (!item) throw notFound();
    return item;
  }

  async removeItem(auth: AuthUser, hid: string, lid: string, id: string) {
    await this.requireList(hid, lid, auth.userId);
    await this.store.items.remove(lid, id);
  }

  async clearChecked(auth: AuthUser, hid: string, lid: string) {
    await this.requireList(hid, lid, auth.userId);
    return { removed: await this.store.items.clearChecked(lid) };
  }
}
