import "dotenv/config";
import { createDb } from "@/db/client";

async function main() {
  await createDb({ migrate: true });
  console.log("Migrations applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
