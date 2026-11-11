import TcpSocket from "react-native-tcp-socket";

import type {
    MultiplayerMessageEvent,
    MultiplayerSocket,
} from "./local-multiplayer.types";

const PORT = 8765;
const SERVER_NAME = "Wild Paw: Bloom Wars";

type Player = {
  id: string;
  name: string;
  role: "host" | "guest";
  hero: string;
  skinId: string;
  skinColor: string;
  profilePicture: string;
  profileBorder: string;
  ready: boolean;
};

type LobbyRoom = {
  id: string;
  host: Player;
  players: Player[];
  clients: ClientConnection[];
  gameState?: unknown;
};

type ClientConnection = {
  socket: ReturnType<typeof TcpSocket.createConnection>;
  buffer: string;
  id?: string;
  name?: string;
  role?: "host" | "guest";
  roomId?: string;
  closed: boolean;
  send: (message: unknown) => void;
};

type IncomingMessage = {
  type?: string;
  role?: string;
  name?: string;
  hero?: string;
  skinId?: string;
  skinColor?: string;
  profilePicture?: string;
  profileBorder?: string;
  ready?: boolean;
  action?: string;
  direction?: unknown;
  grenadeRange?: number;
  input?: unknown;
  payload?: unknown;
};

const rooms = new Map<string, LobbyRoom>();
const connections = new Set<ClientConnection>();
let server: ReturnType<typeof TcpSocket.createServer> | null = null;
let serverStopTimer: ReturnType<typeof setTimeout> | null = null;

function send(client: ClientConnection, message: unknown) {
  client.send(message);
}

function createLobbyState() {
  return {
    type: "lobby-state",
    rooms: Array.from(rooms.values()).map((room) => ({
      id: room.id,
      host: room.host,
      players: room.players,
      status: room.players.length >= 2 ? "ready" : "waiting",
    })),
  };
}

function broadcastRoomState(room: LobbyRoom) {
  const payload = {
    type: "room-state",
    room: {
      id: room.id,
      host: room.host,
      players: room.players,
      gameState: room.gameState ?? null,
    },
  };

  for (const client of room.clients) {
    send(client, payload);
  }
}

function broadcastLobby() {
  const payload = JSON.stringify(createLobbyState());
  for (const room of rooms.values()) {
    for (const client of room.clients) {
      if (!client.closed) {
        client.socket.write(`${payload}\n`);
      }
    }
  }
}

function makePlayer(message: IncomingMessage, role: "host" | "guest"): Player {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: message.name || (role === "host" ? "Host" : "Player"),
    role,
    hero: typeof message.hero === "string" ? message.hero : "dog",
    skinId: typeof message.skinId === "string" ? message.skinId : "",
    skinColor:
      typeof message.skinColor === "string" ? message.skinColor : "#7dd3fc",
    profilePicture:
      typeof message.profilePicture === "string"
        ? message.profilePicture
        : "dog",
    profileBorder:
      typeof message.profileBorder === "string"
        ? message.profileBorder
        : "none",
    ready: role === "host",
  };
}

