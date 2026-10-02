import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// Specs written for the old testbed (hardcoded localhost:4321 fixture pages
// that never existed) are skipped until their plugin card moves them onto
// e2e/harness. A spec opts in by importing from "./harness".
// ponytail: content sniff, drop it once every e2e/*.spec.ts uses the harness
const e2e = join(__dirname, "e2e");
const legacy = readdirSync(e2e).filter(
	(f) =>
		f.endsWith(".spec.ts") &&
		!/from\s+["']\.\/harness["']/.test(readFileSync(join(e2e, f), "utf8")),
);
if (legacy.length) console.warn(`e2e: skipping specs not on e2e/harness yet: ${legacy.join(", ")}`);

const prod = process.env.E2E_MODE === "prod";

export default defineConfig({
	testDir: "e2e",
	testIgnore: legacy,
	// prod runs only specs tagged @prod
	grep: prod ? /@prod/ : undefined,
	globalSetup: "./e2e/harness/global-setup.ts",
	// one shared site and log file, so keep it serial
	workers: 1,
	timeout: 60_000,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL: process.env.E2E_BASE_URL,
		trace: "retain-on-failure",
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
