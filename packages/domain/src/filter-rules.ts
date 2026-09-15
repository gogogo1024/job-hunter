import type { Job } from "@job-hunter/shared";

// Use a more flexible type for job parameter to accept both shared Job type and database rows
type JobLike = Job | any;

/**
 * Hardline Rules from doubao.md
 * One-strike rejections: if ANY rule fails, the job is rejected
 */

export interface FilterResult {
  passed: boolean;
  reasons: string[];
}

/**
 * Rule 1: 职级 - Senior/Staff/Lead IC only, no Mid/Junior/Manager
 * Uses AI-inferred level if available, falls back to original level detection
 */
export function checkLevel(job: JobLike): FilterResult {
  const acceptedLevels = ["senior", "staff", "principal"];
  
  // Prefer AI-inferred level if available
  const levelToCheck = (job as any).aiInferredLevel || job.level;
  
  if (acceptedLevels.includes(levelToCheck?.toLowerCase() || "")) {
    return { passed: true, reasons: [] };
  }
  
  return {
    passed: false,
    reasons: [`Level requirement failed: got "${levelToCheck}", need one of [${acceptedLevels.join(", ")}]`],
  };
}

/**
 * Rule 2: 技术栈 - Node.js/TypeScript required; Go/Python/Java-heavy excluded
 * Uses AI-extracted required technologies if available
 */
export function checkTechnologies(job: JobLike): FilterResult {
  const requiredTechs = ["node", "nodejs", "node.js", "typescript", "ts", "javascript", "js"];
  
  // Use AI-extracted technologies if available, otherwise fall back to original list
  const aiRequiredTechs = (job as any).aiRequiredTechnologies;
  const techsToCheck = aiRequiredTechs && aiRequiredTechs.length > 0 
    ? aiRequiredTechs 
    : job.technologies || [];
  
  const techs = techsToCheck.map((t: string) => t.toLowerCase());
  
  // Check if Go/Python/Java is the primary language (from AI analysis)
  const aiCompanyType = (job as any).aiCompanyType?.toLowerCase() || "";
  if (aiCompanyType.includes("staffing") || aiCompanyType.includes("outsourcing")) {
    return {
      passed: false,
      reasons: ["Technology requirement failed: Company type is staffing/outsourcing"],
    };
  }
  
  // Check description for Go primary language indicators
  const description = ((job.description || "") + " " + (job.descriptionText || "")).toLowerCase();
  
  if (description.includes("primary language: go") || 
      description.includes("primary tech: go") ||
      description.includes("written in go") ||
      description.includes("built with go")) {
    return {
      passed: false,
      reasons: ["Technology requirement failed: Go is primary language"],
    };
  }
  
  // Check for required tech stack
  const hasRequired = techs.some((t: string) => requiredTechs.some(r => t.includes(r)));
  
  if (!hasRequired) {
    return {
      passed: false,
      reasons: [`Technology requirement failed: no Node.js/TypeScript found. Stack: ${techs.join(", ")}`],
    };
  }
  
  return { passed: true, reasons: [] };
}

/**
 * Rule 3: 远程 - Worldwide/Global remote required; region restrictions forbidden
 */
export function checkRemote(job: JobLike): FilterResult {
  const workModes = (job.workModes || []).map((m: any) => m.toLowerCase());
  
  if (!workModes.includes("remote")) {
    return {
      passed: false,
      reasons: [`Remote requirement failed: workModes are [${workModes.join(", ")}], need "remote"`],
    };
  }
  
  // Check for region restrictions in description
  const description = ((job.description || "") + " " + (job.descriptionText || "")).toLowerCase();
  
  const regionRestrictions = [
    "only us", "only usa", "only united states",
    "only eu", "europe only",
    "only canada",
    "no china", "no russia",
    "timezone requirement", "overlapping hours",
  ];
  
  for (const restriction of regionRestrictions) {
    if (description.includes(restriction)) {
      return {
        passed: false,
        reasons: [`Remote requirement failed: region restriction found - "${restriction}"`],
      };
    }
  }
  
  return { passed: true, reasons: [] };
}

/**
 * Rule 4: 时区 - Async-first mandatory; no requirement for strict full-day work-hour overlap
 */
export function checkAsync(job: JobLike): FilterResult {
  const description = ((job.description || "") + " " + (job.descriptionText || "")).toLowerCase();
  
  // Check for async-first indicators
  const asyncIndicators = [
    "async-first", "async first",
    "asynchronous", "async culture",
  ];
  
  const hasAsync = asyncIndicators.some(ind => description.includes(ind));
  
  // Check for strict timezone requirements (negative indicators)
  const strictTimeZoneMarkers = [
    "must overlap", "overlap required",
    "core hours", "working hours",
    "9-5", "9 to 5",
    "same timezone", "same time zone",
    "synchronous collaboration",
  ];
  
  const hasStrictHours = strictTimeZoneMarkers.some(marker => description.includes(marker));
  
  if (!hasAsync && hasStrictHours) {
    return {
      passed: false,
      reasons: ["Timezone requirement failed: strict timezone overlap required, not async-first"],
    };
  }
  
  // If neither async-first nor strict hours mentioned, give benefit of doubt
  return { passed: true, reasons: [] };
}

