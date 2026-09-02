import { describe, it, expect } from 'vitest';
import { toJobSearchQuery, getPrefilterSpec } from './search-utils.js';

describe('toJobSearchQuery', () => {
  it('normalizes legacy fields and minBaseCad', () => {
    const raw = { country: 'Canada', city: 'Toronto', minBaseCad: '90000', limit: '5', workMode: 'remote', excludeRecruiters: 'true' };
    const { query, limit } = toJobSearchQuery(raw);
    expect(limit).toBe(5);
    expect(query.countries).toEqual(['Canada']);
    expect(query.cities).toEqual(['Toronto']);
    expect(query.minSalary).toBeDefined();
    expect((query.minSalary as any).amount).toBe(90000);
    expect((query.minSalary as any).currency).toBe('CAD');
    expect(query.excludeRecruiters).toBe(true);
  });

  it('clamps limit and defaults on invalid', () => {
    const { limit: l1 } = toJobSearchQuery({ limit: '150' });
    expect(l1).toBe(100);
    const { limit: l2 } = toJobSearchQuery({ limit: 'not-a-number' });
    expect(l2).toBe(20);
  });
});

describe('getPrefilterSpec', () => {
  it('produces lowercase patterns and salary spec', () => {
    const query: any = {
      countries: ['Canada'],
      cities: ['Toronto'],
      minSalary: { amount: 120000, currency: 'CAD' },
    };
    const spec = getPrefilterSpec(query);
    expect(spec.status).toBe('open');
    expect(spec.countries).toEqual(['canada']);
    expect(spec.cities).toEqual(['toronto']);
    expect(spec.minSalary).toEqual({ amount: 120000, currency: 'CAD' });
  });
});
