// cSpell:words Ashby ashby scrapeable
import type { Job, JobLevel, JobLocation, WorkMode, Currency } from "@job-hunter/shared";
import { workModes } from "./work-modes.js";

interface AshbyAddress {
  postalAddress?: {
    addressLocality?: string;
    addressRegion?: string;
    addressCountry?: string;
  };
}

interface AshbyCompensation {
  compensationTierSummary?: string;
  scrapeableCompensationSalarySummary?: string;
}

export interface AshbyJobPosting {
  id?: string;
  title?: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string; address?: AshbyAddress }>;
  address?: AshbyAddress;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  publishedAt?: string;
  updatedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  department?: string;
  team?: string;
  compensation?: AshbyCompensation;
}

interface AshbyResponse {
  apiVersion?: string;
  jobs?: AshbyJobPosting[];
}

const KNOWN_TECHNOLOGIES = [
  "Node.js", "TypeScript", "JavaScript", "Go", "Python", "Java", "Kotlin",
  "PostgreSQL", "MongoDB", "Redis", "Kafka", "RabbitMQ", "AWS", "GCP",
  "Kubernetes", "React", "Next.js", "NestJS", "Temporal", "OpenAI", "LLM",
  "GraphQL", "Rust", "C#", ".NET", "Django", "Rails"
];

function detectLevel(title: string): JobLevel {
  const t = title.toLowerCase();
  if (/\bprincipal\b/.test(t)) return "principal";
  if (/\bstaff\b/.test(t)) return "staff";
  if (/\bsenior\b|\bsr\.?\b/.test(t)) return "senior";
  if (/\bjunior\b|\bjr\.?\b/.test(t)) return "junior";
  if (/\bmid\b|\bintermediate\b/.test(t)) return "mid";
  return "unknown";
}

function htmlToText(value: string): string {
  // 用更稳健的标签正则并使用 replaceAll 处理 &nbsp;
  const withoutTags = value.replace(/<[^>]+>/g, " ");
  const withoutNbsp = withoutTags.replaceAll("&nbsp;", " ");
  return withoutNbsp.replace(/\s+/g, " ").trim();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectTechnologies(text: string): string[] {
  // Use boundary-aware regex to avoid substring false positives (e.g. "Go" matching "Google").
  // Keep the implementation simple: negative lookbehind/lookahead for alphanumeric and common symbol chars.
  const results: string[] = [];
  for (const name of KNOWN_TECHNOLOGIES) {
    const escaped = escapeRegExp(name);
    // token boundary: not preceded/followed by alphanum, +, # or dot
    const pattern = new RegExp(`(?<![A-Za-z0-9+#.])${escaped}(?![A-Za-z0-9+#.])`, "i");
    if (pattern.test(text)) results.push(name);
  }
  return results;
}

function detectPrimaryTechnologies(title: string, description: string, allTechs: string[], limit = 3): string[] {
  const titleLower = (title ?? "").toLowerCase();
  const descLower = (description ?? "").toLowerCase();

  const countOccurrences = (text: string, sub: string): number => {
    if (!sub) return 0;
    let count = 0;
    let idx = text.indexOf(sub);
    while (idx !== -1) {
      count++;
      idx = text.indexOf(sub, idx + sub.length);
    }
    return count;
  };

  type Score = { t: string; score: number; firstIdx: number };

  const scores: Score[] = [];
  for (const tech of allTechs) {
    const sub = tech.toLowerCase();
    const titleCount = countOccurrences(titleLower, sub);
    const descCount = countOccurrences(descLower, sub);
    if (titleCount === 0 && descCount === 0) continue;

    const firstIdxTitle = titleCount > 0 ? titleLower.indexOf(sub) : -1;
    const firstIdxDesc = descCount > 0 ? descLower.indexOf(sub) : -1;
    const firstIdx = firstIdxTitle >= 0 ? firstIdxTitle : firstIdxDesc;

    // Heuristic scoring:
    // - Title mentions are strongest (boost)
    // - Frequency contributes (title occurrences weigh more)
    // - Earlier first occurrence adds small bonus
    const freqScore = titleCount * 6 + descCount * 1;
    const titleBonus = titleCount > 0 ? 8 : 0;
    const positionBonus = firstIdx >= 0 ? Math.max(0, 3 - firstIdx / 200) : 0;

    const score = freqScore + titleBonus + positionBonus;
    scores.push({ t: tech, score, firstIdx: firstIdx >= 0 ? firstIdx : Number.MAX_SAFE_INTEGER });
  }

  // Sort by score desc, tie-break by earlier first occurrence, then by shorter name
  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.firstIdx !== b.firstIdx) return a.firstIdx - b.firstIdx;
    return a.t.length - b.t.length;
  });

  return scores.slice(0, limit).map((s) => s.t);
}

