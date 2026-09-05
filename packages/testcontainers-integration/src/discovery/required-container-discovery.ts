import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';
import { Container } from '../container-kind.js';
import type { ContainerKind } from '../container-resource-map.js';

const SKIPPED_DIRECTORIES = new Set(['.git', '.next', '.nx', 'dist', 'legacy', 'node_modules']);

/** Controls source scanning for literal `@RequiredContainer([Container.<name>])` declarations. */
export interface RequiredContainerDiscoveryOptions {
  /** Root directory recursively searched for integration-test files. */
  readonly root: string;
  /** File suffix to scan. Defaults to `.container.integration.test.ts`. */
  readonly testFileSuffix?: string;
  /** Catalog used to resolve built-in and consumer-defined container property names. */
  readonly containerNames?: Readonly<Record<string, ContainerKind>>;
}

/**
 * Statically discovers unique required kinds before a runner imports test modules.
 *
 * @throws When a decorator is empty, uses a nonliteral argument, or names an unknown kind.
 */
export const discoverRequiredContainers = async (
  options: RequiredContainerDiscoveryOptions,
): Promise<readonly ContainerKind[]> => {
  const suffix = options.testFileSuffix ?? '.container.integration.test.ts';
  const files = await findTestFiles(options.root, suffix);
  const kinds = new Set<ContainerKind>();
  const names = options.containerNames ?? Container;

  for (const file of files) {
    const sourceText = await readFile(file, 'utf8');
    const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
    visit(source, source, names, kinds);
  }

  return [...kinds];
};

const findTestFiles = async (root: string, suffix: string): Promise<readonly string[]> => {
  const files: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        files.push(...(await findTestFiles(join(root, entry.name), suffix)));
      }
    } else if (entry.isFile() && entry.name.endsWith(suffix)) {
      files.push(join(root, entry.name));
    }
  }
  return files;
};

const visit = (
  node: ts.Node,
  source: ts.SourceFile,
  names: Readonly<Record<string, ContainerKind>>,
  kinds: Set<ContainerKind>,
): void => {
  if (ts.isClassDeclaration(node) && ts.canHaveDecorators(node)) {
    for (const decorator of ts.getDecorators(node) ?? []) {
      readRequiredContainerDecorator(decorator, source, names, kinds);
    }
  }
  ts.forEachChild(node, (child) => visit(child, source, names, kinds));
};

const readRequiredContainerDecorator = (
  decorator: ts.Decorator,
  source: ts.SourceFile,
  names: Readonly<Record<string, ContainerKind>>,
  kinds: Set<ContainerKind>,
): void => {
  const expression = decorator.expression;
  if (!ts.isCallExpression(expression)) {
    return;
  }
  if (!ts.isIdentifier(expression.expression) || expression.expression.text !== 'RequiredContainer') {
    return;
  }
  if (expression.arguments.length === 0) {
    throw new Error(`${source.fileName}: RequiredContainer needs at least one container`);
  }

  const argumentsToRead = readDecoratorArguments(expression, source);
  for (const argument of argumentsToRead) {
    if (
      !ts.isPropertyAccessExpression(argument) ||
      !ts.isIdentifier(argument.expression) ||
      argument.expression.text !== 'Container'
    ) {
      throw new Error(
        `${source.fileName}: RequiredContainer arguments must use Container.<name>`,
      );
    }
    const kind = names[argument.name.text];
    if (kind === undefined) {
      throw new Error(
        `${source.fileName}: unknown container name Container.${argument.name.text}`,
      );
    }
    kinds.add(kind);
  }
};

const readDecoratorArguments = (
  expression: ts.CallExpression,
  source: ts.SourceFile,
): readonly ts.Expression[] => {
  const firstArgument = expression.arguments[0];
  if (
    expression.arguments.length !== 1 ||
    firstArgument === undefined ||
    !ts.isArrayLiteralExpression(firstArgument)
  ) {
    return expression.arguments;
  }
  const elements = firstArgument.elements;
  if (elements.length === 0) {
    throw new Error(`${source.fileName}: RequiredContainer needs at least one container`);
  }
  return elements;
};
