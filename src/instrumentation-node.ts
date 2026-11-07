import { configIssues } from "./lib/config-checks";

const issues = configIssues();
for (const issue of issues) {
  if (issue.level === "info") continue;
  console[issue.level === "error" ? "error" : "warn"](`[setup ${issue.level}] ${issue.message}`);
}
// A deployed site with the default secret could have its print links forged and its Canva tokens read, so don't start.
const fatal = issues.find((i) => i.level === "error" && i.message.startsWith("SECRET_KEY"));
if (fatal) throw new Error(fatal.message);
