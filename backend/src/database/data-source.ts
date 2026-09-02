import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source.options';

/** Entry point for the `typeorm` CLI (`migration:generate`/`migration:run`/
 * `migration:revert`) and for the production entrypoint's
 * `migration:run:prod`. `dotenv/config` is imported explicitly because,
 * unlike the NestJS app itself, this file runs as a standalone script
 * outside Nest's ConfigModule — it needs to load `.env` on its own. */
export default new DataSource(dataSourceOptions);
