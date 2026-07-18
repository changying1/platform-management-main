import { API_BASE_URL, getAuthHeaders } from './config';

export type RegistrationStatus =
  | 'pending'
  | 'success'
  | 'failed'
  | 'skipped';

export interface CameraRegistrationRequest {
  name: string;
  device_serial: string;
  camera_password: string;
  sim_card_id?: string;
  channel_no?: number;

  device_type?: string;
  status?: string;
  remark?: string;
  location?: string;

  company?: string;
  branch_id?: string;
  project?: string;
  project_id?: string;
  grid?: string;
  grid_id?: string;
  team?: string;
  team_id?: string;

  username?: string;
}

export interface RegistrationStepResult {
  status: RegistrationStatus;
  success: boolean;
  message: string;
}

export interface CameraRegistrationResponse {
  success: boolean;
  partial_success: boolean;
  video_id?: number | string;

  local: RegistrationStepResult;
  ezviz: RegistrationStepResult;
  hikiot: RegistrationStepResult;
}

const parseErrorBody = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export async function createAndRegisterCamera(
  payload: CameraRegistrationRequest,
): Promise<CameraRegistrationResponse> {
  const response = await fetch(`${API_BASE_URL}/device-registration/cameras`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await parseErrorBody(response);
  const structured = data?.detail?.local ? data.detail : data;

  if (!response.ok) {
    if (structured?.local) {
      throw Object.assign(new Error(structured.local.message || '摄像头保存失败'), {
        response: structured,
      });
    }
    const detail = data?.detail;
    const message = typeof detail === 'string'
      ? detail
      : detail?.message || data?.message || `请求失败：${response.status}`;
    throw new Error(message);
  }

  return structured as CameraRegistrationResponse;
}
