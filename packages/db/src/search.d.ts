import type { Job } from "@job-hunter/shared";
export declare function searchJobs(query: any, limit?: number, offset?: number): Promise<Job[]>;
export default searchJobs;
