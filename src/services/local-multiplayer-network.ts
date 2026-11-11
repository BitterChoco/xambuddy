import type { MultiplayerSocket } from "./local-multiplayer.types";

export async function startLocalHostServer(): Promise<void> {
  throw new Error("Phone hosting requires the installed Android or iOS app.");
}

export function stopLocalHostServer() {}

export async function probeLocalServer(
  address: string,
  timeoutMs = 1800,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${address}:8765/health`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function createMultiplayerSocket(address: string): MultiplayerSocket {
  return new WebSocket(`ws://${address}:8765`) as unknown as MultiplayerSocket;
}
