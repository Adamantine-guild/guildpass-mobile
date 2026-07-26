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
