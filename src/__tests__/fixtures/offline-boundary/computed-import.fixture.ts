export async function loadComputedModule(moduleName: string): Promise<unknown> {
  return import(moduleName);
}
