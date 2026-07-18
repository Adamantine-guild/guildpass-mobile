import AsyncStorage from "@react-native-async-storage/async-storage";
import { PERSISTED_QUERY_CACHE_KEY } from "./offlineCache";
import { createEncryptedAsyncStoragePersister } from "./encryptedPersister";
import { createEncryptionService } from "./encryptionService";
import { keyManager } from "./keyManager";

/**
 * TanStack Query persister for the offline cache. All persisted cache entries
 * are encrypted at rest with AES-GCM-256 using a device-bound key held in
 * `expo-secure-store`. See `src/lib/encryptedPersister.ts` and `SECURITY.md`
 * for the threat model and migration semantics.
 *
 * The exported `asyncStoragePersister` name is retained for compatibility with
 * callers (`app/_layout.tsx`, `src/lib/resetAppState.ts`).
 */
export const asyncStoragePersister = createEncryptedAsyncStoragePersister({
  storage: AsyncStorage,
  key: PERSISTED_QUERY_CACHE_KEY,
  throttleTime: 1000,
  encryptionService: createEncryptionService(),
  keyManager,
});
