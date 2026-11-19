import { beforeEach, describe, expect, it } from "vitest";
import { HttpError } from "./errors";
import { Service } from "./service";
import { storeFactories } from "./testStores";
import type { AuthUser } from "./types";

const alice: AuthUser = { userId: "u-alice", email: "alice@example.test", name: "Alice" };
const bob: AuthUser = { userId: "u-bob", email: "bob@example.test", name: "Bob" };
const carol: AuthUser = { userId: "u-carol", email: "carol@example.test", name: "Carol" };

async function status(p: Promise<unknown>): Promise<number> {
  try {
    await p;
    return 200;
  } catch (e) {
    if (e instanceof HttpError) return e.status;
    throw e;
  }
}

describe.each(storeFactories)("household rules (%s store)", (_name, createStore) => {
  let svc: Service;
  let nowMs: number;

  beforeEach(async () => {
    nowMs = Date.UTC(2026, 0, 1);
    svc = new Service(await createStore(), () => new Date(nowMs));
  });

  const setup = async () => {
    const h = await svc.createHousehold(alice, { name: "The Smiths" });
    return { hid: h.household.id, lid: h.lists[0]!.id };
  };
  const join = async (user: AuthUser, hid: string) => {
    const { token } = await svc.createInvite(alice, hid);
    await svc.acceptInvite(user, token);
  };

  describe("accounts", () => {
    it("creates a profile on first sign-in with no households", async () => {
      const me = await svc.me(alice);
      expect(me.user).toMatchObject({ id: "u-alice", name: "Alice", ownsHousehold: false });
      expect(me.households).toEqual([]);
    });
  });

  describe("households", () => {
    it("creates a household with the owner and a first list", async () => {
      const h = await svc.createHousehold(alice, { name: "  The   Smiths " });
      expect(h.household).toMatchObject({ name: "The Smiths", role: "owner", ownerId: "u-alice", maxLists: 10 });
      expect(h.members.map((m) => [m.userId, m.role])).toEqual([["u-alice", "owner"]]);
      expect(h.lists.map((l) => l.name)).toEqual(["Groceries"]);
      const me = await svc.me(alice);
      expect(me.user.ownsHousehold).toBe(true);
      expect(me.households).toEqual([{ id: h.household.id, name: "The Smiths", role: "owner" }]);
    });

    it("lets a user own only one household", async () => {
      await svc.createHousehold(alice, { name: "One" });
      expect(await status(svc.createHousehold(alice, { name: "Two" }))).toBe(409);
      expect((await svc.me(alice)).households).toHaveLength(1);
    });

    it("validates the name", async () => {
      expect(await status(svc.createHousehold(alice, { name: "  " }))).toBe(400);
      expect(await status(svc.createHousehold(alice, { name: "x".repeat(61) }))).toBe(400);
      expect(await status(svc.createHousehold(alice, {}))).toBe(400);
      // a rejected attempt must not consume the one-household allowance
      expect(await status(svc.createHousehold(alice, { name: "Fine" }))).toBe(200);
    });

    it("hides a household from non-members", async () => {
      const { hid, lid } = await setup();
      expect(await status(svc.getHousehold(bob, hid))).toBe(404);
      expect(await status(svc.listItems(bob, hid, lid))).toBe(404);
      expect(await status(svc.createList(bob, hid, { name: "Sneaky" }))).toBe(404);
      expect(await status(svc.createInvite(bob, hid))).toBe(404);
    });

    it("isolates households: another household's list id doesn't work under your own household id", async () => {
      const a = await setup();
      const b = await svc.createHousehold(bob, { name: "Bobs" });
      expect(await status(svc.listItems(bob, b.household.id, a.lid))).toBe(404);
      expect(await status(svc.createItem(bob, b.household.id, a.lid, { name: "x" }))).toBe(404);
    });
  });

  describe("invites and membership", () => {
    it("lets an invited user join, once", async () => {
      const { hid } = await setup();
      const { token } = await svc.createInvite(alice, hid);

      expect(await svc.previewInvite(bob, token)).toMatchObject({ householdName: "The Smiths", alreadyMember: false });
      const joined = await svc.acceptInvite(bob, token);
      expect(joined.household).toMatchObject({ id: hid, role: "member" });
      expect(joined.members.map((m) => m.name).sort()).toEqual(["Alice", "Bob"]);
      expect((await svc.me(bob)).households).toEqual([{ id: hid, name: "The Smiths", role: "member" }]);

      // single use
      expect(await status(svc.acceptInvite(carol, token))).toBe(404);
      expect(await status(svc.previewInvite(carol, token))).toBe(404);
    });

    it("doesn't consume an invite when the user is already a member", async () => {
      const { hid } = await setup();
      await join(bob, hid);
      const { token } = await svc.createInvite(alice, hid);
      expect(await svc.previewInvite(bob, token)).toMatchObject({ alreadyMember: true });
      expect(await status(svc.acceptInvite(bob, token))).toBe(409);
      await svc.acceptInvite(carol, token); // still usable by someone else
    });

    it("expires invites after 7 days", async () => {
      const { hid } = await setup();
      const { token } = await svc.createInvite(alice, hid);
      nowMs += 7 * 24 * 3600 * 1000 + 1000;
      expect(await status(svc.previewInvite(bob, token))).toBe(404);
      expect(await status(svc.acceptInvite(bob, token))).toBe(404);
    });

    it("only the owner can invite; unknown tokens 404", async () => {
      const { hid } = await setup();
      await join(bob, hid);
      expect(await status(svc.createInvite(bob, hid))).toBe(403);
      expect(await status(svc.previewInvite(bob, "nope"))).toBe(404);
    });

    it("a member can still own their own household, and sees both", async () => {
      const { hid } = await setup();
      await join(bob, hid);
      const mine = await svc.createHousehold(bob, { name: "Bobs place" });
      const me = await svc.me(bob);
      expect(me.households.map((h) => [h.name, h.role]).sort()).toEqual([
        ["Bobs place", "owner"],
        ["The Smiths", "member"],
      ]);
      expect(mine.household.role).toBe("owner");
    });

    it("lets members leave, owners remove members, and never lets the owner leave", async () => {
      const { hid } = await setup();
      await join(bob, hid);
      await join(carol, hid);

      expect(await status(svc.removeMember(bob, hid, "u-carol"))).toBe(403); // members can't remove others
      expect(await status(svc.removeMember(alice, hid, "u-alice"))).toBe(400); // owner can't leave
      await svc.removeMember(bob, hid, "u-bob"); // leave
      await svc.removeMember(alice, hid, "u-carol"); // removed by owner

      expect(await status(svc.getHousehold(bob, hid))).toBe(404);
      expect((await svc.me(carol)).households).toEqual([]);
      expect(await status(svc.removeMember(alice, hid, "u-bob"))).toBe(404); // already gone
      expect((await svc.getHousehold(alice, hid)).members).toHaveLength(1);
    });
  });

  describe("lists", () => {
    it("allows at most 10 lists per household", async () => {
      const { hid } = await setup(); // starts with 1
      for (let i = 2; i <= 10; i++) await svc.createList(alice, hid, { name: `List ${i}` });
      expect((await svc.getHousehold(alice, hid)).lists).toHaveLength(10);
      expect(await status(svc.createList(alice, hid, { name: "One too many" }))).toBe(409);
      expect((await svc.getHousehold(alice, hid)).lists).toHaveLength(10);
    });

    it("frees a slot when a list is deleted", async () => {
      const { hid, lid } = await setup();
      for (let i = 2; i <= 10; i++) await svc.createList(alice, hid, { name: `List ${i}` });
      await svc.deleteList(alice, hid, lid);
      await svc.createList(alice, hid, { name: "Replacement" });
      expect(await status(svc.createList(alice, hid, { name: "Again" }))).toBe(409);
    });

    it("lets members create and rename lists; only the owner deletes; keeps at least one", async () => {
      const { hid, lid } = await setup();
      await join(bob, hid);
      const costco = await svc.createList(bob, hid, { name: "Costco" });
      expect(await svc.renameList(bob, hid, costco.id, { name: "Costco run" })).toEqual({ id: costco.id, name: "Costco run" });

      expect(await status(svc.deleteList(bob, hid, costco.id))).toBe(403);
      await svc.deleteList(alice, hid, costco.id);
      expect(await status(svc.deleteList(alice, hid, lid))).toBe(400); // last list
      expect(await status(svc.deleteList(alice, hid, "missing"))).toBe(400);
    });

    it("deletes a list's items with it, leaving other lists alone", async () => {
      const { hid, lid } = await setup();
      const other = await svc.createList(alice, hid, { name: "Other" });
      await svc.createItem(alice, hid, lid, { name: "Milk" });
      await svc.createItem(alice, hid, other.id, { name: "Screws" });
      await svc.deleteList(alice, hid, lid);
      expect((await svc.listItems(alice, hid, other.id)).map((i) => i.name)).toEqual(["Screws"]);
      expect(await status(svc.listItems(alice, hid, lid))).toBe(404);
    });
  });

  describe("items", () => {
    it("keeps each list's items separate and shared by members", async () => {
      const { hid, lid } = await setup();
      const other = await svc.createList(alice, hid, { name: "Hardware" });
      await join(bob, hid);

      await svc.createItem(alice, hid, lid, { id: "item-0001", name: "  Whole   milk " });
      await svc.createItem(bob, hid, other.id, { name: "Screws" });

      expect((await svc.listItems(bob, hid, lid)).map((i) => i.name)).toEqual(["Whole milk"]);
      expect((await svc.listItems(alice, hid, other.id)).map((i) => i.name)).toEqual(["Screws"]);
    });

    it("toggles, deletes, clears checked, and validates", async () => {
      const { hid, lid } = await setup();
      const a = await svc.createItem(alice, hid, lid, { name: "A" });
      await svc.createItem(alice, hid, lid, { name: "B" });

      const updated = await svc.updateItem(alice, hid, lid, a.id, { checked: true });
      expect(updated.checked).toBe(true);
      expect(await svc.clearChecked(alice, hid, lid)).toEqual({ removed: 1 });
      const [b] = await svc.listItems(alice, hid, lid);
      expect(b!.name).toBe("B");
      await svc.removeItem(alice, hid, lid, b!.id);
      await svc.removeItem(alice, hid, lid, b!.id); // idempotent
      expect(await svc.listItems(alice, hid, lid)).toEqual([]);

      expect(await status(svc.createItem(alice, hid, lid, { id: "item-0001", name: "x" }))).toBe(200);
      expect(await status(svc.createItem(alice, hid, lid, { id: "item-0001", name: "x" }))).toBe(409);
      expect(await status(svc.createItem(alice, hid, lid, { id: "bad id!", name: "x" }))).toBe(400);
      expect(await status(svc.createItem(alice, hid, lid, { name: " " }))).toBe(400);
      expect(await status(svc.updateItem(alice, hid, lid, "nope", { checked: true }))).toBe(404);
      expect(await status(svc.updateItem(alice, hid, lid, "nope", {}))).toBe(400);
    });
  });
});
