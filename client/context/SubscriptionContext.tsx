import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import Purchases, { CustomerInfo, PurchasesPackage } from "react-native-purchases";
import { Platform } from "react-native";

const REVENUECAT_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || "";
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || "";

interface SubscriptionContextType {
  isPremium: boolean;
  isLoading: boolean;
  currentOffering: PurchasesPackage | null;
  customerInfo: CustomerInfo | null;
  purchasePremium: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  checkSubscriptionStatus: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

interface SubscriptionProviderProps {
  children: ReactNode;
}

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentOffering, setCurrentOffering] = useState<PurchasesPackage | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    initializePurchases();
  }, []);

  const initializePurchases = async () => {
    try {
      const apiKey = Platform.OS === "ios" ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
      
      if (!apiKey) {
        console.log("RevenueCat API key not configured - running in preview mode");
        setIsLoading(false);
        return;
      }

      await Purchases.configure({ apiKey });
      setIsConfigured(true);
      
      await checkSubscriptionStatus();
      await loadOfferings();
    } catch (error) {
      console.error("Error initializing RevenueCat:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkSubscriptionStatus = async () => {
    if (!isConfigured) return;
    
    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
      
      const premiumEntitlement = info.entitlements.active["premium"];
      setIsPremium(premiumEntitlement !== undefined);
    } catch (error) {
      console.error("Error checking subscription status:", error);
    }
  };

  const loadOfferings = async () => {
    if (!isConfigured) return;
    
    try {
      const offerings = await Purchases.getOfferings();
      
      if (offerings.current?.availablePackages.length) {
        const monthlyPackage = offerings.current.availablePackages.find(
          pkg => pkg.packageType === "MONTHLY"
        ) || offerings.current.availablePackages[0];
        
        setCurrentOffering(monthlyPackage);
      }
    } catch (error) {
      console.error("Error loading offerings:", error);
    }
  };

  const purchasePremium = async (): Promise<boolean> => {
    if (!currentOffering) {
      console.error("No offering available");
      return false;
    }

    try {
      const { customerInfo: newInfo } = await Purchases.purchasePackage(currentOffering);
      setCustomerInfo(newInfo);
      
      const premiumEntitlement = newInfo.entitlements.active["premium"];
      const isNowPremium = premiumEntitlement !== undefined;
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
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      
      const premiumEntitlement = info.entitlements.active["premium"];
      const isNowPremium = premiumEntitlement !== undefined;
      setIsPremium(isNowPremium);
      
      return isNowPremium;
    } catch (error) {
      console.error("Error restoring purchases:", error);
      return false;
    }
  };

  return (
    <SubscriptionContext.Provider
      value={{
        isPremium,
        isLoading,
        currentOffering,
        customerInfo,
        purchasePremium,
        restorePurchases,
        checkSubscriptionStatus,
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
