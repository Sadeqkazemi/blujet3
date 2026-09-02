import { getMetadataArgsStorage } from 'typeorm';
import { dataSourceOptions } from './data-source.options';

describe('Notify database ownership', () => {
  it('uses only the notify schema', () => {
    expect(dataSourceOptions.entities).toBeDefined();
    const expected = ['notifications', 'sms_logs'];
    const tables = getMetadataArgsStorage().tables.filter(({ name }) =>
      expected.includes(name ?? ''),
    );

    expect(tables).toHaveLength(expected.length);
    expect(
      tables.map(({ name, schema }) => `${schema}.${name}`).sort(),
    ).toEqual(expected.map((table) => `notify.${table}`).sort());
  });
});
