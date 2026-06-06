export const readStoredPermissions = (): string[] => {
  try {
    const auth = JSON.parse(localStorage.getItem('auth') || '{}');
    if (Array.isArray(auth.permissions)) {
      return auth.permissions.map(String);
    }
  } catch {
    // Ignore invalid local auth cache.
  }

  try {
    const permissions = JSON.parse(localStorage.getItem('permissions') || '[]');
    return Array.isArray(permissions) ? permissions.map(String) : [];
  } catch {
    return [];
  }
};

export const hasStoredPermission = (code: string, permissions = readStoredPermissions()) => {
  return permissions.includes(code);
};

export const hasAnyStoredPermission = (codes: string[], permissions = readStoredPermissions()) => {
  return codes.some(code => permissions.includes(code));
};
