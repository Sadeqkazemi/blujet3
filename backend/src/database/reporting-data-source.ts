import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { reportingDataSourceOptions } from './reporting-data-source.options';

export default new DataSource(
  reportingDataSourceOptions(process.env.REPORTING_DATABASE_URL),
);
