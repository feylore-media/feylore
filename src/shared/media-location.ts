import { z } from "zod";

export const mediaLocationSchema = z.object({
  kind: z.enum([
    "general",
    "front_matter",
    "chapter",
    "page",
    "timestamp",
    "episode",
    "final",
  ]),
  position: z.number().nonnegative().optional(),
  progression: z.number().min(0).max(1).optional(),
  reference: z.string().max(2000).optional(),
});
export type MediaLocation = z.infer<typeof mediaLocationSchema>;
