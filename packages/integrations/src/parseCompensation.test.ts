import { describe, it, expect } from 'vitest';
import { parseCompensation } from './ashby.js';

describe('parseCompensation (Ashby)', () => {
  it('parses CAD range without period', () => {
    const comp = parseCompensation({ scrapeableCompensationSalarySummary: 'CAD 120k-150k' });
    expect(comp).toBeDefined();
    expect(comp?.currency).toBe('CAD');
    expect(comp?.base?.min).toBe(120000);
    expect(comp?.base?.max).toBe(150000);
    expect(comp?.total?.min).toBe(120000);
  });

  it('parses USD monthly range', () => {
    const comp = parseCompensation({ scrapeableCompensationSalarySummary: 'USD 6,000 - 8,000 / month' });
    expect(comp).toBeDefined();
    expect(comp?.currency).toBe('USD');
    expect(comp?.base?.min).toBe(6000);
    expect(comp?.base?.max).toBe(8000);
    expect(comp?.base?.period).toBe('month');
  });

  it('parses GBP range with pound symbol', () => {
    const comp = parseCompensation({ scrapeableCompensationSalarySummary: '£60k-£80k' });
    expect(comp).toBeDefined();
    expect(comp?.currency).toBe('GBP');
    expect(comp?.base?.min).toBe(60000);
    expect(comp?.base?.max).toBe(80000);
  });

  it('infers CAD for $ when board indicates Canada', () => {
    const comp = parseCompensation({ scrapeableCompensationSalarySummary: '$60k-$80k' }, 'toronto');
    expect(comp).toBeDefined();
    expect(comp?.currency).toBe('CAD');
    expect(comp?.base?.min).toBe(60000);
    expect(comp?.base?.max).toBe(80000);
  });

  it('parses percent bonus and computes total', () => {
    const comp = parseCompensation({ scrapeableCompensationSalarySummary: 'EUR 100k + 10% bonus' });
    expect(comp).toBeDefined();
    expect(comp?.currency).toBe('EUR');
    expect(comp?.base?.min).toBe(100000);
    expect(comp?.bonus?.type).toBe('percent');
    expect(comp?.bonus?.percent).toBe(10);
    expect(comp?.total?.min).toBe(110000);
  });

  it('parses fixed sign-on bonus and computes total', () => {
    const comp = parseCompensation({ scrapeableCompensationSalarySummary: 'CAD 120k + $5k sign-on' });
    expect(comp).toBeDefined();
    expect(comp?.currency).toBe('CAD');
    expect(comp?.base?.min).toBe(120000);
    expect(comp?.bonus?.type).toBe('fixed');
    expect(comp?.bonus?.min).toBe(5000);
    expect(comp?.total?.min).toBe(125000);
  });

  it('parses alternate signing bonus phrasing', () => {
    const comp = parseCompensation({ scrapeableCompensationSalarySummary: 'USD 100k up to $10,000 sign on' });
    expect(comp).toBeDefined();
    expect(comp?.currency).toBe('USD');
    expect(comp?.base?.min).toBe(100000);
    expect(comp?.bonus?.type).toBe('fixed');
    expect(comp?.bonus?.min).toBe(10000);
    expect(comp?.total?.min).toBe(110000);
  });

  it('parses RSU / equity value when present', () => {
    const comp = parseCompensation({ scrapeableCompensationSalarySummary: 'USD 120k + RSU $20k' });
    expect(comp).toBeDefined();
    expect(comp?.currency).toBe('USD');
    expect(comp?.base?.min).toBe(120000);
    expect(comp?.bonus?.type).toBe('fixed');
    expect(comp?.bonus?.min).toBe(20000);
    expect(comp?.total?.min).toBe(140000);
  });

  it('recognizes PCM as monthly period', () => {
    const comp = parseCompensation({ scrapeableCompensationSalarySummary: 'USD 6,000 - 8,000 PCM' });
    expect(comp).toBeDefined();
    expect(comp?.currency).toBe('USD');
    expect(comp?.base?.period).toBe('month');
  });

  it('returns undefined for non-numeric/DOE descriptions', () => {
    const comp = parseCompensation({ scrapeableCompensationSalarySummary: 'Competitive / DOE' });
    expect(comp).toBeUndefined();
  });
});
