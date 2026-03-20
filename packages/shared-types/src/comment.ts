import { z } from "zod";

export const mrCommentSchema = z.object({
  projectId: z.number().int().nonnegative(),
  mrId: z.number().int().nonnegative(),
  body: z.string(),
  createdAt: z.string().datetime().optional(),
});

export type MRComment = z.infer<typeof mrCommentSchema>;
