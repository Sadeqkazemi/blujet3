import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loyaltyMigrationDataSourceOptions } from './data-source.options';

export default new DataSource(
  loyaltyMigrationDataSourceOptions(process.env.LOYALTY_DATABASE_URL),
);
