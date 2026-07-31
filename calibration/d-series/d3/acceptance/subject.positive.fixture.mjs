export function publishRows(rows) {
  const published = rows.filter((row) => row.publishable);
  const explained = [];
  return { ok: true, published, explained };
}
