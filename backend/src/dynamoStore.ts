import { ConditionalCheckFailedException, DynamoDBClient, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { ItemStore, Store } from "./store";
import type { GroceryList, Household, Invite, Item, ItemPatch, Member, Membership, User } from "./types";

/**
 * Single-table layout (pk / sk):
 *
 *   USER#<uid>      PROFILE         user (+ ownedHouseholdId once they own one)
 *   USER#<uid>      HH#<hid>        the user's membership (to list their households)
 *   HH#<hid>        META            household (+ listCount, guarded by a condition)
 *   HH#<hid>        MEMBER#<uid>    household-side membership
 *   HH#<hid>        LIST#<lid>      list
 *   LIST#<lid>      ITEM#<id>       grocery item
 *   INVITE#<token>  INVITE          invite; `expiresAt` is the table's TTL attribute
 */
const key = {
  user: (uid: string) => ({ pk: `USER#${uid}`, sk: "PROFILE" }),
  userHh: (uid: string, hid: string) => ({ pk: `USER#${uid}`, sk: `HH#${hid}` }),
  hh: (hid: string) => ({ pk: `HH#${hid}`, sk: "META" }),
  member: (hid: string, uid: string) => ({ pk: `HH#${hid}`, sk: `MEMBER#${uid}` }),
  list: (hid: string, lid: string) => ({ pk: `HH#${hid}`, sk: `LIST#${lid}` }),
  invite: (token: string) => ({ pk: `INVITE#${token}`, sk: "INVITE" }),
};

type Row = Record<string, unknown>;

/** Which statement (by index) of a failed transaction hit its condition, if any. */
function failedConditions(err: unknown): boolean[] | null {
  if (err instanceof TransactionCanceledException) {
    return (err.CancellationReasons ?? []).map((r) => r.Code === "ConditionalCheckFailed");
  }
  return null;
}

function strip<T>(row: Row | undefined, drop: string[] = ["pk", "sk"]): T | null {
  if (!row) return null;
  const copy = { ...row };
  for (const k of drop) delete copy[k];
  return copy as T;
}

class DynamoItems implements ItemStore {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly table: string,
  ) {}

  private pk(listId: string) {
    return `LIST#${listId}`;
  }

  private toItem(row: Row): Item {
    return {
      id: String(row.sk).slice("ITEM#".length),
      name: String(row.name),
      checked: Boolean(row.checked),
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
    };
  }

  async list(listId: string): Promise<Item[]> {
    const items: Item[] = [];
    let startKey: Row | undefined;
    do {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
          ExpressionAttributeValues: { ":pk": this.pk(listId), ":prefix": "ITEM#" },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const row of res.Items ?? []) items.push(this.toItem(row));
      startKey = res.LastEvaluatedKey;
    } while (startKey);
    return items;
  }

  async create(listId: string, item: Item): Promise<boolean> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.table,
          Item: {
            pk: this.pk(listId),
            sk: `ITEM#${item.id}`,
            name: item.name,
            checked: item.checked,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          },
          ConditionExpression: "attribute_not_exists(pk)",
        }),
      );
      return true;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) return false;
      throw err;
    }
  }

  async update(listId: string, id: string, patch: ItemPatch, now: string): Promise<Item | null> {
    const sets = ["#updatedAt = :updatedAt"];
    const names: Record<string, string> = { "#updatedAt": "updatedAt" };
    const values: Row = { ":updatedAt": now };
    if (patch.name !== undefined) {
      sets.push("#name = :name");
      names["#name"] = "name";
      values[":name"] = patch.name;
    }
    if (patch.checked !== undefined) {
      sets.push("#checked = :checked");
      names["#checked"] = "checked";
      values[":checked"] = patch.checked;
    }
    try {
      const res = await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { pk: this.pk(listId), sk: `ITEM#${id}` },
          UpdateExpression: `SET ${sets.join(", ")}`,
          ConditionExpression: "attribute_exists(pk)",
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ReturnValues: "ALL_NEW",
        }),
      );
      return res.Attributes ? this.toItem(res.Attributes) : null;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) return null;
      throw err;
    }
  }

  async remove(listId: string, id: string): Promise<void> {
    await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { pk: this.pk(listId), sk: `ITEM#${id}` } }));
  }

  private async deleteKeys(listId: string, ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += 25) {
      let pending: Row[] = ids
        .slice(i, i + 25)
        .map((id) => ({ DeleteRequest: { Key: { pk: this.pk(listId), sk: `ITEM#${id}` } } }));
      // BatchWrite can return UnprocessedItems under throttling; retry a few times.
      for (let attempt = 0; pending.length > 0 && attempt < 5; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
        const res = await this.doc.send(new BatchWriteCommand({ RequestItems: { [this.table]: pending as never } }));
        pending = (res.UnprocessedItems?.[this.table] ?? []) as Row[];
      }
      if (pending.length > 0) throw new Error("Could not delete all items");
    }
  }

  async clearChecked(listId: string): Promise<number> {
    const ids = (await this.list(listId)).filter((i) => i.checked).map((i) => i.id);
    await this.deleteKeys(listId, ids);
    return ids.length;
  }

  async clearAll(listId: string): Promise<void> {
    await this.deleteKeys(
      listId,
      (await this.list(listId)).map((i) => i.id),
    );
  }
}

