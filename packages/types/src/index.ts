export type Currency = "CAD" | "USD" | "EUR" | "GBP" | "AUD" | "SGD";

export type WorkMode = "remote" | "hybrid" | "onsite";

export type JobLevel = "intern" | "junior" | "mid" | "senior" | "staff" | "principal" | "unknown";

export interface Compensation {
  currency: Currency;
  base?: {
    min?: number;
    max?: number;
    period?: "year" | "month" | "hour";
  };
  bonus?: {
    type: "fixed" | "percent";
    min?: number;
    max?: number;
    percent?: number;
    period?: "year" | "month" | "hour";
  };
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

export interface Job {
  id: string;
  externalId: string;
  source: "ashby" | "greenhouse" | "lever";
  company: string;
  title: string;
  url: string;
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
