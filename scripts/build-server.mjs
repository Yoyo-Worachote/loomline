import { build } from 'esbuild';

await build({
  entryPoints: ['src/server/main.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  minify: false,
  sourcemap: true,
  // ws (CommonJS) needs a real require() for node built-ins inside an ESM bundle
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  external: ['bufferutil', 'utf-8-validate'],
});
console.log('server bundle: dist/server.mjs');
