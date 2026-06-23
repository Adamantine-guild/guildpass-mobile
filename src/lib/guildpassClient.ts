import { GuildPassClient } from "@guildpass/sdk";
import Constants from "expo-constants";

export const guildPassClient = new GuildPassClient({
  apiUrl: Constants.expoConfig?.extra?.apiUrl ?? "https://api.guildpass.xyz",
  chainId: Number(Constants.expoConfig?.extra?.chainId ?? 8453),
});
