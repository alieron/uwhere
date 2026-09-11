import { isGroupSnapshot } from './group.ts';
import type { GroupSnapshot } from './group.ts';
import type { BuildingLocation } from './waterloo.ts';

export const GROUPS_KEY = 'uwhere_groups_v1';
const TOKEN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

export interface GroupEntry {
  token: string;
  snapshot: GroupSnapshot | null;
}

export interface GroupRegistry {
  entries: GroupEntry[];
  activeToken: string | null;
}

export interface RegistryInitialization {
  registry: GroupRegistry;
  storageWarningToken: string | null;
}

export interface AppState {
  buildingLocations: Record<string, BuildingLocation>;
  buildingsLoaded: boolean;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type SetState = React.Dispatch<React.SetStateAction<AppState>>;

export function isGroupToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN.test(value);
}

export function parseRegistry(raw: string | null): GroupRegistry {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    const candidate = value as Record<string, unknown>;
    if (!Array.isArray(candidate.entries)) throw new Error();

    const entries: GroupEntry[] = [];
    const seen = new Set<string>();
    for (const item of candidate.entries) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const entry = item as Record<string, unknown>;
      if (!isGroupToken(entry.token) || seen.has(entry.token)) continue;
      if (entry.snapshot !== null && !isGroupSnapshot(entry.snapshot)) continue;
      seen.add(entry.token);
      entries.push({ token: entry.token, snapshot: entry.snapshot });
    }

    const activeToken = isGroupToken(candidate.activeToken)
      && entries.some((entry) => entry.token === candidate.activeToken)
      ? candidate.activeToken
      : entries[0]?.token ?? null;
    return { entries, activeToken };
  } catch {
    return { entries: [], activeToken: null };
  }
}

export function loadRegistry(storage?: StorageLike): GroupRegistry {
  try {
    return parseRegistry((storage ?? localStorage).getItem(GROUPS_KEY));
  } catch {
    return { entries: [], activeToken: null };
  }
}

export function persistRegistry(registry: GroupRegistry, storage?: StorageLike): boolean {
  try {
    (storage ?? localStorage).setItem(GROUPS_KEY, JSON.stringify(registry));
    return true;
  } catch {
    return false;
  }
}

export function initializeRegistry(fragment: string, storage?: StorageLike): RegistryInitialization {
  let registry = loadRegistry(storage);
  const token = groupTokenFromFragment(fragment);
  if (token) registry = importGroupToken(registry, token);
  const persisted = persistRegistry(registry, storage);
  return { registry, storageWarningToken: token && !persisted ? token : null };
}

export function groupTokenFromFragment(fragment: string): string | null {
  const match = fragment.match(/^#group=([A-Za-z0-9_-]{43})$/);
  return match && isGroupToken(match[1]) ? match[1] : null;
}

export function importGroupToken(registry: GroupRegistry, token: string): GroupRegistry {
  if (!isGroupToken(token)) return registry;
  return {
    entries: registry.entries.some((entry) => entry.token === token)
      ? registry.entries
      : [...registry.entries, { token, snapshot: null }],
    activeToken: token,
  };
}

export function forgetGroup(registry: GroupRegistry, token: string): GroupRegistry {
  const entries = registry.entries.filter((entry) => entry.token !== token);
  return {
    entries,
    activeToken: registry.activeToken === token ? entries[0]?.token ?? null : registry.activeToken,
  };
}

export function acceptSnapshot(current: GroupSnapshot | null, incoming: GroupSnapshot): GroupSnapshot {
  return current && current.revision > incoming.revision ? current : incoming;
}

export function groupInviteUrl(
  location: Pick<Location, 'origin' | 'pathname' | 'search'>,
  token: string,
): string {
  if (!isGroupToken(token)) throw new Error('Invalid group token');
  return `${location.origin}${location.pathname}${location.search}#group=${token}`;
}

export async function loadBuildings(setState: SetState): Promise<void> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/buildings.json`);
    if (!response.ok) throw new Error(`Building data could not be loaded (${response.status})`);
    const buildings = await response.json() as Record<string, BuildingLocation>;
    setState((state) => ({ ...state, buildingLocations: buildings, buildingsLoaded: true }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }
}

export function initialState(): AppState {
  return { buildingLocations: {}, buildingsLoaded: false };
}
