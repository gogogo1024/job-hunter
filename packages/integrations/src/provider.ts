import type { Job } from "@job-hunter/shared";
import { normalizeAshbyJob, fetchAshbyJobs, type AshbyJobPosting } from "./ashby.js";

export interface JobProvider {
  // 拉取并返回已规范化的 Job 列表
  fetchJobs(fetchImpl?: typeof fetch): Promise<Job[]>;

  // 将原始上游对象规范化为 Job（失败时返回 null）
  normalize(raw: unknown): Job | null;
}

export class AshbyProvider implements JobProvider {
  constructor(public board: string) {}

  normalize(raw: unknown): Job | null {
    return normalizeAshbyJob(this.board, raw as AshbyJobPosting);
  }

  async fetchJobs(fetchImpl: typeof fetch = fetch): Promise<Job[]> {
    return await fetchAshbyJobs(this.board, fetchImpl);
  }
}

export default AshbyProvider;