import { normalizeLocation } from "@job-hunter/shared";
 

export function parseCompensation(
  value?: AshbyCompensation,
  board?: string,
  locationRaw?: string,
): NonNullable<Job["compensation"]> | undefined {
  const raw = (value?.scrapeableCompensationSalarySummary ?? value?.compensationTierSummary ?? "").replace(/\u00A0/g, " ").trim();
  if (!raw) return undefined;

  // Helpers
  const detectCurrency = (
    text: string,
    boardHint?: string,
    locHint?: string,
  ): Currency | undefined => {
    // Find earliest explicit currency token (code or symbol) and prefer it.
    const re = /(\bCAD\b|\bUSD\b|\bEUR\b|\bGBP\b|\bAUD\b|\bSGD\b|CA\$|AU\$|S\$|\$|£|€)/ig;
    let m: RegExpExecArray | null;
    let earliest: { idx: number; token: string } | undefined;
    while ((m = re.exec(text)) !== null) {
      const token = m[0];
      const idx = m.index;
      if (!earliest || idx < earliest.idx) earliest = { idx, token };
    }
    if (earliest) {
      const t = earliest.token;
      const upper = t.toUpperCase();
      if (/\bCAD\b/.test(upper) || t === "CA$") return "CAD";
      if (/\bUSD\b/.test(upper)) return "USD";
      if (/\bEUR\b/.test(upper) || t === "€") return "EUR";
      if (/\bGBP\b/.test(upper) || t === "£") return "GBP";
      if (/\bAUD\b/.test(upper) || t === "AU$") return "AUD";
      if (/\bSGD\b/.test(upper) || t === "S$") return "SGD";
      if (t === "$") {
        // Ambiguous $ — use board or location hints to choose sensible default
        const hint = (boardHint ?? "" ).toLowerCase();
        const loc = (locHint ?? "").toLowerCase();
        if (/\b(canada|ca|toronto|vancouver|montreal|calgary)\b/.test(hint) || /\b(canada|toronto|vancouver|montreal|calgary)\b/.test(loc)) return "CAD";
        if (/\b(australia|au|sydney|melbourne|brisbane)\b/.test(hint) || /\b(australia|sydney|melbourne|brisbane)\b/.test(loc)) return "AUD";
        if (/\b(singapore|sg|singaporean)\b/.test(hint) || /\b(singapore|sg)\b/.test(loc)) return "SGD";
        return "USD";
      }
    }

    // No explicit token found; try hints
    const h = (boardHint ?? "").toLowerCase();
    const l = (locHint ?? "").toLowerCase();
    if (/\b(canada|ca|toronto|vancouver|montreal|calgary)\b/.test(h) || /\b(canada|toronto|vancouver|montreal|calgary)\b/.test(l)) return "CAD";
    if (/\b(australia|au|sydney|melbourne|brisbane)\b/.test(h) || /\b(australia|sydney|melbourne|brisbane)\b/.test(l)) return "AUD";
    if (/\b(singapore|sg|singaporean)\b/.test(h) || /\b(singapore|sg)\b/.test(l)) return "SGD";
    return undefined;
  };

  const detectPeriod = (text: string): "year" | "month" | "hour" | undefined => {
    const t = text.toLowerCase();
    const monthRE = /\b(per\s+month|per\s+mo|\/\s*mo\b|monthly|month|pcm\b|per\s+calendar\s+month|p\.c\.m\.|p\/m\b|\/mth\b|mth\b|\/month|pcm)\b/;
    const yearRE = /\b(per\s+year|per\s+annum|per\s+yr|\/\s*yr\b|annual|yearly|year|pa\b|p\.a\.|per\s+annum|per\s+pa)\b/;
    const hourRE = /\b(per\s+hour|per\s+hr|hourly|hour|\/\s*hr\b|\/h\b)\b/;
    if (monthRE.test(t)) return "month";
    if (yearRE.test(t)) return "year";
    if (hourRE.test(t)) return "hour";
    return undefined;
  };

  const parseAmount = (token: string): number | undefined => {
    if (!token) return undefined;
    const t = token.replace(/,/g, "").trim();
    const kMatch = /k$/i.test(t);
    const numStr = t.replace(/k$/i, "");
    const n = Number(numStr);
    if (!Number.isFinite(n)) return undefined;
    return Math.round(n * (kMatch ? 1000 : 1));
  };

  const currency = detectCurrency(raw, board, locationRaw);
  if (!currency) return undefined;

  const globalPeriod = detectPeriod(raw);

  // Try to parse a numeric range first (e.g. "80k-100k", "6,000 - 8,000 / month")
  let baseMin: number | undefined;
  let baseMax: number | undefined;
  let detectedPeriod: "year" | "month" | "hour" | undefined = globalPeriod;

  const currencyPrefix = String.raw`(?:[$€£]|CA\$|AU\$|S\$|CAD|USD|EUR|GBP|AUD|SGD)?`;
  const rangeRe = new RegExp(
    String.raw`${currencyPrefix}\s*([0-9\.,]+k?)\s*(?:-|–|to)\s*${currencyPrefix}\s*([0-9\.,]+k?)(?:\s*(?:\/|per)\s*(month|year|annum|yr|mo|hr|hour|monthly|hourly))?`,
    'i',
  );
  const rangeMatch = rangeRe.exec(raw);
  if (rangeMatch) {
    baseMin = parseAmount(rangeMatch[1]!);
    baseMax = parseAmount(rangeMatch[2]!);
    if (rangeMatch[3]) {
      const p = rangeMatch[3]!.toLowerCase();
      if (/month|mo|monthly/.test(p)) detectedPeriod = "month";
      if (/year|annum|yr|annual/.test(p)) detectedPeriod = "year";
      if (/hour/.test(p)) detectedPeriod = "hour";
    }
  } else {
    // Single amount (may include period after it)
    const singleRe = new RegExp(
      String.raw`${currencyPrefix}\s*([0-9\.,]+k?)(?:\s*(?:per|\/)\s*(month|year|annum|yr|mo|hr|hour|monthly|hourly))?`,
      'i',
    );
    const singleMatch = singleRe.exec(raw);
    if (singleMatch) {
      const amt = parseAmount(singleMatch[1]!);
      baseMin = baseMax = amt;
      if (singleMatch[2]) {
        const p = singleMatch[2]!.toLowerCase();
        if (/month|mo|monthly/.test(p)) detectedPeriod = "month";
        if (/year|annum|yr|annual/.test(p)) detectedPeriod = "year";
        if (/hour/.test(p)) detectedPeriod = "hour";
      }
    }
  }

  // Bonus detection
  type BonusT = { type: "fixed" | "percent"; min?: number; max?: number; percent?: number; period?: "year" | "month" | "hour" };
  let bonus: BonusT | undefined;
  // percent bonus near the word "bonus" or "variable"
  const pctNearBonus = /(?:bonus|variable|incentive).{0,60}?(\d{1,2})\s*%/i.exec(raw) || /(\d{1,2})\s*%.*?(?:bonus|variable|incentive)/i.exec(raw);
  if (pctNearBonus) {
    const pct = Number(pctNearBonus[1]);
    if (Number.isFinite(pct)) bonus = { type: "percent", percent: pct };
  }
  if (!bonus) {
    // fixed bonus like "+ $5,000 bonus", "bonus $5k", "signing bonus", "sign-on"
    const fixedBonus = /(?:bonus|sign(?:[- ]?on|ing)|sign[- ]?on|signing|plus|\+)\s*(?:up to\s*)?(?:\$|CAD|USD|EUR|GBP|AUD|SGD)?\s*([0-9\.,]+k?)/i.exec(raw);
    if (fixedBonus) {
      const b = parseAmount(fixedBonus[1]!);
      if (b !== undefined) bonus = { type: "fixed", min: b, max: b };
    }

    // detect explicit "sign on" in other forms like "up to $10,000 sign on"
    if (!bonus) {
      const signOnAlt = /(?:sign[- ]?on|signing)\s*(?:bonus)?\s*(?:[:\-]|of)?\s*(?:\$|CAD|USD|EUR|GBP|AUD|SGD)?\s*([0-9\.,]+k?)/i.exec(raw);
      if (signOnAlt) {
        const b2 = parseAmount(signOnAlt[1]!);
        if (b2 !== undefined) bonus = { type: "fixed", min: b2, max: b2 };
      }

      if (!bonus) {
        // patterns like "up to $10,000 sign on" where amount appears before the phrase
        const signOnBefore = /(?:up to|upto|up-to)?\s*(?:\$|CAD|USD|EUR|GBP|AUD|SGD)?\s*([0-9\.,]+k?)\s*(?:[,;]?\s*)?(?:sign[- ]?on|signing|sign on|signing bonus)/i.exec(raw);
        if (signOnBefore) {
          const b3 = parseAmount(signOnBefore[1]!);
          if (b3 !== undefined) bonus = { type: "fixed", min: b3, max: b3 };
        }
      }
    }
  }

  // equity detection: if an explicit equity/rsu value is present (e.g. "RSU $20k"), capture it as fixed bonus
  if (!bonus) {
    const equityVal = /(?:rsu|equity|stock options?|shares?)\s*(?:[:\-])?\s*(?:\$|CAD|USD|EUR|GBP|AUD|SGD)?\s*([0-9\.,]+k?)/i.exec(raw);
    if (equityVal) {
      const ev = parseAmount(equityVal[1]!);
      if (ev !== undefined) bonus = { type: "fixed", min: ev, max: ev };
    }
  }

  const buildCompRange = (
    min: number | undefined,
    max: number | undefined,
    period: "year" | "month" | "hour" | undefined,
  ): NonNullable<Job["compensation"]>["base"] => {
    const range: NonNullable<Job["compensation"]>["base"] = {};
    if (min !== undefined) range.min = min;
    if (max !== undefined) range.max = max;
    if (period !== undefined) range.period = period;
    return range;
  };

  // Build base object (period only if detected)
  const baseObj =
    baseMin === undefined && baseMax === undefined && detectedPeriod === undefined
      ? undefined
      : buildCompRange(baseMin, baseMax, detectedPeriod);

  // Compute total only when safe: fixed bonus with same period (or no bonus period),
  // or percent bonus (we assume percent applies to the same period as base when
  // base period known).
  let totalObj: NonNullable<Job["compensation"]>["total"] | undefined = undefined;
  if (baseObj) {
    if (!bonus) {
      totalObj = buildCompRange(baseObj.min, baseObj.max, baseObj.period);
    } else if (bonus.type === "fixed") {
      // Only add fixed bonus if we have base numbers; assume same period if bonus period not provided
      const bmin = bonus.min ?? 0;
      const bmax = bonus.max ?? bmin;
      totalObj = buildCompRange(
        baseObj.min !== undefined ? baseObj.min + bmin : undefined,
        baseObj.max !== undefined ? baseObj.max + bmax : undefined,
        baseObj.period,
      );
    } else if (bonus.type === "percent" && typeof bonus.percent === "number") {
      const factor = 1 + bonus.percent / 100;
      totalObj = buildCompRange(
        baseObj.min !== undefined ? Math.round(baseObj.min * factor) : undefined,
        baseObj.max !== undefined ? Math.round(baseObj.max * factor) : undefined,
        baseObj.period,
      );
    }
  }
  const comp: NonNullable<Job["compensation"]> = {
    currency: currency,
    ...(baseObj ? { base: baseObj } : {}),
    ...(bonus ? { bonus } : {}),
    ...(totalObj ? { total: totalObj } : {}),
  };

  return comp;
}

