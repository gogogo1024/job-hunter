export type Currency = "CAD" | "USD" | "EUR" | "GBP" | "AUD" | "SGD";

export type WorkMode = "remote" | "hybrid" | "onsite";

export type JobLevel = "intern" | "junior" | "mid" | "senior" | "staff" | "principal" | "unknown";

export interface Compensation {
  currency: Currency;
  // Base salary (e.g., guaranteed base pay)
  base?: {
    min?: number;
    max?: number;
    period?: "year" | "month" | "hour";
  };
  // Bonus information: either fixed amounts or percent-based
  bonus?: {
    type: "fixed" | "percent";
    // fixed amounts (same currency as compensation)
    min?: number;
    max?: number;
    // percent (0-100) when type === 'percent'
    percent?: number;
    period?: "year" | "month" | "hour";
  };
  // Total = base + bonus when computable (may be present or derived by normalizer)
  total?: {
    min?: number;
    max?: number;
    period?: "year" | "month" | "hour";
  };
}

export interface JobLocation {
  raw: string;
  country?: string;
  region?: string;
  city?: string;
}

export { normalizeLocation } from './location-normalizer.js';

export interface Job {
  id: string;
  externalId: string;
  source: "ashby" | "greenhouse" | "lever";
  company: string;
  title: string;
  url: string;
  // Prefer `descriptionText` for normalized text. Keep `description` for compatibility.
  description?: string;
  descriptionText?: string;
  locations: JobLocation[];
  workModes: WorkMode[];
  level: JobLevel;
  compensation?: Compensation;
  technologies: string[];
  primaryTechnologies?: string[];
  publishedAt?: string;
  updatedAt?: string;
}
