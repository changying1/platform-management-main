const textValue = (value: unknown) => String(value ?? '').trim();

type StoredAuth = Record<string, unknown>;

export type StoredScopeState = {
  isHeadquartersScope: boolean;
  isBranchScope: boolean;
  isProjectScope: boolean;
  projectId: string;
  projectName: string;
  projectValue: string;
  branchId: string;
  branchName: string;
  showCompanyFilter: boolean;
  showProjectFilter: boolean;
};

export const readStoredAuth = (): StoredAuth => {
  try {
    const parsed = JSON.parse(localStorage.getItem('auth') || '{}');
    return parsed && typeof parsed === 'object' ? parsed as StoredAuth : {};
  } catch {
    return {};
  }
};

export const getStoredPermissionLevel = (auth: StoredAuth = readStoredAuth()) =>
  textValue(localStorage.getItem('permission_level') || auth.permission_level).toLowerCase();

export const getStoredRole = (auth: StoredAuth = readStoredAuth()) =>
  textValue(localStorage.getItem('role') || auth.role).toLowerCase();

export const isHeadquartersScope = (auth: StoredAuth = readStoredAuth()) => {
  const permissionLevel = getStoredPermissionLevel(auth);
  const role = getStoredRole(auth);
  return (
    permissionLevel === 'headquarters_admin' ||
    role === 'hq' ||
    role === 'admin' ||
    role === 'headquarters_admin'
  );
};

export const isBranchScope = (auth: StoredAuth = readStoredAuth()) => {
  const permissionLevel = getStoredPermissionLevel(auth);
  const role = getStoredRole(auth);
  return (
    permissionLevel === 'branch_admin' ||
    role === 'branch' ||
    role === 'branch_admin'
  );
};

export const isProjectScope = (auth: StoredAuth = readStoredAuth()) => {
  const permissionLevel = getStoredPermissionLevel(auth);
  const role = getStoredRole(auth);
  const projectId = textValue(localStorage.getItem('project_id') || auth.project_id);
  const projectName = textValue(localStorage.getItem('project') || auth.project);
  const higherScope = isHeadquartersScope(auth) || isBranchScope(auth);

  return (
    permissionLevel === 'project_safety_admin' ||
    permissionLevel === 'project_admin' ||
    role === 'project' ||
    role === 'project_safety_admin' ||
    role === 'project_admin' ||
    (!higherScope && Boolean(projectId || projectName))
  );
};

export const getStoredScopeState = (auth: StoredAuth = readStoredAuth()): StoredScopeState => {
  const isHeadquarters = isHeadquartersScope(auth);
  const isBranch = isBranchScope(auth);
  const isProject = isProjectScope(auth);
  const projectId = textValue(localStorage.getItem('project_id') || auth.project_id);
  const projectName = textValue(
    localStorage.getItem('project') || auth.project || auth.project_name || auth.projectName
  );
  const branchId = textValue(
    localStorage.getItem('department_id') || auth.department_id || auth.branch_id
  );
  const branchName = textValue(
    localStorage.getItem('company') ||
    localStorage.getItem('branch') ||
    localStorage.getItem('department') ||
    localStorage.getItem('branch_name') ||
    localStorage.getItem('company_name') ||
    auth.company ||
    auth.branch ||
    auth.department ||
    auth.branch_name ||
    auth.company_name ||
    auth.department_name ||
    auth.branchName ||
    auth.companyName
  );

  return {
    isHeadquartersScope: isHeadquarters,
    isBranchScope: isBranch,
    isProjectScope: isProject,
    projectId,
    projectName,
    projectValue: projectName || projectId,
    branchId,
    branchName,
    showCompanyFilter: isHeadquarters,
    showProjectFilter: !isProject,
  };
};
