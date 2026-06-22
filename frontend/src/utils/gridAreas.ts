import type { Grid } from '../../types';

export type LatLngTuple = [number, number];

export type GridArea = {
  id: string;
  name: string;
  project?: string;
  grid?: string;
  project_id?: string | number | null;
  grid_id?: string;
  bounds: LatLngTuple[];
};

const normalizePoint = (value: unknown): LatLngTuple | null => {
  if (Array.isArray(value) && value.length >= 2) {
    const first = Number(value[0]);
    const second = Number(value[1]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
    if (Math.abs(first) <= 90 && Math.abs(second) <= 180) return [first, second];
    if (Math.abs(second) <= 90 && Math.abs(first) <= 180) return [second, first];
    return null;
  }

  if (value && typeof value === 'object') {
    const point = value as Record<string, unknown>;
    const lat = Number(point.lat ?? point.latitude);
    const lng = Number(point.lng ?? point.lon ?? point.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return normalizePoint([lat, lng]);
  }

  return null;
};

const parseMaybeJson = (value: unknown) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const parseGridBounds = (value: unknown): LatLngTuple[] => {
  const parsed = parseMaybeJson(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(normalizePoint)
    .filter((point): point is LatLngTuple => Boolean(point));
};

export const getGridBoundsSource = (grid: Grid | Record<string, unknown>) =>
  (grid as Record<string, unknown>).bounds_json ||
  (grid as Record<string, unknown>).bounds ||
  (grid as Record<string, unknown>).boundary_json ||
  (grid as Record<string, unknown>).boundaryJson ||
  (grid as Record<string, unknown>).boundary ||
  (grid as Record<string, unknown>).area_boundary;

export const toGridAreas = (grids: Array<Grid | Record<string, unknown>>): GridArea[] =>
  grids
    .map((grid) => {
      const record = grid as Record<string, unknown>;
      const bounds = parseGridBounds(getGridBoundsSource(record));
      return {
        id: String(record.id || record.grid_id || ''),
        name: String(record.name || record.grid_id || 'Grid'),
        project: record.project ? String(record.project) : undefined,
        grid: record.grid ? String(record.grid) : undefined,
        project_id: record.project_id as string | number | null | undefined,
        grid_id: record.grid_id ? String(record.grid_id) : undefined,
        bounds,
      };
    })
    .filter((area) => area.id && area.bounds.length >= 3);

export const latLngToAmapPath = (bounds: LatLngTuple[]) =>
  bounds.map(([lat, lng]) => [lng, lat] as [number, number]);

export const boundsCenter = (bounds: LatLngTuple[]): LatLngTuple => {
  const lat = bounds.reduce((sum, point) => sum + point[0], 0) / bounds.length;
  const lng = bounds.reduce((sum, point) => sum + point[1], 0) / bounds.length;
  return [lat, lng];
};
