/** Validate JSON scalar fields before passing them to typed test consumers. */
export function responseString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('Expected a string in the API response');
  }
  return value;
}