export function normalizeAshbyJob(
  board: string,
  posting: AshbyJobPosting,
  options?: { generateDescriptionText?: boolean },
): Job | null {
  if (!posting.id || !posting.title || !posting.jobUrl) return null;

  // Preserve the raw HTML (if present) and only generate a text fallback
  // when explicitly requested via options.generateDescriptionText.
  const descriptionHtml = posting.descriptionHtml ?? undefined;
  const descriptionText = posting.descriptionPlain ?? (options?.generateDescriptionText ? htmlToText(descriptionHtml ?? "") : undefined);
  const description = posting.descriptionPlain ?? (descriptionText ?? "");
  const primary = posting.location ?? "Unknown";
  const locations: JobLocation[] = [normalizeLocation(primary, posting.address?.postalAddress)];
  for (const item of posting.secondaryLocations ?? []) {
    if (item.location) locations.push(normalizeLocation(item.location, item.address?.postalAddress));
  }

  // Ensure locations have at least a country when possible and normalize ordering
  for (const loc of locations) {
    if (!loc.country) {
      // Try to infer country from raw text
      const rawLower = (loc.raw ?? "").toLowerCase();
      if (/\b(canada|toronto|vancouver|montreal|calgary)\b/.test(rawLower)) loc.country = "Canada";
      if (/\b(australia|sydney|melbourne|brisbane)\b/.test(rawLower)) loc.country = "Australia";
      if (/\b(singapore|sg)\b/.test(rawLower)) loc.country = "Singapore";
      if (/\b(pakistan|islamabad|karachi|lahore)\b/.test(rawLower)) loc.country = "Pakistan";
      if (/\b(united states|usa|us|new york|san francisco|los angeles)\b/.test(rawLower)) loc.country = "United States";
    }
  }

  const compensation = parseCompensation(posting.compensation, board, posting.location ?? posting.address?.postalAddress?.addressCountry);

  // 确保 publishedAt/updatedAt 为 string（使用空字符串作为默认），并且仅在 compensation 存在时才赋值该字段
  const jobBase: Omit<Job, "compensation"> & Partial<Pick<Job, "compensation">> = {
    id: `ashby:${board}:${posting.id}`,
    externalId: posting.id,
    source: "ashby",
    company: board,
    title: posting.title,
    url: posting.jobUrl,
    description: description, // legacy field (kept for compatibility)
    locations,
    workModes: workModes(posting),
    level: detectLevel(posting.title),
    technologies: Array.from(new Set(detectTechnologies(`${posting.title} ${description}`))).sort(),
    primaryTechnologies: detectPrimaryTechnologies(posting.title ?? "", description, KNOWN_TECHNOLOGIES),
    publishedAt: posting.publishedAt ?? "",
    updatedAt: posting.updatedAt ?? "",
  };

  if (compensation) {
    jobBase.compensation = compensation;
  }

  // Attach original raw posting for downstream persistence. This is intentionally
  // a non-standard property (`__originalRaw`) so it doesn't affect the canonical
  // `Job` shape but can be detected by the DB layer.
  const job = jobBase as Job & { __originalRaw?: unknown; descriptionHtml?: string; descriptionText?: string };
  job.__originalRaw = posting;
  if (descriptionHtml) job.descriptionHtml = descriptionHtml;
  if (descriptionText) job.descriptionText = descriptionText;

  return job as Job;
}

export async function fetchAshbyJobs(board: string, fetchImpl: typeof fetch = fetch): Promise<Job[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`;
  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Ashby API failed (${response.status}) for board ${board}`);
  const payload = (await response.json()) as AshbyResponse;
  return (payload.jobs ?? []).map((job) => normalizeAshbyJob(board, job)).filter((job): job is Job => job !== null);
}