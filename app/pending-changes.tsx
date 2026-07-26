import { View, Text, FlatList, TouchableOpacity, SafeAreaView, Alert } from "react-native";
import React from "react";
import { useMutationQueue, removeQueuedMutation, retryQueuedMutation } from "../src/features/offline/mutationQueue";
import { AppHeader } from "../src/components/AppHeader";

export default function PendingChangesScreen() {
  const queuedMutations = useMutationQueue();

  const handleRetry = (id: string) => {
    retryQueuedMutation(id);
  };

  const handleDiscard = (id: string) => {
    Alert.alert(
      "Discard Change?",
      "Are you sure you want to discard this pending change?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Discard", 
          style: "destructive",
          onPress: () => removeQueuedMutation(id)
        }
      ]
import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { mutationQueue, QueueItem } from "../src/lib/mutationQueue";
import { mutationReplayer } from "../src/lib/mutationReplayer";

export default function PendingChangesScreen() {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    // Initial load
    mutationQueue.load().then(setQueue);

    // Subscribe to queue changes
    const unsubscribe = mutationQueue.subscribe((updatedQueue) => {
      setQueue(updatedQueue);
    });

    return () => unsubscribe();
  }, []);

  const handleRetryAll = async () => {
    setIsRefreshing(true);
    await mutationReplayer.replayPending();
    setIsRefreshing(false);
  };

  const handleDiscard = async (id: string) => {
    await mutationQueue.dequeue(id);
  };

  const handleRetryItem = async (id: string) => {
    await mutationQueue.updateStatus(id, "PENDING");
    mutationReplayer.replayPending();
  };

  const renderItem = ({ item }: { item: QueueItem }) => {
    return (
      <View style={styles.itemContainer}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemType}>{item.type.replace(/_/g, " ")}</Text>
          <Text style={[styles.statusBadge, styles[`status_${item.status}`]]}>{item.status}</Text>
        </View>
        <Text style={styles.itemDate}>{new Date(item.createdAt).toLocaleString()}</Text>
        
        {item.lastError && (
          <Text style={styles.errorText}>Error: {item.lastError}</Text>
        )}

        {(item.status === "CONFLICT" || item.status === "FAILED") && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.button, styles.retryButton]} onPress={() => handleRetryItem(item.id)}>
              <Text style={styles.buttonText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.discardButton]} onPress={() => handleDiscard(item.id)}>
              <Text style={styles.buttonText}>Discard</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <AppHeader title="Pending Changes" showBack />
      
      {queuedMutations.length === 0 ? (
        <View className="flex-1 items-center justify-center p-8">
          <Text className="text-6xl mb-4">✨</Text>
          <Text className="text-xl font-bold text-text mb-2">All Caught Up!</Text>
          <Text className="text-text-muted text-center">
            You don't have any pending offline changes.
          </Text>
        </View>
      ) : (
        <FlatList
          data={queuedMutations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View className="bg-white rounded-xl p-4 mb-4 shadow-sm border border-border">
              <View className="flex-row justify-between items-start mb-2">
                <Text className="font-bold text-text flex-1">
                  {item.type.replace(/_/g, " ")}
                </Text>
                
                <View className={`px-2 py-1 rounded-md ${
                  item.status === 'syncing' ? 'bg-blue-100' :
                  item.status === 'pending' ? 'bg-orange-100' :
                  item.status === 'conflict' ? 'bg-red-100' :
                  'bg-gray-100'
                }`}>
                  <Text className={`text-xs font-bold ${
                    item.status === 'syncing' ? 'text-blue-700' :
                    item.status === 'pending' ? 'text-orange-700' :
                    item.status === 'conflict' ? 'text-red-700' :
                    'text-gray-700'
                  }`}>
                    {item.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              
              <Text className="text-xs text-text-muted mb-4">
                Queued: {new Date(item.createdAt).toLocaleString()}
              </Text>
              
              {(item.status === 'conflict' || item.status === 'failed') && (
                <View className="flex-row justify-end space-x-3 mt-2 border-t border-border pt-3">
                  <TouchableOpacity 
                    onPress={() => handleDiscard(item.id)}
                    className="px-4 py-2"
                  >
                    <Text className="text-red-500 font-bold">Discard</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    onPress={() => handleRetry(item.id)}
                    className="bg-primary px-4 py-2 rounded-lg"
                  >
                    <Text className="text-white font-bold">Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pending Changes</Text>
      </View>

      {queue.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No pending changes.</Text>
        </View>
      ) : (
        <FlatList
          data={queue}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      {queue.length > 0 && (
        <TouchableOpacity style={styles.syncAllButton} onPress={handleRetryAll} disabled={isRefreshing}>
          {isRefreshing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.syncAllText}>Retry All Pending</Text>
          )}
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  header: { flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  backButton: { marginRight: 16 },
  backButtonText: { fontSize: 16, color: "#2563eb" },
  title: { fontSize: 18, fontWeight: "bold" },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: 16, color: "#6b7280" },
  listContent: { padding: 16 },
  itemContainer: { backgroundColor: "#fff", padding: 16, borderRadius: 8, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  itemType: { fontSize: 16, fontWeight: "600", color: "#111827" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, fontSize: 12, fontWeight: "bold", overflow: "hidden" },
  status_PENDING: { backgroundColor: "#fef3c7", color: "#d97706" },
  status_SYNCING: { backgroundColor: "#dbeafe", color: "#2563eb" },
  status_FAILED: { backgroundColor: "#fee2e2", color: "#dc2626" },
  status_CONFLICT: { backgroundColor: "#fce7f3", color: "#db2777" },
  itemDate: { fontSize: 12, color: "#6b7280", marginBottom: 8 },
  errorText: { fontSize: 13, color: "#dc2626", marginBottom: 8 },
  actionRow: { flexDirection: "row", marginTop: 8 },
  button: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: "center" },
  retryButton: { backgroundColor: "#2563eb", marginRight: 8 },
  discardButton: { backgroundColor: "#ef4444", marginLeft: 8 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  syncAllButton: { margin: 16, backgroundColor: "#10b981", padding: 16, borderRadius: 8, alignItems: "center" },
  syncAllText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});
