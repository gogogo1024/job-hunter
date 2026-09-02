import { describe, it, expect } from 'vitest';
import { workModes } from './work-modes.js';

describe('workModes parser', () => {
  it('returns remote when posting.isRemote is true', () => {
    const posting = { isRemote: true } as any;
    expect(workModes(posting)).toEqual(['remote']);
  });

  it('returns remote when text contains remote even with office mention', () => {
    const posting = { location: 'Remote position\nOur office is located in Toronto' } as any;
    expect(workModes(posting)).toEqual(['remote']);
  });

  it('returns hybrid when contains hybrid even if office present', () => {
    const posting = { location: 'Hybrid — office in New York' } as any;
    expect(workModes(posting)).toEqual(['hybrid']);
  });

  it('returns onsite when only office present', () => {
    const posting = { location: 'Our office is located in San Francisco' } as any;
    expect(workModes(posting)).toEqual(['onsite']);
  });

  it('defaults to onsite when nothing matches', () => {
    const posting = {} as any;
    expect(workModes(posting)).toEqual(['onsite']);
  });

  it('secondaryLocations counted and remote prioritized', () => {
    const posting = {
      location: 'Our office is in Vancouver',
      secondaryLocations: [{ location: 'Remote position' }],
    } as any;
    expect(workModes(posting)).toEqual(['remote']);
  });
});
