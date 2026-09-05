import type { Config } from 'jest';
import { createConfiguredJestAnnotationLifecycle } from './annotation-global-lifecycle.js';

interface JestProjectConfig {
  readonly rootDir: string;
  readonly globals: Config['globals'];
}

export default async (
  _globalConfig: unknown,
  projectConfig: JestProjectConfig,
): Promise<void> => {
  await createConfiguredJestAnnotationLifecycle(projectConfig).setup();
};
