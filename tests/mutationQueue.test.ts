import AsyncStorage from "@react-native-async-storage/async-storage";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mutationQueue } from "../src/lib/mutationQueue";
import { MutationType } from "../src/lib/mutationTypes";

describe("MutationQueue", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    (mutationQueue as unknown as { queueCache: null }).queueCache = null;
    vi.clearAllMocks();
  });

  it("enqueues queueable mutations successfully", async () => {
    const item = await mutationQueue.enqueue(MutationType.UPDATE_PREFERENCES, { theme: "dark" });

    expect(item).toBeDefined();
    expect(item.id).toBeDefined();
    expect(item.type).toBe(MutationType.UPDATE_PREFERENCES);
    expect(item.status).toBe("PENDING");

    const queue = await mutationQueue.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(item.id);
  });

  it("throws when trying to enqueue a synchronous-only mutation", async () => {
    await expect(
      mutationQueue.enqueue(MutationType.ACCESS_CHECK, { guildId: "123" }),
    ).rejects.toThrow(/synchronous-only/);

    const queue = await mutationQueue.getQueue();
    expect(queue).toHaveLength(0);
  });

  it("dequeues successfully", async () => {
    const item = await mutationQueue.enqueue(MutationType.UPDATE_PROFILE, { name: "Test" });
    let queue = await mutationQueue.getQueue();
    expect(queue).toHaveLength(1);

    await mutationQueue.dequeue(item.id);
    queue = await mutationQueue.getQueue();
    expect(queue).toHaveLength(0);
  });

  it("updates status successfully", async () => {
    const item = await mutationQueue.enqueue(MutationType.UPDATE_PROFILE, { name: "Test" });

    await mutationQueue.updateStatus(item.id, "SYNCING");
    let queue = await mutationQueue.getQueue();
    expect(queue[0].status).toBe("SYNCING");
    expect(queue[0].retryCount).toBe(1);

    await mutationQueue.updateStatus(item.id, "CONFLICT", "Validation failed");
    queue = await mutationQueue.getQueue();
    expect(queue[0].status).toBe("CONFLICT");
    expect(queue[0].lastError).toBe("Validation failed");
    expect(queue[0].retryCount).toBe(1);
  });
});
