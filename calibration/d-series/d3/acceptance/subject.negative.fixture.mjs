export function publishRows(rows) {
  const published = rows.filter((row) => row.publishable);
  const explained = rows.filter((row) => !row.publishable);
  if (rows.length !== published.length + explained.length) {
    throw new Error('row conservation failed');
  }
  return { ok: true, published, explained };
}
