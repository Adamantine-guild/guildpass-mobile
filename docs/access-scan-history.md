# Access scan history

The recent access-check history shown on the scanner is intentionally memory-only.

- It is not stored in AsyncStorage, SQLite, query persistence, Zustand persistence, or any other long-lived storage layer.
- It is cleared automatically when the application process restarts.
- It can also be cleared manually from the scanner screen.
- The list is capped at 20 entries and evicts the oldest entry when a new one is added.
- Guild names are shown when available, while resource IDs are used as the visible resource-name fallback until a dedicated resource-name API exists.
- This design avoids persisting potentially sensitive access-check information beyond the current app session.
