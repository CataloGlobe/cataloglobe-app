import { useContext } from "react";
import { AuthContext } from "./AuthContextBase";
import type { AuthContextType } from "./AuthContextBase";

export const useAuth = () => useContext(AuthContext) as AuthContextType;
