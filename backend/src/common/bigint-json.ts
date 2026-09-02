/**
 * `JSON.stringify` throws on a raw `bigint` (`TypeError: Do not know how to
 * serialize a BigInt`), and every IRR money column is now `bigint` (see
 * money.ts). Rather than hand-serialize each DTO, every `bigint` is
 * rendered as its decimal string on the wire — a JS `number` can't safely
 * hold amounts above 2^53 anyway, so string was already the correct API
 * shape for money. Imported once for its side effect, before anything else
 * can serialize a response (main.ts for the real app, test/jest-setup.ts
 * for e2e tests going through supertest).
 */
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function (
  this: bigint,
) {
  return this.toString();
};

export {};
