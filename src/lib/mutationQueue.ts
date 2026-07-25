import AsyncStorage from "@react-native-async-storage/async-storage";
import { createEncryptionService, EncryptionError } from "./encryptionService";
import { keyManager } from "./keyManager";
import { MutationType, isQueueable } from "./mutationTypes";

const MUTATION_QUEUE_STORAGE_KEY = "GUILDPASS_MUTATION_QUEUE";
const ENVELOPE_MAGIC = "gp1:mq:";

export type MutationStatus = "PENDING" | "SYNCING" | "FAILED" | "CONFLICT";

export interface QueueItem {
  id: string;
  type: MutationType;
  payload: any;
  createdAt: number;
  status: MutationStatus;
  retryCount: number;
  lastError?: string;
}

export interface EncryptedQueueEnvelope {
  v: string;
  n: string;
  t: string;
  c: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hexKeyToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes.buffer.slice(0);
}

class MutationQueueManager {
  private encryptionService = createEncryptionService();
  private queueCache: QueueItem[] | null = null;
  private savePromise: Promise<void> | null = null;
  private pendingSaves: boolean = false;
  private listeners: Set<(queue: QueueItem[]) => void> = new Set();

  public subscribe(listener: (queue: QueueItem[]) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    if (this.queueCache) {
      const copy = [...this.queueCache];
      this.listeners.forEach((l) => l(copy));
    }
  }

  private async loadKey(): Promise<ArrayBuffer | null> {
    try {
      const hexKey = await keyManager.getOrCreateKey();
      return hexKeyToArrayBuffer(hexKey);
    } catch (e) {
      console.warn("[MutationQueue] Failed to load key", e);
      return null;
    }
  }

  public async load(): Promise<QueueItem[]> {
    if (this.queueCache !== null) {
      return this.queueCache;
    }

    try {
      const stored = await AsyncStorage.getItem(MUTATION_QUEUE_STORAGE_KEY);
      if (!stored) {
        this.queueCache = [];
        this.notifyListeners();
        return this.queueCache;
      }

      const envelope = JSON.parse(stored) as Partial<EncryptedQueueEnvelope>;
      if (envelope.v !== ENVELOPE_MAGIC || !envelope.n || !envelope.t || !envelope.c) {
        this.queueCache = [];
        this.notifyListeners();
        return this.queueCache;
      }

      const keyBuffer = await this.loadKey();
      if (!keyBuffer) {
        // Fallback to empty if key is missing (in-memory mode)
        this.queueCache = [];
        this.notifyListeners();
        return this.queueCache;
      }

      const nonce = base64ToBytes(envelope.n);
      const authTag = base64ToBytes(envelope.t);
      const cipherBytes = base64ToBytes(envelope.c);
      const cipherBuffer = new ArrayBuffer(cipherBytes.length);
      new Uint8Array(cipherBuffer).set(cipherBytes);

      const { decrypted } = await this.encryptionService.decrypt<QueueItem[]>(
        cipherBuffer,
        nonce,
        authTag,
        keyBuffer
      );

      this.queueCache = Array.isArray(decrypted) ? decrypted : [];
    } catch (e) {
      console.error("[MutationQueue] Error loading queue", e);
      this.queueCache = [];
    }
    
    this.notifyListeners();
    return this.queueCache;
  }

  private async save(): Promise<void> {
    if (this.savePromise) {
      this.pendingSaves = true;
      return this.savePromise;
    }

    this.savePromise = (async () => {
      do {
        this.pendingSaves = false;
        try {
          if (!this.queueCache) continue;
          
          const keyBuffer = await this.loadKey();
          if (!keyBuffer) continue; // In-memory mode

          const plaintext = JSON.stringify(this.queueCache);
          const { encrypted, nonce, authTag } = await this.encryptionService.encrypt(
            plaintext,
            keyBuffer
          );

          const envelope: EncryptedQueueEnvelope = {
            v: ENVELOPE_MAGIC,
            n: bytesToBase64(nonce),
            t: bytesToBase64(authTag),
            c: bytesToBase64(new Uint8Array(encrypted)),
          };

          await AsyncStorage.setItem(MUTATION_QUEUE_STORAGE_KEY, JSON.stringify(envelope));
        } catch (e) {
          console.error("[MutationQueue] Error saving queue", e);
        }
      } while (this.pendingSaves);
    })();

    await this.savePromise;
    this.savePromise = null;
  }

  public async enqueue(type: MutationType, payload: any): Promise<QueueItem> {
    if (!isQueueable(type)) {
      throw new Error(`Mutation type ${type} is synchronous-only and cannot be queued offline.`);
    }

    const queue = await this.load();
    const item: QueueItem = {
      id: Math.random().toString(36).substring(2, 15), // Basic unique ID
      type,
      payload,
      createdAt: Date.now(),
      status: "PENDING",
      retryCount: 0,
    };
    
    queue.push(item);
    this.notifyListeners();
    await this.save();
    return item;
  }

  public async dequeue(id: string): Promise<void> {
    const queue = await this.load();
    const index = queue.findIndex(item => item.id === id);
    if (index !== -1) {
      queue.splice(index, 1);
      this.notifyListeners();
      await this.save();
    }
  }

  public async updateStatus(id: string, status: MutationStatus, errorMessage?: string): Promise<void> {
    const queue = await this.load();
    const item = queue.find(item => item.id === id);
    if (item) {
      item.status = status;
      if (status === "SYNCING" || status === "FAILED") {
        item.retryCount += 1;
      }
      if (errorMessage !== undefined) {
        item.lastError = errorMessage;
      }
      this.notifyListeners();
      await this.save();
    }
  }

  public async getQueue(): Promise<QueueItem[]> {
    return await this.load();
  }
}

export const mutationQueue = new MutationQueueManager();
