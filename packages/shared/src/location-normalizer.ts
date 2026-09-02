import type { JobLocation } from "./index.js";

type PostalHint = {
  addressLocality?: string;
  addressRegion?: string;
  addressCountry?: string;
} | undefined;

function canonicalCountry(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const t = name.trim().toLowerCase();
  if (/^ca(nada)?$/.test(t) || /toronto|vancouver|montreal|calgary/.test(t)) return "Canada";
  if (/^us(a)?$/.test(t) || /united states|new york|san francisco|los angeles/.test(t)) return "United States";
  if (/^uk$/.test(t) || /united kingdom|london/.test(t)) return "United Kingdom";
  if (/^au$/.test(t) || /australia|sydney|melbourne/.test(t)) return "Australia";
  if (/^sg$/.test(t) || /singapore/.test(t)) return "Singapore";
  if (/^de|germany/.test(t)) return "Germany";
  return undefined;
}

export function normalizeLocation(raw: string, postal?: PostalHint): JobLocation {
  const r = (raw ?? "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

  // If postal hint provides strong signals, prefer them
  const city = postal?.addressLocality?.trim();
  const region = postal?.addressRegion?.trim();
  const countryFromPostal = canonicalCountry(postal?.addressCountry?.trim());

  // Try to parse raw text for common patterns: "City, Region, Country" or "City - Country"
  let parsedCity: string | undefined;
  let parsedRegion: string | undefined;
  let parsedCountry: string | undefined;

  if (r) {
    const parts = r.split(/[,\u2013\u2014\-–—]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 1) parsedCity = parts[0];
    if (parts.length >= 2) parsedRegion = parts[1];
    if (parts.length >= 3) parsedCountry = canonicalCountry(parts.slice(-1)[0]);

    // If last token looks like a country code or name, canonicalize
    if (!parsedCountry && parts.length >= 2) {
      const maybe = canonicalCountry(parts[parts.length - 1]);
      if (maybe) parsedCountry = maybe;
    }
  }

  const finalCountry = countryFromPostal ?? parsedCountry ?? undefined;
  const finalCity = city ?? parsedCity ?? undefined;
  const finalRegion = region ?? parsedRegion ?? undefined;

  const loc: JobLocation = { raw: r };
  if (finalCountry) loc.country = finalCountry;
  if (finalRegion) loc.region = finalRegion;
  if (finalCity) loc.city = finalCity;
  return loc;
}

export default normalizeLocation;
