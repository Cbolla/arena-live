import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Repository } from '../server/database/repository';
test('migrations, delta accumulation, daily buckets, persistence across reconnects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'arena-db-test-'));
  const url = 'file:' + join(directory, 'test.db').replaceAll('\\', '/'); let repository: Repository | undefined;
  try {
    await promisify(execFile)(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url } });
    repository = new Repository(url); await repository.start('one'); await repository.start('two');
    const delta = { sessionId: 'one', userId: 'a', username: 'Ana', points: 10, kills: 1, wins: 0, at: new Date() };
    await Promise.all([repository.score(delta), repository.score(delta)]);
    await repository.score({ ...delta, sessionId: 'two', points: 5, kills: 0, wins: 1 });
    assert.deepEqual(await repository.ranking('session', 'one'), [{ username: 'Ana', points: 20, kills: 2, wins: 0 }]);
    assert.deepEqual(await repository.ranking('day', 'two'), [{ username: 'Ana', points: 25, kills: 2, wins: 1 }]);
    await repository.close(); repository = new Repository(url);
    assert.equal((await repository.ranking('all', 'unused'))[0].points, 25);
    assert.equal((await repository.ranking('week', 'unused'))[0].wins, 1);
  } finally { await repository?.close(); await rm(directory, { recursive: true, force: true }); }
});
