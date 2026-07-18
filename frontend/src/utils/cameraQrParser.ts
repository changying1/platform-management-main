export interface CameraQrResult {
  deviceSerial?: string;
  simCardId?: string;
}

const SERIAL_KEYS = ['deviceSerial', 'serial', 'deviceCode', 'device_serial', 'sn'];
const SIM_KEYS = ['iccid', 'simCardId', 'sim_card_id', 'sim'];

const normalizeSerial = (value: unknown) => {
  const text = String(value ?? '').trim().replace(/\s+/g, '');
  return text || undefined;
};

const normalizeIccid = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D+/g, '');
  return digits.length >= 16 && digits.length <= 24 ? digits : undefined;
};

const pickFromObject = (obj: Record<string, unknown>): CameraQrResult => {
  const result: CameraQrResult = {};
  const entries = Object.entries(obj);
  for (const key of SERIAL_KEYS) {
    const found = entries.find(([itemKey]) => itemKey.toLowerCase() === key.toLowerCase());
    if (found) result.deviceSerial = normalizeSerial(found[1]);
  }
  for (const key of SIM_KEYS) {
    const found = entries.find(([itemKey]) => itemKey.toLowerCase() === key.toLowerCase());
    if (found) result.simCardId = normalizeIccid(found[1]);
  }
  return result;
};

const parseKeyValues = (text: string) => {
  const pairs = text.split(/[;&,\n\r]+/).map(item => item.trim()).filter(Boolean);
  const obj: Record<string, string> = {};
  for (const pair of pairs) {
    const match = pair.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
    if (match) obj[match[1].trim()] = match[2].trim();
  }
  return obj;
};

export function parseCameraQrContent(raw: string): CameraQrResult {
  const text = String(raw || '').trim();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return pickFromObject(parsed as Record<string, unknown>);
    }
  } catch {
    // not JSON
  }

  try {
    const url = new URL(text);
    const params = Object.fromEntries(url.searchParams.entries());
    const result = pickFromObject(params);
    if (result.deviceSerial || result.simCardId) return result;
  } catch {
    // not URL
  }

  const kvResult = pickFromObject(parseKeyValues(text));
  if (kvResult.deviceSerial || kvResult.simCardId) return kvResult;

  return { deviceSerial: normalizeSerial(text) };
}
