import { settingsSchema, type Settings, type SettingsInput } from '@noors/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../lib/prisma.js';

type Db = PrismaClient | Prisma.TransactionClient;
type Key = keyof Settings;

/** Defaults for anything not saved yet. Each section is one row of the settings table. */
export const DEFAULT_SETTINGS: Settings = {
  store: {
    name: "Noor's",
    email: '',
    phone: '',
    address: 'Srinagar, Jammu and Kashmir',
    gstNumber: '',
  },
  shipping: { flatFee: 9900, freeFrom: 199900 },
  cod: { enabled: false, fee: 0 },
  returns: { windowDays: 7 },
  fulfilment: { autoShip: true },
  inventory: { lowStockThreshold: 3 },
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as Key[];

/** One section, saved values over the defaults. Values that no longer validate fall back. */
export async function loadSetting<K extends Key>(db: Db, key: K): Promise<Settings[K]> {
  const row = await db.setting.findUnique({ where: { key } });
  return merge(key, row?.value);
}

export async function loadSettings(db: Db): Promise<Settings> {
  const rows = await db.setting.findMany({ where: { key: { in: KEYS } } });
  const saved = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(KEYS.map((k) => [k, merge(k, saved.get(k))])) as Settings;
}

/** Saves every section. Returns what was stored. */
export async function saveSettings(db: Db, input: SettingsInput): Promise<Settings> {
  const settings = settingsSchema.parse(input);
  for (const key of KEYS) {
    const value = settings[key] as unknown as Prisma.InputJsonValue;
    await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  return settings;
}

function merge<K extends Key>(key: K, saved: unknown): Settings[K] {
  const defaults = DEFAULT_SETTINGS[key];
  if (!saved || typeof saved !== 'object') return defaults;
  const section = settingsSchema.shape[key].safeParse({ ...defaults, ...saved });
  return section.success ? (section.data as Settings[K]) : defaults;
}
