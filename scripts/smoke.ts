/**
 * Export shape verification for all plugdash packages.
 *
 * Dynamically imports each plugin's dist/index.mjs and validates
 * that the exported factory returns a valid PluginDescriptor with
 * required fields. CLI packages (a `bin` and no index entry) are run
 * with --help instead. Runs after build, no EmDash instance needed.
 *
 * Usage: node --import tsx scripts/smoke.ts
 */

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
const allPackages = readdirSync(packagesDir).filter((name) =>
	existsSync(join(packagesDir, name, "package.json")),
);
const packages = allPackages.filter((name) =>
	existsSync(join(packagesDir, name, "dist", "index.mjs")),
);

function readPkg(name: string): {
	bin?: string | Record<string, string>;
	exports?: Record<string, unknown>;
} {
	return JSON.parse(readFileSync(join(packagesDir, name, "package.json"), "utf8"));
}

// CLI packages: a `bin` and no "." export. Run each bin with --help.
const cliPackages = allPackages.filter((name) => {
	const pkg = readPkg(name);
	return pkg.bin !== undefined && !pkg.exports?.["."];
});

async function main() {
	let failures = 0;
	let passed = 0;

	for (const name of packages) {
		const modulePath = join(packagesDir, name, "dist", "index.mjs");

		try {
			const mod = await import(modulePath);

			// The descriptor factory is `<dir>Plugin`. Native packages also
			// export `createPlugin`, which returns a ResolvedPlugin, not a
			// descriptor, so it must never be picked.
			const factoryName =
				`${name}Plugin` in mod
					? `${name}Plugin`
					: Object.keys(mod).find((key) => key.endsWith("Plugin") && key !== "createPlugin");

			if (!factoryName) {
				console.error(`  FAIL  @plugdash/${name} - no *Plugin export found`);
				console.error(`         exports: ${Object.keys(mod).join(", ")}`);
				failures++;
				continue;
			}

			const factory = mod[factoryName];
			if (typeof factory !== "function") {
				console.error(`  FAIL  @plugdash/${name} - ${factoryName} is not a function`);
				failures++;
				continue;
			}

			const descriptor: PluginDescriptor = factory();

			// Validate required fields
			const errors: string[] = [];
			if (typeof descriptor.id !== "string" || descriptor.id.length === 0) {
				errors.push("missing or empty id");
			}
			if (typeof descriptor.version !== "string" || descriptor.version.length === 0) {
				errors.push("missing or empty version");
			}
			if (
				descriptor.format !== undefined &&
				descriptor.format !== "standard" &&
				descriptor.format !== "native"
			) {
				errors.push(`invalid format: ${descriptor.format}`);
			}
			if (typeof descriptor.entrypoint !== "string" || descriptor.entrypoint.length === 0) {
				errors.push("missing entrypoint");
			}
			// EmDash treats a missing format as native.
			const format = descriptor.format ?? "native";
			if (format === "native" && typeof mod.createPlugin !== "function") {
				errors.push("native format but no createPlugin export");
			}

			if (errors.length > 0) {
				console.error(`  FAIL  @plugdash/${name} - ${errors.join(", ")}`);
				failures++;
			} else {
				console.log(
					`  PASS  @plugdash/${name} (${descriptor.id}@${descriptor.version}, ${format})`,
				);
				passed++;
			}
		} catch (err) {
			console.error(`  FAIL  @plugdash/${name} - import error: ${err}`);
			failures++;
		}
	}

	for (const name of cliPackages) {
		const { bin } = readPkg(name);
		const bins = typeof bin === "string" ? [bin] : Object.values(bin ?? {});
		for (const file of bins) {
			const path = join(packagesDir, name, file);
			const run = existsSync(path)
				? spawnSync(process.execPath, [path, "--help"], { encoding: "utf8", timeout: 10_000 })
				: null;
			if (run && run.status === 0) {
				console.log(`  PASS  @plugdash/${name} (cli ${file} --help)`);
				passed++;
			} else {
				const why = run
					? `exit ${run.status}: ${run.stderr.trim().split("\n")[0]}`
					: "file not found";
				console.error(`  FAIL  @plugdash/${name} - ${file} --help, ${why}`);
				failures++;
			}
		}
	}

	const total = packages.length + cliPackages.length;
	console.log(`\n${passed} passed, ${failures} failed, ${total} total`);

	if (failures > 0) {
		process.exit(1);
	}
}

main();