function handleMessage(client: ClientConnection, message: IncomingMessage) {
  if (message.type === "health") {
    send(client, {
      type: "health",
      name: SERVER_NAME,
      status: "online",
      rooms: createLobbyState().rooms,
    });
    return;
  }

  if (message.type === "register") {
    const role = message.role === "host" ? "host" : "guest";
    const player = makePlayer(message, role);
    client.id = player.id;
    client.name = player.name;
    client.role = player.role;

    if (role === "host") {
      const room: LobbyRoom = {
        id: `room-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        host: player,
        players: [player],
        clients: [client],
      };
      room.gameState = undefined;
      client.roomId = room.id;
      rooms.set(room.id, room);
      send(client, { type: "host-accepted", roomId: room.id });
      broadcastRoomState(room);
      broadcastLobby();
      return;
    }

    const room = Array.from(rooms.values()).find(
      (candidate) =>
        candidate.players.length < 2 &&
        candidate.players.some((existing) => existing.role === "host"),
    );
    if (!room) {
      send(client, {
        type: "error",
        message: "No host lobby is open on this device.",
      });
      client.socket.end();
      return;
    }

    room.clients.push(client);
    room.players.push(player);
    client.roomId = room.id;
    send(client, {
      type: "join-accepted",
      roomId: room.id,
      host: room.host,
      players: room.players,
    });
    broadcastRoomState(room);
    broadcastLobby();
    return;
  }

  if (!client.roomId) {
    return;
  }

  const room = rooms.get(client.roomId);
  if (!room) {
    return;
  }

  if (message.type === "ready") {
    room.players = room.players.map((player) =>
      player.id === client.id ? { ...player, ready: !!message.ready } : player,
    );
    broadcastRoomState(room);
    broadcastLobby();
    return;
  }

  if (message.type === "command") {
    for (const peer of room.clients) {
      if (peer !== client && !peer.closed) {
        send(peer, {
          type: "room-command",
          action: message.action,
          source: client.id,
        });
      }
    }
    return;
  }

  if (message.type === "input" && client.role === "guest") {
    for (const peer of room.clients) {
      if (peer.role === "host" && !peer.closed) {
        send(peer, {
          type: "remote-input",
          sourceRole: client.role,
          input: message.input,
        });
      }
    }
    return;
  }

  if (message.type === "action" && client.role === "guest") {
    for (const peer of room.clients) {
      if (peer.role === "host" && !peer.closed) {
        send(peer, {
          type: "player-action",
          sourceRole: client.role,
          action: message.action,
          direction: message.direction,
          grenadeRange: message.grenadeRange,
        });
      }
    }
    return;
  }

  if (message.type === "state") {
    room.gameState = message.payload ?? room.gameState;
    for (const peer of room.clients) {
      if (!peer.closed) {
        send(peer, {
          type: "peer-state",
          from: client.name,
          payload: message.payload,
        });
      }
    }
    broadcastRoomState(room);
    return;
  }

  if (message.type === "sync" && client.role === "host") {
    room.gameState = message.payload ?? room.gameState;
    for (const peer of room.clients) {
      if (peer !== client && !peer.closed) {
        send(peer, { type: "remote-sync", payload: room.gameState });
      }
    }
  }
}

function handleConnection(
  socket: ReturnType<typeof TcpSocket.createConnection>,
) {
  socket.setNoDelay();
  socket.setEncoding("utf8");
  const client: ClientConnection = {
    socket,
    buffer: "",
    closed: false,
    send(message) {
      if (!client.closed && !socket.destroyed) {
        socket.write(`${JSON.stringify(message)}\n`);
      }
    },
  };
  connections.add(client);

  const cleanup = () => {
    if (client.closed) {
      return;
    }
    client.closed = true;
    connections.delete(client);
    if (!client.roomId) {
      return;
    }

    const room = rooms.get(client.roomId);
    if (!room) {
      return;
    }
    room.clients = room.clients.filter((entry) => entry !== client);
    room.players = room.players.filter((player) => player.id !== client.id);
    if (room.players.length === 0) {
      rooms.delete(room.id);
      broadcastLobby();
      return;
    }
    if (room.host.id === client.id) {
      room.host = room.players[0];
    }
    room.gameState = room.players.length > 1 ? room.gameState : null;
    broadcastRoomState(room);
    broadcastLobby();
  };

  socket.on("data", (data) => {
    client.buffer += typeof data === "string" ? data : data.toString("utf8");
    let newlineIndex = client.buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = client.buffer.slice(0, newlineIndex).trim();
      client.buffer = client.buffer.slice(newlineIndex + 1);
      if (line) {
        try {
          handleMessage(client, JSON.parse(line) as IncomingMessage);
        } catch {
          send(client, { type: "error", message: "Invalid lobby message" });
        }
      }
      newlineIndex = client.buffer.indexOf("\n");
    }
  });
  socket.on("close", cleanup);
  socket.on("error", cleanup);
}

export function startLocalHostServer(): Promise<void> {
  if (serverStopTimer) {
    clearTimeout(serverStopTimer);
    serverStopTimer = null;
  }
  if (server?.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const candidate = TcpSocket.createServer(handleConnection);
    let settled = false;
    candidate.on("listening", () => {
      server = candidate;
      settled = true;
      resolve();
    });
    candidate.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    candidate.listen({ host: "0.0.0.0", port: PORT });
  });
}

export function stopLocalHostServer() {
  if (serverStopTimer) {
    clearTimeout(serverStopTimer);
  }
  serverStopTimer = setTimeout(() => {
    serverStopTimer = null;
    for (const client of connections) {
      client.closed = true;
      client.socket.destroy();
    }
    connections.clear();
    rooms.clear();
    server?.close();
    server = null;
  }, 500);
}

export function probeLocalServer(
  address: string,
  timeoutMs = 1800,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let buffer = "";
    const socket = TcpSocket.createConnection(
      { host: address, port: PORT, connectTimeout: timeoutMs },
      () => socket.write('{"type":"health"}\n'),
    );
    const timeout = setTimeout(() => finish(false), timeoutMs + 250);

    const finish = (isOnline: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      resolve(isOnline);
    };

    socket.setEncoding("utf8");
    socket.on("data", (data) => {
      buffer += typeof data === "string" ? data : data.toString("utf8");
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }
      try {
        const response = JSON.parse(buffer.slice(0, newlineIndex)) as {
          type?: string;
          status?: string;
        };
        finish(response.type === "health" && response.status === "online");
      } catch {
        finish(false);
      }
    });
    socket.on("error", () => finish(false));
    socket.on("close", () => finish(false));
  });
}

export function createMultiplayerSocket(address: string): MultiplayerSocket {
  let readyState = 0;
  const socket = TcpSocket.createConnection(
    { host: address, port: PORT, connectTimeout: 5000 },
    () => {
      readyState = 1;
      adapter.onopen?.();
    },
  );
  socket.setNoDelay();
  socket.setEncoding("utf8");
  let pendingData = "";
  const adapter: MultiplayerSocket = {
    get readyState() {
      return readyState;
    },
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send(data: string) {
      if (readyState === 1) {
        socket.write(`${data}\n`);
      }
    },
    close() {
      if (readyState < 2) {
        readyState = 2;
        socket.end();
      }
    },
  };

  socket.on("data", (data) => {
    pendingData += typeof data === "string" ? data : data.toString("utf8");
    let newlineIndex = pendingData.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = pendingData.slice(0, newlineIndex).trim();
      pendingData = pendingData.slice(newlineIndex + 1);
      if (line) {
        const event: MultiplayerMessageEvent = { data: line };
        adapter.onmessage?.(event);
      }
      newlineIndex = pendingData.indexOf("\n");
    }
  });
  socket.on("error", (error) => {
    adapter.onerror?.({ message: error.message });
    readyState = 3;
  });
  socket.on("close", () => {
    readyState = 3;
    adapter.onclose?.();
  });

  return adapter;
}
