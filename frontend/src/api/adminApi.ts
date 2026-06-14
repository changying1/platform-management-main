import axios from 'axios';
import { API_BASE_URL, attachAuthInterceptor } from './config';

const apiClient = attachAuthInterceptor(axios.create({
    baseURL: API_BASE_URL,
    timeout: 5000,
    headers: {
        'Content-Type': 'application/json',
    }
}));

// Matches UserOut and UserCreate from backend
export interface AdminUser {
    id: number; // Backend uses int
    username: string;
    full_name?: string | null;
    role: string;
    phone?: string | null;
    department?: string | null;
    parentId?: number | null; // Mapped from parent_id in backend if needed, or stick to backend naming
    parent_id?: number | null; // Backend field
    department_id?: number | null; // Backend field
}

export interface CreateUserDto {
    username: string;
    password: string;
    full_name?: string;
    role: string;
    phone?: string;
    department?: string;
    parent_id?: number | null;
    department_id?: number | null;
}

export const adminApi = {
    // Get all users (hierarchy flat list)
    getUsers: async () => {
        const response = await apiClient.get<AdminUser[]>('/admin/users');
        return response.data;
    },

    // Create new user
    createUser: async (data: CreateUserDto) => {
        const response = await apiClient.post<AdminUser>('/admin/users', data);
        return response.data;
    },

    // Update user
    updateUser: async (id: number, data: Partial<CreateUserDto>) => {
        const response = await apiClient.put<AdminUser>(`/admin/users/${id}`, data);
        return response.data;
    },

    // Delete user
    deleteUser: async (id: number) => {
        const response = await apiClient.delete<{ success: boolean }>(`/admin/users/${id}`);
        return response.data;
    },

    // Get hierarchy (subtree)
    getHierarchy: async (userId: number) => {
        const response = await apiClient.get<AdminUser[]>(`/admin/users/hierarchy/${userId}`);
        return response.data;
    }
};
