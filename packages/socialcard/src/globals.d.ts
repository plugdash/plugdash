// Workers bundlers resolve a `?module` WASM import to a compiled module.
declare module "*.wasm?module" {
	const mod: WebAssembly.Module;
	export default mod;
}
