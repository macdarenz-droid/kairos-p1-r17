import { KairosDatabase } from './KairosDatabase';
import { KAIROS_DB_SCHEMA_VERSION } from './schema';

export type DatabaseLifecycleState =
  | 'idle'
  | 'opening'
  | 'ready'
  | 'version-change'
  | 'upgrade-blocked'
  | 'closed'
  | 'error';

export interface DatabaseLifecycleStatus {
  readonly state: DatabaseLifecycleState;
  readonly schemaVersion: number;
  readonly errorName?: string;
  readonly errorMessage?: string;
}

type DatabaseLifecycleListener = (status: DatabaseLifecycleStatus) => void;

const listeners = new Set<DatabaseLifecycleListener>();
let currentStatus: DatabaseLifecycleStatus = {
  state: 'idle',
  schemaVersion: KAIROS_DB_SCHEMA_VERSION,
};

function publish(status: DatabaseLifecycleStatus): DatabaseLifecycleStatus {
  currentStatus = Object.freeze({ ...status });
  for (const listener of listeners) listener(currentStatus);
  return currentStatus;
}

export function getDatabaseLifecycleStatus(): DatabaseLifecycleStatus {
  return currentStatus;
}

export function subscribeDatabaseLifecycle(listener: DatabaseLifecycleListener): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => listeners.delete(listener);
}

export function createKairosDatabase(name?: string): KairosDatabase {
  const db = new KairosDatabase(name);

  db.on('versionchange', () => {
    publish({ state: 'version-change', schemaVersion: KAIROS_DB_SCHEMA_VERSION });
  });

  db.on('blocked', () => {
    publish({ state: 'upgrade-blocked', schemaVersion: KAIROS_DB_SCHEMA_VERSION });
  });

  db.on('close', () => {
    if (currentStatus.state !== 'version-change') {
      publish({ state: 'closed', schemaVersion: KAIROS_DB_SCHEMA_VERSION });
    }
  });

  return db;
}

export const kairosDatabase = createKairosDatabase();

export async function openKairosDatabase(db = kairosDatabase): Promise<DatabaseLifecycleStatus> {
  publish({ state: 'opening', schemaVersion: KAIROS_DB_SCHEMA_VERSION });

  try {
    await db.open();
    return publish({ state: 'ready', schemaVersion: KAIROS_DB_SCHEMA_VERSION });
  } catch (error) {
    const failure = error instanceof Error
      ? { errorName: error.name, errorMessage: error.message }
      : { errorName: 'UnknownDatabaseError', errorMessage: 'Database open failed with a non-Error value.' };

    return publish({
      state: 'error',
      schemaVersion: KAIROS_DB_SCHEMA_VERSION,
      ...failure,
    });
  }
}

export function closeKairosDatabase(db = kairosDatabase): void {
  db.close();
  publish({ state: 'closed', schemaVersion: KAIROS_DB_SCHEMA_VERSION });
}
