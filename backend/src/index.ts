import { BedrockCategorizer } from "./bedrockCategorizer";
import { noopCategorizer } from "./categorizer";
import { DynamoStore } from "./dynamoStore";
import { createHandler } from "./handler";
import { Service } from "./service";

const tableName = process.env.TABLE_NAME;
if (!tableName) throw new Error("TABLE_NAME is not set");

// Store sections are sorted by a small model on Amazon Bedrock. Terraform sets BEDROCK_MODEL_ID only
// when `enable_categorization` is on; without it every new item simply lands in "Other".
const model = process.env.BEDROCK_MODEL_ID;
const categorizer = model
  ? new BedrockCategorizer({ model, region: process.env.BEDROCK_REGION || process.env.AWS_REGION })
  : noopCategorizer;

export const handler = createHandler(new Service(new DynamoStore(tableName), undefined, categorizer));
