import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import Purchases, { CustomerInfo, PurchasesPackage, PurchasesOffering } from "react-native-purchases";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const REVENUECAT_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || "";
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || "";

const ENTITLEMENT_ID = "Build Together Pro";
const PREVIEW_TRIAL_KEY = "@preview_trial_active";
const PREVIEW_TRIAL_START_KEY = "@preview_trial_start";
const FREE_AI_CALLS_KEY = "@free_ai_calls";
const FREE_AI_CALLS_MONTH_KEY = "@free_ai_calls_month";
const FREE_AI_CALLS_LIMIT = 15;
const FREE_NUDGES_LIMIT = 3;
const IS_WEB = Platform.OS === "web";

interface SubscriptionContextType {
  isPremium: boolean;
  isLoading: boolean;
  isPreviewMode: boolean;
  currentOffering: PurchasesOffering | null;
  packages: {
    monthly: PurchasesPackage | null;
    annual: PurchasesPackage | null;
  };
  customerInfo: CustomerInfo | null;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  checkSubscriptionStatus: () => Promise<void>;
  activatePreviewTrial: () => void;
  getTrialInfo: () => { hasTrial: boolean; trialDays: number };
  freeAiCallsRemaining: number;
  canUseAi: boolean;
  trackAiCall: () => Promise<boolean>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

interface SubscriptionProviderProps {
  children: ReactNode;
}

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentOffering, setCurrentOffering] = useState<PurchasesOffering | null>(null);
  const [packages, setPackages] = useState<{ monthly: PurchasesPackage | null; annual: PurchasesPackage | null }>({
    monthly: null,
    annual: null,
  });
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [freeAiCallsUsed, setFreeAiCallsUsed] = useState(0);

  useEffect(() => {
    initializePurchases();
    loadFreeAiCalls();
  }, []);

  const loadFreeAiCalls = async () => {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // "2026-04"
      const storedMonth = await AsyncStorage.getItem(FREE_AI_CALLS_MONTH_KEY);
      if (storedMonth !== currentMonth) {
        // New month — reset counter
        await AsyncStorage.setItem(FREE_AI_CALLS_MONTH_KEY, currentMonth);
        await AsyncStorage.setItem(FREE_AI_CALLS_KEY, "0");
        setFreeAiCallsUsed(0);
      } else {
        const used = await AsyncStorage.getItem(FREE_AI_CALLS_KEY);
        setFreeAiCallsUsed(parseInt(used || "0", 10));
      }
    } catch (err) {
      console.error("Error loading free AI calls:", err);
    }
  };

  const trackAiCall = async (): Promise<boolean> => {
    if (isPremium) return true;
    const newCount = freeAiCallsUsed + 1;
    if (newCount > FREE_AI_CALLS_LIMIT) return false;
    setFreeAiCallsUsed(newCount);
    try {
      await AsyncStorage.setItem(FREE_AI_CALLS_KEY, String(newCount));
    } catch (err) {
      console.error("Error tracking AI call:", err);
    }
    return true;
  };

  const freeAiCallsRemaining = Math.max(FREE_AI_CALLS_LIMIT - freeAiCallsUsed, 0);
  const canUseAi = isPremium || freeAiCallsRemaining > 0;

  const checkPreviewTrial = async () => {
    if (IS_WEB) return false;
    try {
      const trialActive = await AsyncStorage.getItem(PREVIEW_TRIAL_KEY);
      const trialStart = await AsyncStorage.getItem(PREVIEW_TRIAL_START_KEY);
      
      if (trialActive === "true" && trialStart) {
        const startDate = new Date(trialStart);
        const now = new Date();
        const daysSinceStart = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceStart <= 14) {
          setIsPremium(true);
          return true;
        } else {
          await AsyncStorage.removeItem(PREVIEW_TRIAL_KEY);
          await AsyncStorage.removeItem(PREVIEW_TRIAL_START_KEY);
        }
      }
    } catch (err) {
      console.error("Error checking preview trial:", err);
    }
    return false;
  };

  const initializePurchases = async () => {
    try {
      const apiKey = Platform.OS === "ios" 
        ? REVENUECAT_API_KEY_IOS 
        : Platform.OS === "android" 
          ? REVENUECAT_API_KEY_ANDROID 
          : REVENUECAT_API_KEY_IOS;
      
      if (!apiKey || apiKey.startsWith("test_")) {
        console.log("RevenueCat running in preview mode");
        setIsPreviewMode(true);
        await checkPreviewTrial();
        setIsLoading(false);
        return;
      }

      await Purchases.configure({ apiKey });
      setIsConfigured(true);
      setIsPreviewMode(false);
      
      await Promise.all([
        checkSubscriptionStatusInternal(),
        loadOfferings(),
      ]);
    } catch (error) {
      console.error("Error initializing RevenueCat:", error);
      setIsPreviewMode(true);
      await checkPreviewTrial();
    } finally {
      setIsLoading(false);
    }
  };

  const activatePreviewTrial = async () => {
    if (IS_WEB) {
      return;
    }
    setIsPremium(true);
    try {
      await AsyncStorage.setItem(PREVIEW_TRIAL_KEY, "true");
      const existing = await AsyncStorage.getItem(PREVIEW_TRIAL_START_KEY);
      if (!existing) {
        await AsyncStorage.setItem(PREVIEW_TRIAL_START_KEY, new Date().toISOString());
      }
    } catch (err) {
      console.error("Error persisting preview trial:", err);
    }
  };

  const checkSubscriptionStatusInternal = async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
      
      const entitlement = info.entitlements.active[ENTITLEMENT_ID] 
        || info.entitlements.active["premium"]
        || info.entitlements.active["pro"];
      
      setIsPremium(entitlement !== undefined);
    } catch (error) {
      console.error("Error checking subscription status:", error);
    }
  };

  const checkSubscriptionStatus = async () => {
    if (!isConfigured) return;
    await checkSubscriptionStatusInternal();
  };

  const loadOfferings = async () => {
    try {
      const offerings = await Purchases.getOfferings();
      
      if (offerings.current) {
        setCurrentOffering(offerings.current);
        
        const monthlyPkg = offerings.current.availablePackages.find(
          pkg => pkg.packageType === "MONTHLY"
        ) || null;
        
        const annualPkg = offerings.current.availablePackages.find(
          pkg => pkg.packageType === "ANNUAL"
        ) || null;
        
        setPackages({
          monthly: monthlyPkg,
          annual: annualPkg,
        });
      }
    } catch (error) {
      console.error("Error loading offerings:", error);
    }
  };

  const purchasePackage = async (pkg: PurchasesPackage): Promise<boolean> => {
    if (!pkg) {
      console.error("No package provided");
      return false;
    }

    try {
      const { customerInfo: newInfo } = await Purchases.purchasePackage(pkg);
      setCustomerInfo(newInfo);
      
      const entitlement = newInfo.entitlements.active[ENTITLEMENT_ID]
        || newInfo.entitlements.active["premium"]
        || newInfo.entitlements.active["pro"];
      
      const isNowPremium = entitlement !== undefined;
      setIsPremium(isNowPremium);
      
      return isNowPremium;
    } catch (error: any) {
      if (error.userCancelled) {
        console.log("User cancelled purchase");
      } else {
        console.error("Error purchasing:", error);
      }
      return false;
    }
  };

  const restorePurchases = async (): Promise<boolean> => {
    if (isPreviewMode) {
      await activatePreviewTrial();
      return true;
    }
    
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      
      const entitlement = info.entitlements.active[ENTITLEMENT_ID]
        || info.entitlements.active["premium"]
        || info.entitlements.active["pro"];
      
      const isNowPremium = entitlement !== undefined;
      setIsPremium(isNowPremium);
      
      return isNowPremium;
    } catch (error) {
      console.error("Error restoring purchases:", error);
      return false;
    }
  };

  const getTrialInfo = () => {
    const pkg = packages.annual || packages.monthly;
    if (pkg?.product?.introPrice) {
      const intro = pkg.product.introPrice;
      if (intro.price === 0) {
        return {
          hasTrial: true,
          trialDays: intro.periodNumberOfUnits || 14,
        };
      }
    }
    return { hasTrial: true, trialDays: 14 };
  };

  return (
    <SubscriptionContext.Provider
      value={{
        isPremium,
        isLoading,
        isPreviewMode,
        currentOffering,
        packages,
        customerInfo,
        purchasePackage,
        restorePurchases,
        checkSubscriptionStatus,
        activatePreviewTrial,
        getTrialInfo,
        freeAiCallsRemaining,
        canUseAi,
        trackAiCall,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return context;
}
