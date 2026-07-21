import { useEffect, useState } from "react";

type Countdown = {
  remainingSeconds: number | null;
  label: string | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
};

const getRemainingSeconds = (expiresAt?: string): number | null => {
  if (!expiresAt) {
    return null;
  }

  const expirationTime = new Date(expiresAt).getTime();

  if (Number.isNaN(expirationTime)) {
    return null;
  }

  return Math.max(0, Math.ceil((expirationTime - Date.now()) / 1_000));
};

const formatCountdown = (remainingSeconds: number): string => {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return minutes > 0 ? `Expires in ${minutes}m ${seconds}s` : `Expires in ${seconds}s`;
};

export const useCountdown = (expiresAt?: string): Countdown => {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(() =>
    getRemainingSeconds(expiresAt),
  );

  useEffect(() => {
    const initialRemainingSeconds = getRemainingSeconds(expiresAt);
    setRemainingSeconds(initialRemainingSeconds);

    if (initialRemainingSeconds === null || initialRemainingSeconds === 0) {
      return;
    }

    const interval = setInterval(() => {
      const nextRemainingSeconds = getRemainingSeconds(expiresAt);

      setRemainingSeconds((currentRemainingSeconds) =>
        currentRemainingSeconds === nextRemainingSeconds
          ? currentRemainingSeconds
          : nextRemainingSeconds,
      );

      if (nextRemainingSeconds === 0) {
        clearInterval(interval);
      }
    }, 1_000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const isExpired = remainingSeconds === 0;

  return {
    remainingSeconds,
    label:
      remainingSeconds === null ? null : isExpired ? "Expired" : formatCountdown(remainingSeconds),
    isExpired,
    isExpiringSoon: remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds < 30,
  };
};
