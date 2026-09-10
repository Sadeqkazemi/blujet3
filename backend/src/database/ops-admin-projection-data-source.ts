import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { opsAdminProjectionDataSourceOptions } from './ops-admin-projection-data-source.options';

export default new DataSource(
  opsAdminProjectionDataSourceOptions(
    process.env.OPS_ADMIN_PROJECTION_DATABASE_URL,
  ),
);
