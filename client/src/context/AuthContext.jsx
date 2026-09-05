import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    try {
      const s = sessionStorage.getItem('rzp_demo_auth');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });

  const login = (data) => {
    setAuth(data);
    sessionStorage.setItem('rzp_demo_auth', JSON.stringify(data));
  };

  const logout = () => {
    setAuth(null);
    sessionStorage.removeItem('rzp_demo_auth');
  };

  return <AuthContext.Provider value={{ auth, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
