/**
 * Export shape verification for all plugdash packages.
 *
 * Dynamically imports each plugin's dist/index.mjs and validates
 * that the exported factory returns a valid PluginDescriptor with
 * required fields. Runs after build, no EmDash instance needed.
 *
 * Usage: node --import tsx scripts/smoke.ts
 */

import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface PluginDescriptor {
	id: string;
	version: string;
	format?: string;
	entrypoint?: string;
	capabilities?: string[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const packagesDir = join(__dirname, "..", "packages");
const packages = readdirSync(packagesDir).filter((name) => {
	const distIndex = join(packagesDir, name, "dist", "index.mjs");
	return existsSync(distIndex);
});

async function main() {
	let failures = 0;
	let passed = 0;

	for (const name of packages) {
		const modulePath = join(packagesDir, name, "dist", "index.mjs");

		try {
			const mod = await import(modulePath);

			// Find the plugin factory - named export ending in "Plugin"
			const factoryName = Object.keys(mod).find((key) =>
				key.endsWith("Plugin"),
			);

			if (!factoryName) {
				console.error(`  FAIL  @plugdash/${name} - no *Plugin export found`);
				console.error(`         exports: ${Object.keys(mod).join(", ")}`);
				failures++;
				continue;
			}

			const factory = mod[factoryName];
			if (typeof factory !== "function") {
				console.error(
					`  FAIL  @plugdash/${name} - ${factoryName} is not a function`,
				);
				failures++;
				continue;
			}

			const descriptor: PluginDescriptor = factory();

			// Validate required fields
			const errors: string[] = [];
			if (typeof descriptor.id !== "string" || descriptor.id.length === 0) {
				errors.push("missing or empty id");
			}
			if (
				typeof descriptor.version !== "string" ||
				descriptor.version.length === 0
			) {
				errors.push("missing or empty version");
			}
			if (
				descriptor.format !== undefined &&
				descriptor.format !== "standard" &&
				descriptor.format !== "native"
			) {
				errors.push(`invalid format: ${descriptor.format}`);
			}

			if (errors.length > 0) {
				console.error(
					`  FAIL  @plugdash/${name} - ${errors.join(", ")}`,
				);
				failures++;
			} else {
				console.log(
					`  PASS  @plugdash/${name} (${descriptor.id}@${descriptor.version}, ${descriptor.format ?? "standard"})`,
				);
				passed++;
			}
		} catch (err) {
			console.error(`  FAIL  @plugdash/${name} - import error: ${err}`);
			failures++;
		}
	}

	console.log(`\n${passed} passed, ${failures} failed, ${packages.length} total`);

	if (failures > 0) {
		process.exit(1);
	}
}

main();
