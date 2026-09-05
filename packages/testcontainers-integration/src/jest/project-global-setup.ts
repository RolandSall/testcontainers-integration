import type { Config } from 'jest';
import { createConfiguredJestLifecycle } from './project-global-lifecycle.js';

interface JestProjectConfig {
  readonly rootDir: string;
  readonly globals: Config['globals'];
}

export default async (_globalConfig: unknown, projectConfig: JestProjectConfig): Promise<void> => {
  await createConfiguredJestLifecycle(projectConfig).setup();
};
