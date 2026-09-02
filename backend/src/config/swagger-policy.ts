export function isSwaggerEnabled(environment: NodeJS.ProcessEnv): boolean {
  return environment.NODE_ENV !== 'production';
}
