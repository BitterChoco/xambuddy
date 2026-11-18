import type { MultiplayerSocket } from "./local-multiplayer.types";

export async function startLocalHostServer(): Promise<void> {
  throw new Error("Phone hosting requires the installed Android or iOS app.");
}

export function stopLocalHostServer() {}

export function getLastProbeError() {
  return "";
}

export async function probeLocalServer(
  address: string,
  timeoutMs = 1800,
  attempts = 2,
): Promise<boolean> {
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`http://${address}:8765/health`, {
        signal: controller.signal,
      });
      if (response.ok) return true;
    } catch {
      // Retry until the requested attempt count is exhausted.
    } finally {
      clearTimeout(timeout);
    }
  }

  return false;
}

export function createMultiplayerSocket(address: string): MultiplayerSocket {
  return new WebSocket(`ws://${address}:8765`) as unknown as MultiplayerSocket;
}
