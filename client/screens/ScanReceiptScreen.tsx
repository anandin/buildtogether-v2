import React, { useState, useRef } from "react";
import { View, StyleSheet, Pressable, Image, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { PremiumGate } from "@/components/PremiumGate";
import { useTheme } from "@/hooks/useTheme";
import { useSubscription } from "@/context/SubscriptionContext";
import { apiRequest } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";

export default function ScanReceiptScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { isPremium } = useSubscription();
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isPremium) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Pressable 
          style={[styles.closeButton, { top: insets.top + Spacing.md }]} 
          onPress={() => navigation.goBack()}
        >
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
        <PremiumGate 
          feature="AI Receipt Scanner"
          description="Snap a photo and let AI automatically extract the amount, merchant, and category from your receipts"
        >
          <View />
        </PremiumGate>
      </View>
    );
  }

  const compressImage = async (uri: string): Promise<string> => {
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return manipulated.base64!;
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
      });
      if (photo) {
        setCapturedImage(photo.uri);
        const compressed = await compressImage(photo.uri);
        await processReceipt(compressed);
      }
    } catch (err) {
      setError("Failed to capture image");
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        setCapturedImage(result.assets[0].uri);
        const compressed = await compressImage(result.assets[0].uri);
        await processReceipt(compressed);
      }
    } catch (err) {
      setError("Failed to pick image");
    }
  };

  const processReceipt = async (base64Image: string) => {
    setProcessing(true);
    setError(null);

    try {
      const response = await apiRequest("POST", "/api/scan-receipt", {
        image: base64Image,
      });
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.replace("AddExpense", {
        prefilled: {
          amount: data.amount,
          merchant: data.merchant,
          description: data.description,
          category: data.category,
          suggestedSplit: data.suggestedSplit,
          lineItems: data.lineItems || [],
        },
      });
    } catch (err: any) {
      setError(err.message || "Failed to process receipt");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setProcessing(false);
    }
  };

  const handleRetry = () => {
    setCapturedImage(null);
    setError(null);
  };

  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    if (permission.status === "denied" && !permission.canAskAgain) {
      return (
        <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
          <View style={[styles.permissionIcon, { backgroundColor: theme.primary + "20" }]}>
            <Feather name="camera-off" size={48} color={theme.primary} />
          </View>
          <ThemedText type="h4" style={styles.permissionTitle}>
            Camera Access Required
          </ThemedText>
          <ThemedText
            type="body"
            style={[styles.permissionText, { color: theme.textSecondary }]}
          >
            Please enable camera access in Settings to scan receipts
          </ThemedText>
          {Platform.OS !== "web" ? (
            <Button
              onPress={async () => {
                try {
                  await Linking.openSettings();
                } catch (e) {}
              }}
              style={styles.permissionButton}
            >
              Open Settings
            </Button>
          ) : null}
          <Pressable onPress={handlePickImage} style={styles.galleryLink}>
            <ThemedText type="link">Or choose from gallery</ThemedText>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <View style={[styles.permissionIcon, { backgroundColor: theme.primary + "20" }]}>
          <Feather name="camera" size={48} color={theme.primary} />
        </View>
        <ThemedText type="h4" style={styles.permissionTitle}>
          Scan Your Receipts
        </ThemedText>
        <ThemedText
          type="body"
          style={[styles.permissionText, { color: theme.textSecondary }]}
        >
          Allow camera access to automatically extract expense details from receipts
        </ThemedText>
        <Button onPress={requestPermission} style={styles.permissionButton}>
          Enable Camera
        </Button>
        <Pressable onPress={handlePickImage} style={styles.galleryLink}>
          <ThemedText type="link">Or choose from gallery</ThemedText>
        </Pressable>
      </View>
    );
  }

  if (capturedImage) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <Image source={{ uri: capturedImage }} style={styles.previewImage} />
        {processing ? (
          <View style={styles.processingOverlay}>
            <View style={[styles.processingCard, { backgroundColor: theme.backgroundDefault }]}>
              <ActivityIndicator size="large" color={theme.primary} />
              <ThemedText type="heading" style={styles.processingText}>
                Analyzing receipt...
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                AI is extracting expense details
              </ThemedText>
            </View>
          </View>
        ) : null}
        {error ? (
          <View style={styles.processingOverlay}>
            <View style={[styles.processingCard, { backgroundColor: theme.backgroundDefault }]}>
              <Feather name="alert-circle" size={48} color={theme.error} />
              <ThemedText type="heading" style={styles.processingText}>
                Couldn't read receipt
              </ThemedText>
              <ThemedText
                type="small"
                style={{ color: theme.textSecondary, textAlign: "center" }}
              >
                {error}
              </ThemedText>
              <Button onPress={handleRetry} style={styles.retryButton}>
                Try Again
              </Button>
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
      >
        <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.topBar}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={styles.closeButton}
            >
              <Feather name="x" size={24} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>

          <View style={styles.instructions}>
            <ThemedText
              type="body"
              style={styles.instructionText}
            >
              Position the receipt within the frame
            </ThemedText>
          </View>

          <View style={styles.controls}>
            <Pressable onPress={handlePickImage} style={styles.galleryButton}>
              <Feather name="image" size={24} color="#FFFFFF" />
            </Pressable>
            <Pressable onPress={handleCapture} style={styles.captureButton}>
              <View style={styles.captureInner} />
            </Pressable>
            <View style={styles.placeholder} />
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-start",
    padding: Spacing.lg,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanFrame: {
    width: "80%",
    aspectRatio: 0.7,
    alignSelf: "center",
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderColor: "#FFFFFF",
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  instructions: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  instructionText: {
    color: "#FFFFFF",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: Spacing["3xl"],
    paddingBottom: Spacing["3xl"],
  },
  galleryButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: "#000000",
  },
  placeholder: {
    width: 48,
  },
  previewImage: {
    flex: 1,
    resizeMode: "contain",
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing["2xl"],
  },
  processingCard: {
    width: "100%",
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.xl,
    alignItems: "center",
  },
  processingText: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  retryButton: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing["3xl"],
  },
  permissionIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  permissionTitle: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  permissionText: {
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  permissionButton: {
    paddingHorizontal: Spacing["3xl"],
  },
  galleryLink: {
    marginTop: Spacing.lg,
  },
});
