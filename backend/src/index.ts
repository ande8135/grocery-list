import { DynamoStore } from "./dynamoStore";
import { createHandler } from "./handler";
import { Service } from "./service";

const tableName = process.env.TABLE_NAME;
if (!tableName) throw new Error("TABLE_NAME is not set");

export const handler = createHandler(new Service(new DynamoStore(tableName)));
