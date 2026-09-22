export type UserRole = 'ADMIN' | 'REVIEWER' | 'GENERATOR';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  ssoProvider?: string;
  createdAt: string;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  organizationId: string;
}
