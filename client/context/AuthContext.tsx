import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

interface User {
  id: string;
  email: string | null;
  name: string | null;
  coupleId: string | null;
  partnerRole: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "build_together_auth_token";

async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(TOKEN_KEY);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function setToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

async function removeToken(): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = async () => {
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        return;
      }

      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/api/auth/session", apiUrl).toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        await removeToken();
        setUser(null);
      }
    } catch (error) {
      console.error("Session refresh error:", error);
      setUser(null);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      await refreshSession();
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const signInWithApple = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const fullName = credential.fullName
        ? `${credential.fullName.givenName || ""} ${credential.fullName.familyName || ""}`.trim()
        : null;

      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/api/auth/apple", apiUrl).toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appleId: credential.user,
          email: credential.email,
          fullName,
          identityToken: credential.identityToken,
        }),
      });

      if (!response.ok) {
        throw new Error("Authentication failed");
      }

      const data = await response.json();
      await setToken(data.token);
      setUser(data.user);
    } catch (error: any) {
      if (error.code === "ERR_REQUEST_CANCELED") {
        return;
      }
      console.error("Apple sign in error:", error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      const token = await getToken();
      if (token) {
        const apiUrl = getApiUrl();
        await fetch(new URL("/api/auth/logout", apiUrl).toString(), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      await removeToken();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signInWithApple,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
