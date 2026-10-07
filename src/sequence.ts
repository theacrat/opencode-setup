async function sequence<Value>(
  values: Iterable<Value>,
  visit: (value: Value) => Promise<void>,
): Promise<void> {
  const iterator = values[Symbol.iterator]();
  async function advance(): Promise<void> {
    const entry = iterator.next();
    if (entry.done) {
      return;
    }
    await visit(entry.value);
    await advance();
  }
  await advance();
}
export { sequence };
