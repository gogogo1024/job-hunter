import "dotenv/config";
import { searchJobs } from "../../../packages/db/src/search.js";

async function main() {
  const query = {
    preferredTechnologies: ["typescript"],
    workModes: ["remote"],
    levels: ["mid", "senior"],
  } as any;

  console.log("Running sample search with query:", JSON.stringify(query));
  const rows = await searchJobs(query, 20);
  console.log(`Found ${rows.length} results`);
  for (const r of rows.slice(0, 20)) {
    console.log({ id: r.id, title: r.title, company: r.company, level: r.level, technologies: r.technologies });
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
