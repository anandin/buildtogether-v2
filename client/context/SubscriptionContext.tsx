import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import Purchases, { CustomerInfo, PurchasesPackage, PurchasesOffering } from "react-native-purchases";
import { Platform } from "react-native";

const REVENUECAT_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || "";
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || "";

const ENTITLEMENT_ID = "Build Together Pro";

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

  useEffect(() => {
    initializePurchases();
  }, []);

  const initializePurchases = async () => {
    try {
      const apiKey = Platform.OS === "ios" 
        ? REVENUECAT_API_KEY_IOS 
        : Platform.OS === "android" 
          ? REVENUECAT_API_KEY_ANDROID 
          : REVENUECAT_API_KEY_IOS;
      
      if (!apiKey) {
        console.log("RevenueCat API key not configured - running in preview mode");
        setIsPreviewMode(true);
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
    } finally {
      setIsLoading(false);
    }
  };

  const activatePreviewTrial = () => {
    setIsPremium(true);
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
      activatePreviewTrial();
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
