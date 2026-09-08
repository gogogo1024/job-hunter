import "dotenv/config";
import { AshbyProvider } from "@job-hunter/integrations";
import syncProvider from "./sync-provider.js";

// Support single-board, comma-separated list (`ASHBY_JOB_BOARDS`), or CLI arg `all`.
async function main() {
  const argBoard = process.argv[2];
  const envBoard = process.env.ASHBY_JOB_BOARD;
  const envBoards = process.env.ASHBY_JOB_BOARDS;

  let boards: string[] = [];
  if (argBoard) {
    if (argBoard === "all") {
      if (!envBoards) throw new Error("When using 'all' please set ASHBY_JOB_BOARDS (comma-separated)");
      boards = envBoards.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      boards = [argBoard];
    }
  } else if (envBoards) {
    boards = envBoards.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (envBoard) {
    boards = [envBoard];
  } else {
    throw new Error("Usage: pnpm --filter @job-hunter/worker sync:ashby <job-board> or set ASHBY_JOB_BOARD or ASHBY_JOB_BOARDS");
  }

  await syncProvider((board) => new AshbyProvider(board), "ashby", boards);
}

main().catch((err) => {
  // 保留简短错误输出以便 CI/用户能看到原因
  // 真实环境中可扩展为 logging/telemetry
  console.error("sync-ashby failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});