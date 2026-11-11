export type MultiplayerMessageEvent = { data: string };

export interface MultiplayerSocket {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: MultiplayerMessageEvent) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}
