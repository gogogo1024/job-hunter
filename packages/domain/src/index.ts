import type { Job, JobLevel, Currency } from "@job-hunter/shared";

export interface JobSearchQuery {
  countries?: string[];
  cities?: string[];
  levels?: JobLevel[];
  preferredTechnologies?: string[];
  excludedPrimaryTechnologies?: string[];
  minSalary?: {
    amount: number;
    currency: Currency;
    period?: "year" | "month" | "hour";
    target?: "base" | "total";
  };
  workModes?: Array<"remote" | "hybrid" | "onsite">;
  excludeRecruiters?: boolean;
}

const normalize = (value: string): string => value.trim().toLowerCase();

export function matchesHardFilters(job: Job, query: JobSearchQuery): boolean {
  if (query.countries?.length) {
    const allowed = new Set(query.countries.map(normalize));
    if (!job.locations.some((location) => location.country && allowed.has(normalize(location.country)))) return false;
  }
  if (query.cities?.length) {
    const allowed = new Set(query.cities.map(normalize));
    if (!job.locations.some((location) => location.city && allowed.has(normalize(location.city)))) return false;
  }
  if (query.levels?.length && !query.levels.includes(job.level)) return false;
  if (query.workModes?.length && !query.workModes.some((mode) => job.workModes.includes(mode))) return false;

  const technologies = new Set(job.technologies.map(normalize));
  // Only treat primaryTechnologies as the source of truth for excludedPrimaryTechnologies.
  // If primaryTechnologies is missing or empty, do NOT fall back to full technologies —
  // this avoids accidental false positives when primary techs aren't determined.
  const primaryTechsArr = job.primaryTechnologies ?? [];
  const primaryTechs = primaryTechsArr.length ? new Set(primaryTechsArr.map(normalize)) : null;

  if (query.preferredTechnologies?.length && !query.preferredTechnologies.some((t) => technologies.has(normalize(t)))) return false;
  if (query.excludedPrimaryTechnologies?.length) {
    if (primaryTechs && query.excludedPrimaryTechnologies.some((t) => primaryTechs.has(normalize(t)))) return false;
    // otherwise: primary technologies not known — do not exclude
  }

  if (query.minSalary) {
    const q = query.minSalary;
    if (!job.compensation) return false;
    if (job.compensation.currency !== q.currency) return false;
    const target = q.target ?? "base";
    if (target === "base") {
      const base = job.compensation.base;
      if (!base) return false;
      if (q.period && base.period !== q.period) return false;
      const jobAmount = base.max ?? base.min;
      if (jobAmount === undefined) return false;
      if (jobAmount < q.amount) return false;
    } else {
      // target === 'total'
      const total = job.compensation.total;
      if (!total) return false;
      if (q.period && total.period !== q.period) return false;
      const jobAmount = total.max ?? total.min;
      if (jobAmount === undefined) return false;
      if (jobAmount < q.amount) return false;
    }
  }

  if (query.excludeRecruiters) {
    const recruiterRE = /\b(recruiter|recruiting|agency|talent|headhunt|headhunter|recruitment|staffing)\b/i;
    if (recruiterRE.test(job.company)) return false;
    // Prefer descriptionText for recruiter checks when available
    if ((job as any).descriptionText) {
      if (recruiterRE.test((job as any).descriptionText)) return false;
    } else if (job.description) {
      if (recruiterRE.test(job.description)) return false;
    }
  }

  return true;
}

export * from "./search-service.js";
