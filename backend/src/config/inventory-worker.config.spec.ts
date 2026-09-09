import {
  inventoryWorkerDataSourceOptions,
  validateInventoryWorkerEnv,
} from './inventory-worker.config';

const base = {
  NODE_ENV: 'test',
  INVENTORY_DATABASE_URL:
    'postgresql://blujet_inventory_reader:secret@localhost:5432/blujet',
  INVENTORY_INTERNAL_TOKEN: 'inventory-internal-token-2026-09-09',
  PORT: '3650',
};

describe('inventory worker config', () => {
  it('accepts the dedicated reader URL and token', () => {
    expect(validateInventoryWorkerEnv(base)).toBe(base);
    expect(inventoryWorkerDataSourceOptions(base)).toMatchObject({
      url: base.INVENTORY_DATABASE_URL,
      synchronize: false,
      migrations: [],
    });
  });

  it('rejects a writer URL or short token', () => {
    expect(() =>
      validateInventoryWorkerEnv({
        ...base,
        INVENTORY_DATABASE_URL:
          'postgresql://blujet:secret@localhost:5432/blujet',
      }),
    ).toThrow('blujet_inventory_reader');
    expect(() =>
      validateInventoryWorkerEnv({
        ...base,
        INVENTORY_INTERNAL_TOKEN: 'short',
      }),
    ).toThrow('INVENTORY_INTERNAL_TOKEN');
  });
});
