import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const packageRoot = process.cwd();
const esmTypes = resolve(packageRoot, 'dist/types/esm');
const commonJsTypes = resolve(packageRoot, 'dist/types/cjs');

await cp(esmTypes, commonJsTypes, { recursive: true });
await mkdir(commonJsTypes, { recursive: true });
await writeFile(
  resolve(commonJsTypes, 'package.json'),
  `${JSON.stringify({ type: 'commonjs' }, undefined, 2)}\n`,
  'utf8',
);
