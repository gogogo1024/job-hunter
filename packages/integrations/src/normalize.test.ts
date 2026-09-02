import { describe, it, expect } from 'vitest';
import { normalizeAshbyJob } from './ashby.js';

describe('normalizeAshbyJob raw preservation', () => {
  it('keeps raw posting and descriptionHtml and does not generate descriptionText by default', () => {
    const posting: any = {
      id: '123',
      title: 'Test Job',
      jobUrl: 'https://example.com',
      descriptionHtml: '<p>Hello <strong>World</strong></p>',
      location: 'Toronto, Canada'
    };

    const j = normalizeAshbyJob('board1', posting as any);
    expect(j).toBeDefined();
    // @ts-ignore
    expect((j as any).__originalRaw).toBeDefined();
    // @ts-ignore
    expect((j as any).descriptionHtml).toBe('<p>Hello <strong>World</strong></p>');
    // descriptionText should not be present by default
    // @ts-ignore
    expect((j as any).descriptionText).toBeUndefined();
  });

  it('generates descriptionText when requested', () => {
    const posting: any = {
      id: '124',
      title: 'Test Job 2',
      jobUrl: 'https://example.com/2',
      descriptionHtml: '<div>Line&nbsp;1<br/>Line 2</div>',
      location: 'Toronto'
    };

    const j = normalizeAshbyJob('board1', posting as any, { generateDescriptionText: true });
    expect(j).toBeDefined();
    // @ts-ignore
    expect((j as any).descriptionText).toBe('Line 1 Line 2');
  });
});
