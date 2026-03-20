import "dotenv-safe/config.js";

import pRetry from "p-retry";
import { z } from "zod";

const gitLabClientConfigSchema = z.object({
  token: z.string().min(1),
  baseUrl: z.string().url(),
});

export type GitLabClientConfig = z.infer<typeof gitLabClientConfigSchema>;

export interface GitLabRequestOptions<TSchema extends z.ZodTypeAny | undefined> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  schema?: TSchema;
}

export class GitLabClient {
  readonly #config: GitLabClientConfig;

  constructor(config?: Partial<GitLabClientConfig>) {
    this.#config = gitLabClientConfigSchema.parse({
      token: config?.token ?? process.env.GITLAB_TOKEN,
      baseUrl: config?.baseUrl ?? process.env.GITLAB_BASE_URL ?? "https://gitlab.com",
    });
  }

  get baseUrl(): string {
    return this.#config.baseUrl;
  }

  async request<TSchema extends z.ZodTypeAny | undefined = undefined>(
    path: string,
    options: GitLabRequestOptions<TSchema> = {},
  ): Promise<TSchema extends z.ZodTypeAny ? z.infer<TSchema> : unknown> {
    const url = path.startsWith("http") ? path : new URL(path, `${this.#config.baseUrl}/api/v4/`).toString();

    const response = await pRetry(
      async () => {
        const result = await fetch(url, {
          method: options.method ?? "GET",
          headers: {
            "Content-Type": "application/json",
            "PRIVATE-TOKEN": this.#config.token,
            ...options.headers,
          },
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        });

        if (!result.ok) {
          throw new Error(`GitLab request failed (${result.status}) for ${path}`);
        }

        return result;
      },
      {
        retries: 3,
        factor: 2,
        minTimeout: 250,
      },
    );

    if (response.status === 204) {
      return undefined as TSchema extends z.ZodTypeAny ? z.infer<TSchema> : unknown;
    }

    const payload = (await response.json()) as unknown;
    return options.schema ? options.schema.parse(payload) : (payload as TSchema extends z.ZodTypeAny ? z.infer<TSchema> : unknown);
  }
}

export function createGitLabClient(config?: Partial<GitLabClientConfig>): GitLabClient {
  return new GitLabClient(config);
}

export * from "./comments.js";
export * from "./deployments.js";
export * from "./merge-requests.js";
export * from "./pipelines.js";
