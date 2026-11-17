import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Item, ItemPatch, ItemRepo } from "./types";

/**
 * Single-table layout:
 *   pk = LIST#<listId>   sk = ITEM#<itemId>
 * The MVP has exactly one list shared by the whole family, but keying by list
 * leaves room for multiple lists (and per-user lists once auth arrives).
 */
const ITEM_PREFIX = "ITEM#";

export class DynamoItemRepo implements ItemRepo {
  private readonly pk: string;
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    listId = "family",
    client = new DynamoDBClient({}),
  ) {
    this.pk = `LIST#${listId}`;
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  private sk(id: string) {
    return `${ITEM_PREFIX}${id}`;
  }

  private toItem(row: Record<string, unknown>): Item {
    return {
      id: String(row.sk).slice(ITEM_PREFIX.length),
      name: String(row.name),
      checked: Boolean(row.checked),
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
    };
  }

  async list(): Promise<Item[]> {
    const items: Item[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
          ExpressionAttributeValues: { ":pk": this.pk, ":prefix": ITEM_PREFIX },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const row of res.Items ?? []) items.push(this.toItem(row));
      startKey = res.LastEvaluatedKey;
    } while (startKey);
    return items;
  }

  async create(item: Item): Promise<boolean> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            pk: this.pk,
            sk: this.sk(item.id),
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

  async update(id: string, patch: ItemPatch, now: string): Promise<Item | null> {
    const sets = ["#updatedAt = :updatedAt"];
    const names: Record<string, string> = { "#updatedAt": "updatedAt" };
    const values: Record<string, unknown> = { ":updatedAt": now };
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
          TableName: this.tableName,
          Key: { pk: this.pk, sk: this.sk(id) },
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

  async remove(id: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({ TableName: this.tableName, Key: { pk: this.pk, sk: this.sk(id) } }),
    );
  }

  async clearChecked(): Promise<number> {
    const keys = (await this.list()).filter((i) => i.checked).map((i) => this.sk(i.id));
    for (let i = 0; i < keys.length; i += 25) {
      let pending: Record<string, unknown>[] = keys
        .slice(i, i + 25)
        .map((sk) => ({ DeleteRequest: { Key: { pk: this.pk, sk } } }));
      // BatchWrite can return UnprocessedItems under throttling; retry a few times.
      for (let attempt = 0; pending.length > 0 && attempt < 5; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
        const res = await this.doc.send(
          new BatchWriteCommand({ RequestItems: { [this.tableName]: pending as never } }),
        );
        pending = (res.UnprocessedItems?.[this.tableName] ?? []) as Record<string, unknown>[];
      }
      if (pending.length > 0) throw new Error("Could not delete all checked items");
    }
    return keys.length;
  }
}
