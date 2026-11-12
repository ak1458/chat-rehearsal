import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const worker = dirname(require.resolve('tesseract.js/package.json'));
const core = dirname(require.resolve('tesseract.js-core/package.json', { paths: [worker] }));
const language = dirname(require.resolve('@tesseract.js-data/eng/package.json'));
const destination = new URL('../public/ocr/', import.meta.url);
await mkdir(destination, { recursive: true });
const assets = [
  [join(worker, 'dist', 'worker.min.js'), 'worker.min.js'],
  [join(language, '4.0.0_best_int', 'eng.traineddata.gz'), 'eng.traineddata.gz'],
  ...['', '-simd', '-relaxedsimd'].map(suffix => [
    join(core, `tesseract-core${suffix}-lstm.wasm.js`),
    `tesseract-core${suffix}-lstm.wasm.js`,
  ]),
];
await Promise.all(assets.map(([source, filename]) => cp(source, new URL(filename, destination))));
