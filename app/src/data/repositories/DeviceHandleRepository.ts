import type { DatabaseDeviceHandleRecord } from "../database/schema";
import type { KairosDatabase } from "../database/KairosDatabase";

/** U8 (D227) raw persistence of this device's handles (never in a backup, kept by a restore); no application rules. */
export class DeviceHandleRepository {
  constructor(private readonly db: KairosDatabase) {}
  get(key: string) {
    return this.db.deviceHandles.get(key);
  }
  put(record: DatabaseDeviceHandleRecord) {
    return this.db.deviceHandles.put(record).then(() => undefined);
  }
  delete(key: string) {
    return this.db.deviceHandles.delete(key);
  }
}
