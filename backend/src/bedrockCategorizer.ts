import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { type CategoryId, categorizerSystemPrompt, parseCategory } from "./categories";
import type { Categorizer } from "./categorizer";

/** The slice of the client we use, so tests can pass a fake instead of calling AWS. */
export interface MessagesClient {
  messages: {
    create(
      body: {
        model: string;
        max_tokens: number;
        thinking: { type: "disabled" };
        system: string;
        messages: { role: "user"; content: string }[];
      },
      options: { timeout: number; maxRetries: number },
    ): Promise<{ content: { type: string; text?: string }[] }>;
  };
}

export interface BedrockCategorizerOptions {
  /** e.g. "anthropic.claude-haiku-5-5" */
  model: string;
  region?: string;
  /** Give up after this long. The caller is a Lambda with a 10 s limit, and a miss just means "Other". */
  timeoutMs?: number;
  client?: MessagesClient;
  log?: (message: string, err?: unknown) => void;
}

/**
 * Asks a small Claude model on Amazon Bedrock which store section an item belongs to.
 * Credentials come from the Lambda's IAM role (the SDK reads them from the environment).
 */
export class BedrockCategorizer implements Categorizer {
  private readonly client: MessagesClient;
  private readonly system = categorizerSystemPrompt();
  private readonly timeoutMs: number;
  private readonly log: (message: string, err?: unknown) => void;

  constructor(private readonly opts: BedrockCategorizerOptions) {
    // The Mantle client is typed against the full Messages API; MessagesClient is the part we call.
    this.client = opts.client ?? (new AnthropicBedrockMantle({ awsRegion: opts.region }) as unknown as MessagesClient);
    this.timeoutMs = opts.timeoutMs ?? 4000;
    this.log = opts.log ?? ((message, err) => console.error(message, err));
  }

  async categorize(name: string): Promise<CategoryId | null> {
    try {
      const res = await this.client.messages.create(
        {
          model: this.opts.model,
          max_tokens: 16, // the answer is one short id
          thinking: { type: "disabled" }, // otherwise thinking could use up max_tokens before the answer
          system: this.system,
          messages: [{ role: "user", content: name }],
        },
        { timeout: this.timeoutMs, maxRetries: 0 },
      );
      const text = res.content.find((b) => b.type === "text")?.text ?? "";
      const category = parseCategory(text);
      if (!category) this.log(`Categorizer gave an unusable answer for an item: ${JSON.stringify(text.slice(0, 40))}`);
      return category;
    } catch (err) {
      // Never let a model problem stop an item from being added. It stays in "Other" and is retried next time.
      this.log("Categorizer call failed", err);
      return null;
    }
  }
}
