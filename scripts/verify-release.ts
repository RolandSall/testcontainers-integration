import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly private: boolean;
  readonly dependencies: Readonly<Record<string, string>>;
}

const root = resolve(import.meta.dirname, '..');
const packageDirectories = (await readdir(resolve(root, 'packages'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => `packages/${entry.name}`);

const manifests = new Map<string, PackageManifest>();
for (const directory of packageDirectories) {
  const manifest = await readManifest(directory);
  manifests.set(manifest.name, manifest);
}

const primary = requiredManifest('@integration-testing/testcontainers');
if (primary.private) {
  throw new Error(`${primary.name} must remain publishable`);
}
for (const manifest of manifests.values()) {
  if (manifest === primary) {
    continue;
  }
  if (!manifest.private) {
    throw new Error(`${manifest.name} must be private or removed from the release workspace`);
  }
  process.stdout.write(`non-release package confirmed private: ${manifest.name}\n`);
}
assertVersionIsUnpublished(primary);
process.stdout.write(`release preflight passed for ${primary.name}@${primary.version}\n`);

async function readManifest(directory: string): Promise<PackageManifest> {
  const source = await readFile(resolve(root, directory, 'package.json'), 'utf8');
  const parsed: unknown = JSON.parse(source);
  if (!isRecord(parsed) || typeof parsed.name !== 'string' || typeof parsed.version !== 'string') {
    throw new Error(`${directory}/package.json must contain string name and version fields`);
  }
  const dependencies = parsed.dependencies;
  if (dependencies !== undefined && !isStringRecord(dependencies)) {
    throw new Error(`${directory}/package.json dependencies must contain string versions`);
  }
  return {
    name: parsed.name,
    version: parsed.version,
    private: parsed.private === true,
    dependencies: dependencies ?? {},
  };
}

function requiredManifest(name: string): PackageManifest {
  const manifest = manifests.get(name);
  if (manifest === undefined) {
    throw new Error(`Missing release package manifest: ${name}`);
  }
  return manifest;
}

function assertVersionIsUnpublished(manifest: PackageManifest): void {
  const specification = `${manifest.name}@${manifest.version}`;
  const result = spawnSync('npm', ['view', specification, 'version', '--json'], {
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status === 0) {
    throw new Error(`npm already contains immutable version ${specification}`);
  }
  const output = `${result.stdout}${result.stderr}`;
  if (!output.includes('E404')) {
    throw new Error(`Could not verify npm version availability for ${specification}:\n${output}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}
