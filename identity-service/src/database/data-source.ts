import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { identityMigrationDataSourceOptions } from './data-source.options';

export default new DataSource(
  identityMigrationDataSourceOptions(process.env.IDENTITY_DATABASE_URL),
);
