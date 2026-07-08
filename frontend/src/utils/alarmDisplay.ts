const ALARM_LABELS: Record<string, string> = {
  no_helmet: '未佩戴安全帽',
  nohelmet: '未佩戴安全帽',
  helmet_missing: '未佩戴安全帽',
  helmetmissing: '未佩戴安全帽',
  head: '未佩戴安全帽',
  no_safety_helmet: '未佩戴安全帽',
  safety_helmet_missing: '未佩戴安全帽',
  no_vest: '未穿反光衣',
  novest: '未穿反光衣',
  vest_missing: '未穿反光衣',
  reflective_vest_missing: '未穿反光衣',
  reflectivevestmissing: '未穿反光衣',
  no_reflective_vest: '未穿反光衣',
  no_harness: '未系安全带',
  harness_missing: '未系安全带',
  safety_harness_missing: '未系安全带',
  harness_violation: '未正确佩戴安全带',
  smoking: '吸烟',
  phone: '打电话',
  fire: '烟火',
  flame: '明火',
  smoke: '发现烟雾',
  person_fall: '人员倒地',
  ppe_violation: '防护用品穿戴异常',
  ppe: '防护用品穿戴异常',
};

const PPE_GENERIC_CODES = new Set(['ppe_violation', 'ppe', 'personal_protective_equipment']);

const DESCRIPTION_HINTS: Array<[string, string]> = [
  ['反光衣缺失', '未穿反光衣'],
  ['未穿反光衣', '未穿反光衣'],
  ['未佩戴反光衣', '未穿反光衣'],
  ['安全帽缺失', '未佩戴安全帽'],
  ['未戴安全帽', '未佩戴安全帽'],
  ['未佩戴安全帽', '未佩戴安全帽'],
  ['安全带缺失', '未系安全带'],
  ['未系安全带', '未系安全带'],
  ['未佩戴安全带', '未正确佩戴安全带'],
];

export const normalizeAlarmCode = (value: unknown) =>
  String(value || '')
    .trim()
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

export const getAlarmDisplayLabel = (value: unknown) => {
  const raw = String(value || '').trim().replace(/^\[|\]$/g, '');
  if (!raw) return '';
  const normalized = normalizeAlarmCode(raw);
  return ALARM_LABELS[normalized] || ALARM_LABELS[normalized.replace(/_/g, '')] || raw;
};

const appendUnique = (items: string[], value: string) => {
  if (value && !items.includes(value)) items.push(value);
};

const getAlarmBoxes = (alarm: any): any[] => {
  const candidates = [
    alarm?.alarm_boxes,
    alarm?.boxes,
    alarm?.data?.alarm_boxes,
    alarm?.data?.boxes,
    alarm?.payload?.alarm_boxes,
    alarm?.payload?.boxes,
    alarm?.details?.alarm_boxes,
    alarm?.details?.boxes,
    alarm?.detail?.alarm_boxes,
    alarm?.detail?.boxes,
    alarm?.result?.alarm_boxes,
    alarm?.result?.boxes,
    alarm?.event?.alarm_boxes,
    alarm?.event?.boxes,
  ];
  return candidates.find((candidate) => Array.isArray(candidate) && candidate.length > 0) || [];
};

export const getPpeDetailLabels = (alarm: any): string[] => {
  const labels: string[] = [];
  getAlarmBoxes(alarm).forEach((box) => {
    const fields = [box?.type, box?.label, box?.raw_label, box?.class, box?.name];
    for (const field of fields) {
      const code = normalizeAlarmCode(field);
      if (!code || PPE_GENERIC_CODES.has(code)) continue;
      const mapped = ALARM_LABELS[code] || ALARM_LABELS[code.replace(/_/g, '')];
      if (mapped) {
        appendUnique(labels, mapped);
        break;
      }
    }
  });

  const descriptionText = [
    alarm?.description,
    alarm?.message,
    alarm?.msg,
    alarm?.alarm_content,
    alarm?.behavior,
  ].filter(Boolean).join(' ');
  DESCRIPTION_HINTS.forEach(([hint, label]) => {
    if (descriptionText.includes(hint)) appendUnique(labels, label);
  });
  return labels;
};

export const getAlarmDisplayType = (alarm: any) => {
  const rawType = alarm?.alarm_type ?? alarm?.behavior_code ?? alarm?.event_type ?? alarm?.type ?? alarm;
  const code = normalizeAlarmCode(rawType);
  if (PPE_GENERIC_CODES.has(code)) {
    const details = getPpeDetailLabels(alarm);
    return details.length ? details.join('、') : '防护用品穿戴异常';
  }
  return getAlarmDisplayLabel(rawType);
};

export const translateAlarmDisplayText = (value: unknown, alarm?: any) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const ppeDetails = alarm ? getPpeDetailLabels(alarm) : [];
  return text
    .replace(/\bppe_violation\b/gi, ppeDetails.length ? ppeDetails.join('、') : '防护用品穿戴异常')
    .replace(/\bnohelmet\b/gi, '未佩戴安全帽')
    .replace(/\bno_helmet\b/gi, '未佩戴安全帽')
    .replace(/\bhelmet_missing\b/gi, '未佩戴安全帽')
    .replace(/\bhelmetmissing\b/gi, '未佩戴安全帽')
    .replace(/\bnovest\b/gi, '未穿反光衣')
    .replace(/\bno_vest\b/gi, '未穿反光衣')
    .replace(/\breflective_vest_missing\b/gi, '未穿反光衣')
    .replace(/\breflectivevestmissing\b/gi, '未穿反光衣')
    .replace(/\bsmoking\b/gi, '吸烟')
    .replace(/\bphone\b/gi, '打电话')
    .replace(/\bfire\b/gi, '烟火')
    .replace(/\bflame\b/gi, '明火')
    .replace(/\bsmoke\b/gi, '发现烟雾')
    .replace(/\bunknown\b/gi, '未知异常')
    .trim();
};
