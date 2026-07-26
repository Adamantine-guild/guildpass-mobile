import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import React, { useEffect, useState } from "react";
import { AppHeader } from "../src/components/AppHeader";
import { mutationQueue, QueueItem } from "../src/lib/mutationQueue";
import { mutationReplayer } from "../src/lib/mutationReplayer";

const getStatusClasses = (status: QueueItem["status"]) => {
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

export default function PendingChangesScreen() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void mutationQueue.load().then((items) => {
      if (isMounted) {
        setQueue(items);
      }
    });

    const unsubscribe = mutationQueue.subscribe((updatedQueue) => {
      setQueue(updatedQueue);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handleRetryAll = async () => {
    setIsRefreshing(true);
    try {
      await mutationReplayer.replayPending();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDiscard = async (id: string) => {
    await mutationQueue.dequeue(id);
  };

  const handleRetryItem = async (id: string) => {
    await mutationQueue.updateStatus(id, "PENDING");
    await mutationReplayer.replayPending();
  };

  const renderItem = ({ item }: { item: QueueItem }) => (
    <View className="bg-white dark:bg-slate-800 p-4 rounded-lg mb-3 shadow-sm border border-border dark:border-slate-700">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-base font-semibold text-text dark:text-slate-100 flex-1 mr-3">
          {item.type.replace(/_/g, " ")}
        </Text>
        <Text
          className={`px-2 py-1 rounded-full text-xs font-bold overflow-hidden ${getStatusClasses(
            item.status,
          )}`}
        >
          {item.status}
        </Text>
      </View>
      <Text className="text-xs text-text-muted dark:text-slate-400 mb-2">
        Queued: {new Date(item.createdAt).toLocaleString()}
      </Text>

      {item.lastError ? (
        <Text className="text-[13px] text-error dark:text-red-400 mb-2">
          Error: {item.lastError}
        </Text>
      ) : null}

      {(item.status === "CONFLICT" || item.status === "FAILED") && (
        <View className="flex-row mt-2">
          <TouchableOpacity
            className="flex-1 py-2 rounded-md items-center bg-primary dark:bg-indigo-500 mr-2"
            onPress={() => {
              void handleRetryItem(item.id);
            }}
          >
            <Text className="text-white font-semibold text-sm">Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 py-2 rounded-md items-center bg-error dark:bg-red-500 ml-2"
            onPress={() => {
              void handleDiscard(item.id);
            }}
          >
            <Text className="text-white font-semibold text-sm">Discard</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-slate-900">
      <AppHeader title="Pending Changes" showBack />

      {queue.length === 0 ? (
        <View className="flex-1 justify-center items-center p-8">
          <Text className="text-base text-text-muted dark:text-slate-400">No pending changes.</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={queue}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16 }}
          />
          <TouchableOpacity
            className="m-4 bg-success dark:bg-green-600 p-4 rounded-lg items-center"
            onPress={() => {
              void handleRetryAll();
            }}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white text-base font-bold">Retry All Pending</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </SafeAreaView>
  );
}
