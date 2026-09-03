import { z } from "zod";

export const JobSearchQuerySchema = z.object({
  countries: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  levels: z.array(z.enum(["intern", "junior", "mid", "senior", "staff", "principal", "unknown"])).optional(),
  preferredTechnologies: z.array(z.string()).optional(),
  excludedPrimaryTechnologies: z.array(z.string()).optional(),
  minSalary: z.object({
    amount: z.number().nonnegative(),
    currency: z.enum(["CAD", "USD", "EUR", "GBP", "AUD", "SGD"]),
    period: z.enum(["year", "month", "hour"]).optional(),
    target: z.enum(["base", "total"]).optional(),
  }).optional(),
  workModes: z.array(z.enum(["remote", "hybrid", "onsite"])).optional(),
  excludeRecruiters: z.boolean().optional(),
  offset: z.number().nonnegative().optional(),
  limit: z.number().positive().max(100).optional(),
});

export type JobSearchQueryInput = z.infer<typeof JobSearchQuerySchema>;
