import { describe, it, expect, beforeEach, vi } from "vitest";
import { mutationReplayer, ApiDispatcher } from "../src/lib/mutationReplayer";
import { mutationQueue } from "../src/lib/mutationQueue";
import { MutationType } from "../src/lib/mutationTypes";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

vi.mock("@react-native-community/netinfo", () => ({
  default: {
    addEventListener: vi.fn(),
    fetch: vi.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  },
}));

describe("MutationReplayer", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    (mutationQueue as any).queueCache = null;
    vi.clearAllMocks();
  });

  it("should replay pending items successfully and dequeue them", async () => {
    await mutationQueue.enqueue(MutationType.UPDATE_PREFERENCES, { theme: "dark" });
    let queue = await mutationQueue.getQueue();
    expect(queue).toHaveLength(1);

    const mockDispatcher = vi.fn().mockResolvedValue(undefined);
    mutationReplayer.setDispatcher(mockDispatcher);

    await mutationReplayer.replayPending();

    expect(mockDispatcher).toHaveBeenCalledTimes(1);
    
    queue = await mutationQueue.getQueue();
    expect(queue).toHaveLength(0); // Dequeued upon success
  });

  it("should mark items as CONFLICT if dispatcher rejects with a client error", async () => {
    const item = await mutationQueue.enqueue(MutationType.UPDATE_PROFILE, { name: "Test" });
    
    const mockDispatcher = vi.fn().mockRejectedValue({ status: 409, message: "Conflict error" });
    mutationReplayer.setDispatcher(mockDispatcher);

    await mutationReplayer.replayPending();

    expect(mockDispatcher).toHaveBeenCalledTimes(1);
    
    const queue = await mutationQueue.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe("CONFLICT");
    expect(queue[0].lastError).toBe("Conflict error");
  });

  it("should mark items as FAILED if dispatcher rejects with a server/network error and halt", async () => {
    const item1 = await mutationQueue.enqueue(MutationType.UPDATE_PROFILE, { name: "Test 1" });
    const item2 = await mutationQueue.enqueue(MutationType.UPDATE_PREFERENCES, { theme: "light" });
    
    const mockDispatcher = vi.fn().mockRejectedValue({ status: 500, message: "Server error" });
    mutationReplayer.setDispatcher(mockDispatcher);

    await mutationReplayer.replayPending();

    // Should halt after first failure
    expect(mockDispatcher).toHaveBeenCalledTimes(1);
    
    const queue = await mutationQueue.getQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0].status).toBe("FAILED");
    expect(queue[0].lastError).toBe("Server error");
    expect(queue[1].status).toBe("PENDING"); // Unprocessed
  });
});
