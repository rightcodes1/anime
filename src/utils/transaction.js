// Simple transaction wrapper using DB BEGIN / COMMIT / ROLLBACK via db.execute.
// This works with the repository's db.execute usage pattern found elsewhere.
async function withTransaction(db, fn) {
  await db.execute({ sql: 'BEGIN' });
  try {
    const result = await fn();
    await db.execute({ sql: 'COMMIT' });
    return result;
  } catch (err) {
    try {
      await db.execute({ sql: 'ROLLBACK' });
    } catch (e) {
      console.error('Rollback failed:', e);
    }
    throw err;
  }
}

module.exports = { withTransaction };
