import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { agencyMigrationDataSourceOptions } from './data-source.options';

export default new DataSource(
  agencyMigrationDataSourceOptions(process.env.AGENCY_DATABASE_URL),
);
