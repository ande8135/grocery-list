import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { randomUUID } from "node:crypto";
import { DynamoStore } from "./dynamoStore";
import { MemoryStore } from "./memoryStore";
import type { Store } from "./store";

/**
 * Store implementations the contract tests run against. The in-memory store always
 * runs. The DynamoDB store runs too when DYNAMODB_ENDPOINT is set, e.g. against DynamoDB Local:
 *
 *   docker run --rm -p 8000:8000 amazon/dynamodb-local
 *   DYNAMODB_ENDPOINT=http://localhost:8000 npm test -w backend
 */
export const storeFactories: [name: string, create: () => Promise<Store>][] = [
  ["memory", async () => new MemoryStore()],
];

const endpoint = process.env.DYNAMODB_ENDPOINT;
if (endpoint) {
  process.env.AWS_ACCESS_KEY_ID ??= "test";
  process.env.AWS_SECRET_ACCESS_KEY ??= "test";
  process.env.AWS_REGION ??= "us-east-1";
  storeFactories.push([
    "dynamodb",
    async () => {
      const client = new DynamoDBClient({ endpoint });
      const table = `test-${randomUUID()}`; // a fresh table per test keeps tests independent
      await client.send(
        new CreateTableCommand({
          TableName: table,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "pk", AttributeType: "S" },
            { AttributeName: "sk", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "pk", KeyType: "HASH" },
            { AttributeName: "sk", KeyType: "RANGE" },
          ],
        }),
      );
      return new DynamoStore(table, client);
    },
  ]);
}
