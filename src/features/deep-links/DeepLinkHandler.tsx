import { useCallback, useEffect, useRef } from "react";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { parseDeepLink } from "../../lib/deepLink";

const isGuildPassDeepLinkUrl = (url: string) => {
  const normalized = url.trim().toLowerCase();

  return (
    normalized.startsWith("guildpass:") ||
    normalized.startsWith("https://guildpass.xyz") ||
    normalized.startsWith("http://guildpass.xyz")
  );
};

export function DeepLinkHandler() {
  const router = useRouter();
  const handledUrls = useRef(new Set<string>());

  const handleUrl = useCallback(
    (url: string | null | undefined) => {
      if (!url || !isGuildPassDeepLinkUrl(url) || handledUrls.current.has(url)) {
        return;
      }

      handledUrls.current.add(url);
      const result = parseDeepLink(url);

      if (result.valid) {
        router.replace({
          pathname: result.route.pathname,
          params: result.route.params,
        } as never);
        return;
      }

      router.replace({
        pathname: "/deep-link-error",
        params: { message: result.error },
      } as never);
    },
    [router],
  );

  useEffect(() => {
    let isMounted = true;

    void Linking.getInitialURL()
      .then((url) => {
        if (isMounted) {
          handleUrl(url);
        }
      })
      .catch(() => {
        // Ignore platform-level URL lookup failures; ordinary routing still works.
      });

    const subscription = Linking.addEventListener("url", ({ url }: { url: string }) => {
      handleUrl(url);
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [handleUrl]);

  return null;
}
