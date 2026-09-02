import type {
  EntityManager,
  FindOneOptions,
  ObjectLiteral,
  Repository,
} from 'typeorm';

/**
 * Mirrors Prisma's `findUniqueOrThrow`/`findFirstOrThrow` — an invariant
 * assertion ("this row must exist"), not a user-facing lookup. Throws a
 * plain `Error` (not an `HttpException`) so `AllExceptionsFilter` maps a
 * miss to 500/INTERNAL_ERROR, matching Prisma's own behaviour byte-for-byte
 * (a `findUniqueOrThrow` miss is NOT an `HttpException` either). Call sites
 * that want a 404 instead must throw `NotFoundException` themselves — never
 * swap this helper in for that without checking the original behaviour.
 */
export async function findOneOrThrow<T extends ObjectLiteral>(
  repo: Repository<T> | EntityManager,
  entityOrOptions: (new () => T) | FindOneOptions<T>,
  maybeOptions?: FindOneOptions<T>,
): Promise<T> {
  const isManager = 'findOne' in repo && 'getRepository' in repo;
  const row = isManager
    ? await repo.findOne(
        entityOrOptions as new () => T,
        maybeOptions as FindOneOptions<T>,
      )
    : await repo.findOne(entityOrOptions as FindOneOptions<T>);

  if (!row) {
    const where = isManager
      ? maybeOptions?.where
      : (entityOrOptions as FindOneOptions<T>).where;
    throw new Error(
      `Expected exactly one row matching ${JSON.stringify(where)}`,
    );
  }
  return row;
}
