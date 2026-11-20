import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Categorizer } from "./categorizer";
import type { CategoryId } from "./categories";
import { HttpError } from "./errors";
import { Service } from "./service";
import type { Store } from "./store";
import { storeFactories } from "./testStores";
import type { AuthUser } from "./types";

const alice: AuthUser = { userId: "u-alice", email: "alice@example.test", name: "Alice" };
const bob: AuthUser = { userId: "u-bob", email: "bob@example.test", name: "Bob" };

async function status(p: Promise<unknown>): Promise<number> {
  try {
    await p;
    return 200;
  } catch (e) {
    if (e instanceof HttpError) return e.status;
    throw e;
  }
}

describe.each(storeFactories)("store sections (%s store)", (_name, createStore) => {
  let store: Store;
  let svc: Service;
  let answers: Record<string, CategoryId | null | "throw">;
  let ask: ReturnType<typeof vi.fn<(name: string) => Promise<CategoryId | null>>>;
  let hid: string;
  let lid: string;
  let nowMs: number;

  beforeEach(async () => {
    nowMs = Date.UTC(2026, 0, 1);
    answers = { Bananas: "produce", Milk: "dairy-eggs", Soap: "personal-care" };
    ask = vi.fn(async (name: string) => {
      if (!(name in answers)) return "other";
      const a = answers[name];
      if (a === "throw") throw new Error("model down");
      return a ?? null;
    });
    const categorizer: Categorizer = { categorize: ask };
    store = await createStore();
    svc = new Service(store, () => new Date(nowMs), categorizer);
    const h = await svc.createHousehold(alice, { name: "The Smiths" });
    hid = h.household.id;
    lid = h.lists[0]!.id;
  });

  const add = (name: string, user = alice, list = lid, household = hid) => svc.createItem(user, household, list, { name });

  it("puts the model's answer on a new item", async () => {
    expect((await add("Bananas")).category).toBe("produce");
    expect((await svc.listItems(alice, hid, lid))[0]!.category).toBe("produce");
  });

  it("asks the model once, then remembers for the household (even for other spellings and lists)", async () => {
    const second = (await svc.createList(alice, hid, { name: "Costco" })).id;
    await add("Bananas");
    expect((await add("bananas ", alice, second)).category).toBe("produce");
    expect((await add("BANANA")).category).toBe("produce");
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("does not share what one household learned with another", async () => {
    await add("Bananas");
    const other = await svc.createHousehold(bob, { name: "The Joneses" });
    await add("Bananas", bob, other.lists[0]!.id, other.household.id);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("keeps the item in Other and asks again next time when the model gives no answer", async () => {
    answers.Bananas = null;
    expect((await add("Bananas")).category).toBe("other");
    answers.Bananas = "produce";
    const again = await svc.createList(alice, hid, { name: "Again" });
    expect((await add("Bananas", alice, again.id)).category).toBe("produce");
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("still adds the item when the model call throws", async () => {
    answers.Bananas = "throw";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await add("Bananas")).category).toBe("other");
    spy.mockRestore();
    expect((await svc.listItems(alice, hid, lid)).map((i) => i.name)).toEqual(["Bananas"]);
  });

  it("remembers a model answer of Other too", async () => {
    await add("Mystery thing");
    await add("mystery things");
    expect(ask).toHaveBeenCalledTimes(1);
  });

  describe("moving an item", () => {
    it("changes the item and teaches the household", async () => {
      const item = await add("Milk");
      const moved = await svc.updateItem(alice, hid, lid, item.id, { category: "beverages" });
      expect(moved.category).toBe("beverages");
      const later = await svc.createList(alice, hid, { name: "Later" });
      expect((await add("milk", alice, later.id)).category).toBe("beverages");
      expect(ask).toHaveBeenCalledTimes(1); // only the first Milk
    });

    it("lets any member do it, and everyone sees it", async () => {
      const { token } = await svc.createInvite(alice, hid);
      await svc.acceptInvite(bob, token);
      const item = await add("Bananas");
      await svc.updateItem(bob, hid, lid, item.id, { category: "snacks" });
      expect((await svc.listItems(alice, hid, lid))[0]!.category).toBe("snacks");
    });

    it("beats a later guess from the model", async () => {
      await svc.updateItem(alice, hid, lid, (await add("Soap")).id, { category: "household" });
      // A model guess is stored with overwrite=false, so it can't replace the person's choice.
      await store.categories.set(hid, "soap", "personal-care", nowMs / 1000 + 60, false);
      expect(await store.categories.get(hid, "soap")).toBe("household");
    });

    it("rejects a section that doesn't exist", async () => {
      const item = await add("Bananas");
      expect(await status(svc.updateItem(alice, hid, lid, item.id, { category: "fruit" }))).toBe(400);
      expect(await status(svc.updateItem(alice, hid, lid, item.id, { category: 5 }))).toBe(400);
    });

    it("404s for someone outside the household", async () => {
      const item = await add("Bananas");
      expect(await status(svc.updateItem(bob, hid, lid, item.id, { category: "snacks" }))).toBe(404);
    });
  });

  describe("renaming", () => {
    it("sorts the item again under its new name", async () => {
      const item = await add("Bananas");
      const renamed = await svc.updateItem(alice, hid, lid, item.id, { name: "Milk" });
      expect(renamed.category).toBe("dairy-eggs");
    });

    it("keeps a section chosen in the same request", async () => {
      const item = await add("Bananas");
      const renamed = await svc.updateItem(alice, hid, lid, item.id, { name: "Milk", category: "beverages" });
      expect(renamed.category).toBe("beverages");
    });

    it("leaves the section alone when only checking the item off", async () => {
      const item = await add("Bananas");
      const checked = await svc.updateItem(alice, hid, lid, item.id, { checked: true });
      expect(checked.category).toBe("produce");
      expect(ask).toHaveBeenCalledTimes(1);
    });
  });

  it("tells the app which sections exist, in order, ending with Other", async () => {
    const h = await svc.getHousehold(alice, hid);
    expect(h.categories[0]).toEqual({ id: "produce", label: "Produce" });
    expect(h.categories.at(-1)).toEqual({ id: "other", label: "Other" });
  });
});

describe("with categorization off", () => {
  it("puts everything in Other", async () => {
    const svc = new Service((await storeFactories[0]![1]()));
    const h = await svc.createHousehold(alice, { name: "Home" });
    const item = await svc.createItem(alice, h.household.id, h.lists[0]!.id, { name: "Bananas" });
    expect(item.category).toBe("other");
  });
});
