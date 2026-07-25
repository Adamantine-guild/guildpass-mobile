import { describe, it, expect, beforeEach, vi } from "vitest";
import { mutationQueue } from "../src/lib/mutationQueue";
import { MutationType } from "../src/lib/mutationTypes";
import AsyncStorage from "@react-native-async-storage/async-storage";

describe("MutationQueue", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    // Clear the in-memory cache of the singleton
    (mutationQueue as any).queueCache = null;
    vi.clearAllMocks();
  });

  it("should enqueue queueable mutations successfully", async () => {
    const item = await mutationQueue.enqueue(MutationType.UPDATE_PREFERENCES, { theme: "dark" });
    expect(item).toBeDefined();
    expect(item.id).toBeDefined();
    expect(item.type).toBe(MutationType.UPDATE_PREFERENCES);
    expect(item.status).toBe("PENDING");

    const queue = await mutationQueue.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(item.id);
  });

  it("should throw when trying to enqueue a synchronous-only mutation", async () => {
    await expect(
      mutationQueue.enqueue(MutationType.ACCESS_CHECK, { guildId: "123" })
    ).rejects.toThrow(/synchronous-only/);
    
    const queue = await mutationQueue.getQueue();
    expect(queue).toHaveLength(0);
  });

  it("should dequeue successfully", async () => {
    const item = await mutationQueue.enqueue(MutationType.UPDATE_PROFILE, { name: "Test" });
    let queue = await mutationQueue.getQueue();
    expect(queue).toHaveLength(1);

    await mutationQueue.dequeue(item.id);
    queue = await mutationQueue.getQueue();
    expect(queue).toHaveLength(0);
  });

  it("should update status successfully", async () => {
    const item = await mutationQueue.enqueue(MutationType.UPDATE_PROFILE, { name: "Test" });
    
    await mutationQueue.updateStatus(item.id, "SYNCING");
    let queue = await mutationQueue.getQueue();
    expect(queue[0].status).toBe("SYNCING");
    expect(queue[0].retryCount).toBe(1);

    await mutationQueue.updateStatus(item.id, "CONFLICT", "Validation failed");
    queue = await mutationQueue.getQueue();
    expect(queue[0].status).toBe("CONFLICT");
    expect(queue[0].lastError).toBe("Validation failed");
    // retry count shouldn't increment for CONFLICT in our implementation, only SYNCING and FAILED
    expect(queue[0].retryCount).toBe(1);
  });
});