/**
 * Rule 5: 公司属性 - SaaS/infra/community preferred; no outsourcing/staffing companies
 * Uses AI-extracted company type if available
 */
export function checkCompanyType(job: JobLike): FilterResult {
  const description = ((job.description || "") + " " + (job.descriptionText || "")).toLowerCase();
  const companyName = (job.company || "").toLowerCase();
  
  // Use AI-extracted company type if available
  const aiCompanyType = (job as any).aiCompanyType?.toLowerCase() || "";
  if (aiCompanyType.includes("staffing") || aiCompanyType.includes("outsourcing")) {
    return {
      passed: false,
      reasons: [`Company type failed: detected staffing/outsourcing company (AI analysis: "${aiCompanyType}")`],
    };
  }
  
  // Explicitly exclude staffing/outsourcing companies
  const staffingPatterns = [
    "staffing", "recruitment firm", "consulting firm",
    "outsourcing", "contractor",
    "recruitment agency",
  ];
  
  for (const pattern of staffingPatterns) {
    if (description.includes(pattern) || companyName.includes(pattern)) {
      return {
        passed: false,
        reasons: [`Company type failed: detected staffing/outsourcing company - "${pattern}"`],
      };
    }
  }
  
  return { passed: true, reasons: [] };
}

/**
 * Rule 6: 薪资 - Base salary ≥ $135K USD minimum (not TC, not equity)
 */
export function checkSalary(job: JobLike): FilterResult {
  const MIN_SALARY = 135000;
  
  // If no compensation data, can't verify
  if (!job.compensation) {
    return {
      passed: false,
      reasons: ["Salary requirement failed: no compensation data provided"],
    };
  }
  
  // Try to extract base salary from compensation object
  const comp = job.compensation as any;
  
  if (!comp.compensation || !Array.isArray(comp.compensation) || comp.compensation.length === 0) {
    return {
      passed: false,
      reasons: ["Salary requirement failed: compensation array is empty"],
    };
  }
  
  // Find the base salary (usually first entry without 'equity' or 'bonus' in type)
  const baseSalary = comp.compensation.find((c: any) => {
    const type = (c.type || "").toLowerCase();
    return !type.includes("equity") && !type.includes("bonus") && !type.includes("stock");
  });
  
  if (!baseSalary) {
    return {
      passed: false,
      reasons: ["Salary requirement failed: no base salary found in compensation"],
    };
  }
  
  const value = baseSalary.value || baseSalary.amount;
  
  if (!value) {
    return {
      passed: false,
      reasons: ["Salary requirement failed: salary amount not specified"],
    };
  }
  
  // Parse value (could be "135000", "$135000", "135000 USD", etc.)
  const numericValue = parseInt(String(value).replace(/[^\d]/g, ""));
  
  if (numericValue < MIN_SALARY) {
    return {
      passed: false,
      reasons: [`Salary requirement failed: $${numericValue} < minimum $${MIN_SALARY}`],
    };
  }
  
  return { passed: true, reasons: [] };
}

/**
 * Rule 7: 黑名单 - Companies with rejection letters are permanently excluded
 */
export function checkBlacklist(job: JobLike, blacklistedCompanies: Set<string>): FilterResult {
  const companyName = (job.company || "").toLowerCase();
  
  for (const blacklisted of blacklistedCompanies) {
    if (companyName.includes(blacklisted.toLowerCase())) {
      return {
        passed: false,
        reasons: [`Blacklist: company "${job.company}" is on the exclusion list`],
      };
    }
  }
  
  return { passed: true, reasons: [] };
}

/**
 * Rule 8: 有效性 - Must be active on official company careers page
 * (This is a verification step done manually, not programmatically)
 */
export function checkValidity(job: JobLike): FilterResult {
  // In practice, this is verified manually during the review process
  // For now, we assume jobs in the database are already validated
  return { passed: true, reasons: [] };
}

/**
 * Apply all hardline rules
 * Returns passed=false if ANY rule fails (one-strike rejection)
 */
export function applyHardlineRules(
  job: JobLike,
  blacklistedCompanies: Set<string> = new Set(),
): FilterResult {
  const allReasons: string[] = [];
  
  // Apply each rule
  const rules = [
    checkLevel(job),
    checkTechnologies(job),
    checkRemote(job),
    checkAsync(job),
    checkCompanyType(job),
    checkSalary(job),
    checkBlacklist(job, blacklistedCompanies),
    checkValidity(job),
  ];
  
  // Collect all rejection reasons
  for (const result of rules) {
    if (!result.passed) {
      allReasons.push(...result.reasons);
    }
  }
  
  // Return failure if any rule failed
  if (allReasons.length > 0) {
    return {
      passed: false,
      reasons: allReasons,
    };
  }
  
  return { passed: true, reasons: [] };
}
