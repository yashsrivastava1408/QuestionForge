import React from 'react';
interface AuthUser {
    id: string;
    email: string;
    name: string;
    role: string;
}
interface AuthContextType {
    token: string | null;
    user: AuthUser | null;
    login: (email: string, password: string, orgSlug: string) => Promise<void>;
    logout: () => void;
}
export declare function AuthProvider({ children }: {
    children: React.ReactNode;
}): React.JSX.Element;
export declare function useAuth(): AuthContextType;
export {};
//# sourceMappingURL=AuthContext.d.ts.map