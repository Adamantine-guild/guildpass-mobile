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
import { View, Text, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator } from "react-native";
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

    return () => { unsubscribe(); };
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

  const getStatusClasses = (status: string) => {
    switch (status) {
      case "PENDING":
        return "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400";
      case "SYNCING":
        return "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400";
      case "FAILED":
        return "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
      case "CONFLICT":
        return "bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400";
      default:
        return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    }
  };

  const renderItem = ({ item }: { item: QueueItem }) => {
    return (
      <View className="bg-white dark:bg-slate-800 p-4 rounded-lg mb-3 shadow-sm">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-base font-semibold text-text dark:text-slate-100">{item.type.replace(/_/g, " ")}</Text>
          <Text className={`px-2 py-1 rounded-full text-xs font-bold overflow-hidden ${getStatusClasses(item.status)}`}>{item.status}</Text>
        </View>
        <Text className="text-xs text-text-muted dark:text-slate-400 mb-2">{new Date(item.createdAt).toLocaleString()}</Text>
        
        {item.lastError && (
          <Text className="text-[13px] text-error dark:text-red-400 mb-2">Error: {item.lastError}</Text>
        )}

        {(item.status === "CONFLICT" || item.status === "FAILED") && (
          <View className="flex-row mt-2">
            <TouchableOpacity className="flex-1 py-2 rounded-md items-center bg-primary dark:bg-indigo-500 mr-2" onPress={() => handleRetryItem(item.id)}>
              <Text className="text-white font-semibold text-sm">Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity className="flex-1 py-2 rounded-md items-center bg-error dark:bg-red-500 ml-2" onPress={() => handleDiscard(item.id)}>
              <Text className="text-white font-semibold text-sm">Discard</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-slate-900">
      <View className="flex-row items-center p-4 bg-white dark:bg-slate-800 border-b border-border dark:border-slate-700">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-base text-primary dark:text-indigo-400">← Back</Text>
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
        <Text className="text-lg font-bold text-text dark:text-slate-100">Pending Changes</Text>
      </View>

      {queue.length === 0 ? (
        <View className="flex-1 justify-center items-center">
          <Text className="text-base text-text-muted dark:text-slate-400">No pending changes.</Text>
        </View>
      ) : (
        <FlatList
          data={queue}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
        />
      )}

      {queue.length > 0 && (
        <TouchableOpacity className="m-4 bg-success dark:bg-green-600 p-4 rounded-lg items-center" onPress={handleRetryAll} disabled={isRefreshing}>
          {isRefreshing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white text-base font-bold">Retry All Pending</Text>
          )}
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}
