import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './data-source.options';

/**
 * @Global() so `DataSource`/`EntityManager` are injectable anywhere;
 * individual feature modules additionally import
 * `TypeOrmModule.forFeature([...])` for `@InjectRepository`.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forRoot(dataSourceOptions)],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
