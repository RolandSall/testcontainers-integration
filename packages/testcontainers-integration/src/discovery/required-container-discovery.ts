import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';
import { Container } from '../container-kind.js';
import type { ContainerKind } from '../container-resource-map.js';
import type { RequiredContainerInstance } from '../required-container.js';

const SKIPPED_DIRECTORIES = new Set(['.git', '.next', '.nx', 'dist', 'legacy', 'node_modules']);

/** Controls source scanning for literal named `@RequiredContainer({...})` declarations. */
export interface RequiredContainerDiscoveryOptions {
  readonly root: string;
  readonly testFileSuffix?: string;
  readonly containerNames?: Readonly<Record<string, ContainerKind>>;
}

/** Named container requirements discovered in one test file. */
export interface DiscoveredRequiredContainerFile {
  readonly filePath: string;
  readonly containers: readonly RequiredContainerInstance[];
}

/** Statically discovers the named container declaration in each integration-test file. */
export const discoverRequiredContainerFiles = async (
  options: RequiredContainerDiscoveryOptions,
): Promise<readonly DiscoveredRequiredContainerFile[]> => {
  const suffix = options.testFileSuffix ?? '.container.integration.test.ts';
  const files = await findTestFiles(options.root, suffix);
  const names = options.containerNames ?? Container;
  return Promise.all(files.map(async (filePath) => {
    const sourceText = await readFile(filePath, 'utf8');
    const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
    const declarations: Array<readonly RequiredContainerInstance[]> = [];
    visit(source, source, names, declarations);
    if (declarations.length > 1) {
      throw new Error(`${filePath}: expected one @RequiredContainer declaration, found ${declarations.length}`);
    }
    const containers = declarations[0];
    if (containers === undefined) {
      throw new Error(`${filePath}: expected one named @RequiredContainer({...}) declaration`);
    }
    return { filePath, containers };
  }));
};

/** Returns the unique globally shared instances and validates shared-name consistency. */
export const discoverSharedContainerInstances = async (
  options: RequiredContainerDiscoveryOptions,
): Promise<readonly RequiredContainerInstance[]> => {
  const files = await discoverRequiredContainerFiles(options);
  const shared = new Map<string, RequiredContainerInstance>();
  for (const file of files) {
    for (const instance of file.containers.filter(({ isolation }) => isolation === 'shared')) {
      const existing = shared.get(instance.name);
      if (existing !== undefined && existing.kind !== instance.kind) {
        throw new Error(
          `${file.filePath}: shared container ${instance.name} conflicts with kind ${existing.kind}`,
        );
      }
      shared.set(instance.name, instance);
    }
  }
  return [...shared.values()];
};

/** Compatibility view containing unique kinds from every declaration. */
export const discoverRequiredContainers = async (
  options: RequiredContainerDiscoveryOptions,
): Promise<readonly ContainerKind[]> => [
  ...new Set(
    (await discoverRequiredContainerFiles(options))
      .flatMap(({ containers }) => containers.map(({ kind }) => kind)),
  ),
];

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
  declarations: Array<readonly RequiredContainerInstance[]>,
): void => {
  if (ts.isClassDeclaration(node) && ts.canHaveDecorators(node)) {
    for (const decorator of ts.getDecorators(node) ?? []) {
      const declaration = readRequiredContainerDecorator(decorator, source, names);
      if (declaration !== undefined) declarations.push(declaration);
    }
  }
  ts.forEachChild(node, (child) => visit(child, source, names, declarations));
};

const readRequiredContainerDecorator = (
  decorator: ts.Decorator,
  source: ts.SourceFile,
  names: Readonly<Record<string, ContainerKind>>,
): readonly RequiredContainerInstance[] | undefined => {
  const expression = decorator.expression;
  if (
    !ts.isCallExpression(expression) ||
    !ts.isIdentifier(expression.expression) ||
    expression.expression.text !== 'RequiredContainer'
  ) return undefined;
  const argument = expression.arguments[0];
  if (expression.arguments.length !== 1 || argument === undefined || !ts.isObjectLiteralExpression(argument)) {
    throw new Error(`${source.fileName}: @RequiredContainer requires one named object literal`);
  }
  if (argument.properties.length === 0) {
    throw new Error(`${source.fileName}: @RequiredContainer needs at least one named container`);
  }
  const seen = new Set<string>();
  return argument.properties.map((property) => {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error(`${source.fileName}: @RequiredContainer does not allow spreads or shorthand properties`);
    }
    const name = propertyName(property.name, source);
    if (seen.has(name)) {
      throw new Error(`${source.fileName}: @RequiredContainer name is duplicated: ${name}`);
    }
    seen.add(name);
    if (!ts.isObjectLiteralExpression(property.initializer)) {
      throw new Error(`${source.fileName}: @RequiredContainer declaration must be an object: ${name}`);
    }
    return readDefinition(name, property.initializer, source, names);
  });
};

const readDefinition = (
  name: string,
  object: ts.ObjectLiteralExpression,
  source: ts.SourceFile,
  names: Readonly<Record<string, ContainerKind>>,
): RequiredContainerInstance => {
  let kind: ContainerKind | undefined;
  let isolation: 'shared' | 'dedicated' | undefined;
  const seen = new Set<string>();
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error(`${source.fileName}: container ${name} does not allow spreads or shorthand properties`);
    }
    const field = propertyName(property.name, source);
    if (seen.has(field)) {
      throw new Error(`${source.fileName}: container ${name} field is duplicated: ${field}`);
    }
    seen.add(field);
    if (field === 'kind') {
      kind = readKind(property.initializer, source, names);
    } else if (field === 'isolation') {
      isolation = readIsolation(property.initializer, source);
    } else {
      throw new Error(`${source.fileName}: container ${name} has unknown field: ${field}`);
    }
  }
  if (kind === undefined || isolation === undefined) {
    throw new Error(`${source.fileName}: container ${name} requires kind and isolation`);
  }
  return { name, kind, isolation };
};

const propertyName = (name: ts.PropertyName, source: ts.SourceFile): string => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  throw new Error(`${source.fileName}: @RequiredContainer names and fields must be literal`);
};

const readKind = (
  value: ts.Expression,
  source: ts.SourceFile,
  names: Readonly<Record<string, ContainerKind>>,
): ContainerKind => {
  if (
    !ts.isPropertyAccessExpression(value) ||
    !ts.isIdentifier(value.expression) ||
    value.expression.text !== 'Container'
  ) {
    throw new Error(`${source.fileName}: container kind must use Container.<name>`);
  }
  const kind = names[value.name.text];
  if (kind === undefined) {
    throw new Error(`${source.fileName}: unknown container name Container.${value.name.text}`);
  }
  return kind;
};

const readIsolation = (value: ts.Expression, source: ts.SourceFile): 'shared' | 'dedicated' => {
  if (!ts.isStringLiteral(value) || (value.text !== 'shared' && value.text !== 'dedicated')) {
    throw new Error(`${source.fileName}: container isolation must be 'shared' or 'dedicated'`);
  }
  return value.text;
};
