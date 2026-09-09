import { describe, it, expect } from 'vitest';
import { locationsILike, workModesILike, technologiesILike, salaryCondition, recipientsContains, incrementAttemptsExpr } from './sql-fragments.js';
import { sql } from 'drizzle-orm';

describe('sql-fragments helpers basic sanity', () => {
  it('returns locations ILIKE SQL fragment without throwing', () => {
    const frag = locationsILike('Toronto');
    expect(frag).toBeDefined();
  });

  it('salaryCondition produces a SQL fragment', () => {
    const frag = salaryCondition('CAD', 100000);
    expect(frag).toBeDefined();
  });

  it('recipientsContains produces SQL fragment', () => {
    const frag = recipientsContains('user@example.com');
    expect(frag).toBeDefined();
  });

  it('incrementAttemptsExpr produces SQL fragment', () => {
    const frag = incrementAttemptsExpr();
    expect(frag).toBeDefined();
  });
});
