import { expect, expectTypeOf, test } from 'vitest';
import { defineContainerCatalog } from './container-catalog.js';
import { Container } from './container-kind.js';

test(
  'given a consumer container kind, when a catalog is defined, then built-in and custom kinds remain typed',
  () => {
    const catalog = defineContainerCatalog({ Postgres: 'postgres' });

    expectTypeOf(catalog.Postgres).toEqualTypeOf<'postgres'>();
    expect(catalog).toEqual({
      SqlServer: Container.SqlServer,
      Postgres: 'postgres',
    });
  },
);

test(
  'given a custom catalog duplicates a built-in name, when it is defined, then the conflict is rejected',
  () => {
    expect(() =>
      defineContainerCatalog({ SqlServer: 'postgres' }),
    ).toThrow('Container catalog name is already built in: SqlServer');
  },
);
