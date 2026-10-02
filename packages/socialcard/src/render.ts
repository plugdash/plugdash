// @plugdash/socialcard - SVG to PNG with resvg-wasm
//
// The plugin imports this module with `await import()` from the publish
// hook, so a normal page request never loads resvg, the WASM binary or the
// font data.

import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { LEXEND_400, LEXEND_700 } from "./fonts.ts";

let ready: Promise<void> | undefined;

async function loadWasm(): Promise<void> {
	try {
		// Node: read the binary next to the package.
		const { readFile } = await import("node:fs/promises");
		const { createRequire } = await import("node:module");
		const path = createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm");
		await initWasm(await readFile(path));
	} catch {
		// ponytail: Workers path, not run yet. workerd forbids compiling WASM
		// from bytes, so the bundler has to hand us a WebAssembly.Module.
		// Verify on a Cloudflare build before relying on it.
		const mod = await import("@resvg/resvg-wasm/index_bg.wasm?module");
		await initWasm(mod.default);
	}
}

function fromBase64(value: string): Uint8Array {
	const bin = atob(value);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/**
 * Reads extra bytes the card needs (a logo, a font). `http(s)` URLs are
 * fetched, anything else is read from disk (Node only).
 */
export async function loadBytes(source: string): Promise<Uint8Array> {
	if (/^https?:\/\//i.test(source)) {
		const res = await fetch(source);
		if (!res.ok) throw new Error(`GET ${source} returned ${res.status}`);
		return new Uint8Array(await res.arrayBuffer());
	}
	const { readFile } = await import("node:fs/promises");
	return new Uint8Array(await readFile(source));
}

/** Image bytes as a data: URI, since resvg does not fetch external images. */
export function toDataUri(bytes: Uint8Array): string {
	const type =
		bytes[0] === 0x89 && bytes[1] === 0x50
			? "image/png"
			: bytes[0] === 0xff && bytes[1] === 0xd8
				? "image/jpeg"
				: bytes[0] === 0x47 && bytes[1] === 0x49
					? "image/gif"
					: bytes[8] === 0x57 && bytes[9] === 0x45
						? "image/webp"
						: "image/svg+xml";
	let bin = "";
	for (let i = 0; i < bytes.length; i += 0x8000) {
		bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return `data:${type};base64,${btoa(bin)}`;
}

/** Rasterises a card SVG. `extraFonts` are TTF/OTF bytes used as fallbacks. */
export async function svgToPng(svg: string, extraFonts: Uint8Array[] = []): Promise<Uint8Array> {
	ready ??= loadWasm().catch((err) => {
		ready = undefined;
		throw err;
	});
	await ready;
	const resvg = new Resvg(svg, {
		font: {
			fontBuffers: [fromBase64(LEXEND_700), fromBase64(LEXEND_400), ...extraFonts],
			defaultFontFamily: "Lexend",
			sansSerifFamily: "Lexend",
		},
	});
	const image = resvg.render();
	const png = image.asPng();
	image.free();
	resvg.free();
	return png;
}
