import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { mutationQueue, QueueItem } from "./mutationQueue";

export type ApiDispatcher = (item: QueueItem) => Promise<void>;

/**
 * A default mock dispatcher. In a real app, this maps mutation types to their API calls.
 */
export const defaultDispatcher: ApiDispatcher = async (item: QueueItem) => {
  // Simulate network request
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // For testing, we can simulate a conflict by checking payload properties
      if (item.payload?.simulateConflict) {
        const error = new Error("Conflict with server state");
        (error as any).status = 409;
        reject(error);
      } else if (item.payload?.simulateNetworkError) {
        const error = new Error("Network error");
        (error as any).status = 0;
        reject(error);
      } else {
        resolve();
      }
    }, 300);
  });
};

class MutationReplayer {
  private unsubscribeNetInfo: (() => void) | null = null;
  private isReplaying: boolean = false;
  private dispatcher: ApiDispatcher = defaultDispatcher;

  public setDispatcher(dispatcher: ApiDispatcher) {
    this.dispatcher = dispatcher;
  }

  public start() {
    if (this.unsubscribeNetInfo) {
      return;
    }

    this.unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
      const isOnline = !!state.isConnected && state.isInternetReachable !== false;
      if (isOnline) {
        this.replayPending();
      }
    });
  }

  public stop() {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
  }

  public async replayPending() {
    if (this.isReplaying) return;
    this.isReplaying = true;

    try {
      const queue = await mutationQueue.getQueue();
      // Sort by createdAt just to be sure we are FIFO
      const pendingItems = queue
        .filter(i => i.status === "PENDING" || i.status === "FAILED")
        .sort((a, b) => a.createdAt - b.createdAt);

      for (const item of pendingItems) {
        // Re-check online status before processing each item
        const state = await NetInfo.fetch();
        const isOnline = !!state.isConnected && state.isInternetReachable !== false;
        
        if (!isOnline) {
          console.log("[MutationReplayer] Network lost, halting replay.");
          break;
        }

        await mutationQueue.updateStatus(item.id, "SYNCING");

        try {
          await this.dispatcher(item);
          // Success! Remove from queue.
          await mutationQueue.dequeue(item.id);
        } catch (error: any) {
          const status = error.status;
          
          if (status >= 400 && status < 500) {
            // Client error, likely validation or conflict. Mark as CONFLICT
            // and leave in the queue for manual user confirmation.
            await mutationQueue.updateStatus(item.id, "CONFLICT", error.message || "Conflict");
          } else {
            // Network or Server error. Mark as FAILED to retry later.
            await mutationQueue.updateStatus(item.id, "FAILED", error.message || "Network error");
            
            // If it's a network error, it's safer to stop the replay loop
            // to preserve FIFO order and wait for a stable connection.
            break;
          }
        }
      }
    } finally {
      this.isReplaying = false;
    }
  }
}

export const mutationReplayer = new MutationReplayer();
