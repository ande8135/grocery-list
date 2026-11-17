import { DynamoItemRepo } from "./dynamoRepo";
import { createHandler } from "./handler";

const tableName = process.env.TABLE_NAME;
if (!tableName) throw new Error("TABLE_NAME is not set");

export const handler = createHandler(new DynamoItemRepo(tableName));
