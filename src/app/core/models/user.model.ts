export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  timezone: string;
  default_pairs: string[];
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
}

export interface UserRole {
  user_id: string;
  role_id: string;
  role?: Role;
}