export class DynamoStore implements Store {
  readonly items: ItemStore;
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    private readonly table: string,
    client = new DynamoDBClient({}),
  ) {
    this.doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
    this.items = new DynamoItems(this.doc, table);
  }

  private async get<T>(k: { pk: string; sk: string }): Promise<T | null> {
    const res = await this.doc.send(new GetCommand({ TableName: this.table, Key: k }));
    return strip<T>(res.Item);
  }

  private async query<T>(pk: string, skPrefix: string): Promise<T[]> {
    const out: T[] = [];
    let startKey: Row | undefined;
    do {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
          ExpressionAttributeValues: { ":pk": pk, ":prefix": skPrefix },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const row of res.Items ?? []) out.push(strip<T>(row) as T);
      startKey = res.LastEvaluatedKey;
    } while (startKey);
    return out;
  }

  // ---------- users ----------

  async upsertUser(u: { userId: string; email: string; name: string }, now: string): Promise<User> {
    const res = await this.doc.send(
      new UpdateCommand({
        TableName: this.table,
        Key: key.user(u.userId),
        UpdateExpression: "SET #userId = :userId, #email = :email, #name = :name, #createdAt = if_not_exists(#createdAt, :now)",
        ExpressionAttributeNames: { "#userId": "userId", "#email": "email", "#name": "name", "#createdAt": "createdAt" },
        ExpressionAttributeValues: { ":userId": u.userId, ":email": u.email, ":name": u.name, ":now": now },
        ReturnValues: "ALL_NEW",
      }),
    );
    return strip<User>(res.Attributes) as User;
  }

  getUser(userId: string) {
    return this.get<User>(key.user(userId));
  }

  // ---------- households ----------

  async createHousehold({ household, owner, firstList }: { household: Household; owner: Member; firstList: GroceryList }) {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              // The one-household-per-owner rule: fails if the user already owns one.
              Update: {
                TableName: this.table,
                Key: key.user(owner.userId),
                UpdateExpression: "SET #owned = :hid",
                ConditionExpression: "attribute_not_exists(#owned)",
                ExpressionAttributeNames: { "#owned": "ownedHouseholdId" },
                ExpressionAttributeValues: { ":hid": household.id },
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: { ...key.hh(household.id), ...household, listCount: 1 },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
            { Put: { TableName: this.table, Item: { ...key.member(household.id, owner.userId), ...owner } } },
            {
              Put: {
                TableName: this.table,
                Item: {
                  ...key.userHh(owner.userId, household.id),
                  householdId: household.id,
                  householdName: household.name,
                  role: owner.role,
                  joinedAt: owner.joinedAt,
                },
              },
            },
            { Put: { TableName: this.table, Item: { ...key.list(household.id, firstList.id), ...firstList } } },
          ],
        }),
      );
      return "ok" as const;
    } catch (err) {
      if (failedConditions(err)?.[0]) return "already-owner" as const;
      throw err;
    }
  }

  getHousehold(id: string) {
    return this.get<Household>(key.hh(id));
  }

  listMemberships(userId: string) {
    return this.query<Membership>(`USER#${userId}`, "HH#");
  }

  getMember(hid: string, uid: string) {
    return this.get<Member>(key.member(hid, uid));
  }

  listMembers(hid: string) {
    return this.query<Member>(`HH#${hid}`, "MEMBER#");
  }

  async removeMember(hid: string, uid: string): Promise<boolean> {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            { Delete: { TableName: this.table, Key: key.member(hid, uid), ConditionExpression: "attribute_exists(pk)" } },
            { Delete: { TableName: this.table, Key: key.userHh(uid, hid) } },
          ],
        }),
      );
      return true;
    } catch (err) {
      if (failedConditions(err)?.[0]) return false;
      throw err;
    }
  }

  // ---------- lists ----------

  async createList(list: GroceryList, max: number) {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              // The lists-per-household cap: the counter and the new list change together or not at all.
              Update: {
                TableName: this.table,
                Key: key.hh(list.householdId),
                UpdateExpression: "SET #n = #n + :one",
                ConditionExpression: "attribute_exists(pk) AND #n < :max",
                ExpressionAttributeNames: { "#n": "listCount" },
                ExpressionAttributeValues: { ":one": 1, ":max": max },
              },
            },
            { Put: { TableName: this.table, Item: { ...key.list(list.householdId, list.id), ...list } } },
          ],
        }),
      );
      return "ok" as const;
    } catch (err) {
      if (failedConditions(err)?.[0]) return "limit" as const;
      throw err;
    }
  }

  listLists(hid: string) {
    return this.query<GroceryList>(`HH#${hid}`, "LIST#");
  }

  getList(hid: string, lid: string) {
    return this.get<GroceryList>(key.list(hid, lid));
  }

  async renameList(hid: string, lid: string, name: string) {
    try {
      const res = await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: key.list(hid, lid),
          UpdateExpression: "SET #name = :name",
          ConditionExpression: "attribute_exists(pk)",
          ExpressionAttributeNames: { "#name": "name" },
          ExpressionAttributeValues: { ":name": name },
          ReturnValues: "ALL_NEW",
        }),
      );
      return strip<GroceryList>(res.Attributes);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) return null;
      throw err;
    }
  }

  async deleteList(hid: string, lid: string): Promise<boolean> {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            { Delete: { TableName: this.table, Key: key.list(hid, lid), ConditionExpression: "attribute_exists(pk)" } },
            {
              Update: {
                TableName: this.table,
                Key: key.hh(hid),
                UpdateExpression: "SET #n = #n - :one",
                ExpressionAttributeNames: { "#n": "listCount" },
                ExpressionAttributeValues: { ":one": 1 },
              },
            },
          ],
        }),
      );
    } catch (err) {
      if (failedConditions(err)?.[0]) return false;
      throw err;
    }
    await this.items.clearAll(lid);
    return true;
  }

  // ---------- invites ----------

  async createInvite(invite: Invite) {
    await this.doc.send(
      new PutCommand({
        TableName: this.table,
        Item: { ...key.invite(invite.token), ...invite },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  }

  getInvite(token: string) {
    return this.get<Invite>(key.invite(token));
  }

  async acceptInvite(invite: Invite, member: Member, nowSeconds: number) {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Delete: {
                TableName: this.table,
                Key: key.invite(invite.token),
                ConditionExpression: "attribute_exists(pk) AND #exp > :now",
                ExpressionAttributeNames: { "#exp": "expiresAt" },
                ExpressionAttributeValues: { ":now": nowSeconds },
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: { ...key.member(member.householdId, member.userId), ...member },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: {
                  ...key.userHh(member.userId, member.householdId),
                  householdId: member.householdId,
                  householdName: invite.householdName,
                  role: member.role,
                  joinedAt: member.joinedAt,
                },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
          ],
        }),
      );
      return "ok" as const;
    } catch (err) {
      const failed = failedConditions(err);
      if (failed?.[0]) return "invalid" as const;
      if (failed?.[1] || failed?.[2]) return "already-member" as const;
      throw err;
    }
  }
}
