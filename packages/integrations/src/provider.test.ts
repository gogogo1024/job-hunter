import { describe, it, expect, vi } from 'vitest';
import { AshbyProvider } from './provider.js';

describe('AshbyProvider', () => {
  it('normalize returns Job with ashby-prefixed id', () => {
    const p = new AshbyProvider('board1');
    const raw: any = { id: '123', title: 'Title', jobUrl: 'https://example.com', location: 'Toronto' };
    const j = p.normalize(raw);
    expect(j).toBeDefined();
    expect(j?.id).toBe('ashby:board1:123');
  });

  it('fetchJobs returns normalized jobs via provided fetch implementation', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ jobs: [ { id: '1', title: 'T', jobUrl: 'https://x', location: 'Toronto' } ] }),
    }));

    const p = new AshbyProvider('boardA');
    const jobs = await p.fetchJobs(mockFetch as any);
    expect(jobs.length).toBe(1);
    expect(jobs[0].id).toBe('ashby:boardA:1');
    expect(mockFetch).toHaveBeenCalled();
  });

  it('fetchJobs throws when fetch response is not ok', async () => {
    const mockFetch = vi.fn(async () => ({ ok: false, status: 500 }));
    const p = new AshbyProvider('boardX');
    await expect(p.fetchJobs(mockFetch as any)).rejects.toThrow();
  });
});
