import { z } from "zod";

export const mergeRequestAttributesSchema = z.object({
  iid: z.number().int().nonnegative(),
  title: z.string().default(""),
  source_branch: z.string().default(""),
  target_branch: z.string().default(""),
  action: z.string().default(""),
  description: z.string().optional(),
});

export const webhookPayloadSchema = z.object({
  object_kind: z.string(),
  event_type: z.string().optional(),
  project: z
    .object({
      id: z.number().int().nonnegative(),
      name: z.string(),
      path_with_namespace: z.string(),
      web_url: z.string().url().optional(),
    })
    .passthrough(),
  user: z
    .object({
      name: z.string().default("unknown"),
      username: z.string().optional(),
    })
    .passthrough()
    .optional(),
  object_attributes: z
    .object({
      note: z.string().optional(),
    })
    .merge(mergeRequestAttributesSchema.partial())
    .passthrough()
    .optional(),
  merge_request: mergeRequestAttributesSchema.optional(),
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
