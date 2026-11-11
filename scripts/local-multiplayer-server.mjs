import http from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 8765);
const rooms = new Map();

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

function broadcastRoomState(room) {
  const payload = JSON.stringify({
    type: "room-state",
    room: {
      id: room.id,
      host: room.host,
      players: room.players,
      gameState: room.gameState ?? null,
    },
  });

  for (const client of room.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

function broadcastLobby() {
  const payload = JSON.stringify(createLobbyState());
  for (const room of rooms.values()) {
    for (const client of room.clients) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
  }
}

function getOrCreateRoomForHost(hostClient) {
  let room = Array.from(rooms.values()).find(
    (candidate) => candidate.host.id === hostClient.id,
  );

  if (!room) {
    room = {
      id: `room-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      host: { id: hostClient.id, name: hostClient.name, role: "host" },
      players: [{ id: hostClient.id, name: hostClient.name, role: "host" }],
      clients: [hostClient],
    };
    rooms.set(room.id, room);
  }

  return room;
}

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        name: "Wild Paw: Bloom Wars",
        app: "Wild Paw local lobby",
        status: "online",
        rooms: Array.from(rooms.values()).map((room) => ({
          id: room.id,
          host: room.host.name,
          players: room.players.length,
          status: room.players.length >= 2 ? "ready" : "waiting",
        })),
      }),
    );
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ ok: false, message: "Not found" }));
});

const wss = new WebSocketServer({ server });

wss.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log(
      `A Wild Paw multiplayer server is already using port ${PORT}. Keep using the existing server; stop it before starting another copy.`,
    );
    return;
  }

  console.error("Wild Paw multiplayer server error:", error);
});

wss.on("connection", (socket) => {
  socket.on("message", (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());

      if (message.type === "register") {
        const player = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: message.name || (message.role === "host" ? "Host" : "Player"),
          role: message.role === "host" ? "host" : "guest",
          hero: typeof message.hero === "string" ? message.hero : "cat",
          skinColor:
            typeof message.skinColor === "string"
              ? message.skinColor
              : "#7dd3fc",
          profilePicture:
            typeof message.profilePicture === "string"
              ? message.profilePicture
              : "dog",
          profileBorder:
            typeof message.profileBorder === "string"
              ? message.profileBorder
              : "none",
          ready: false,
        };

        socket.id = player.id;
        socket.name = player.name;
        socket.role = player.role;

        if (message.role === "host") {
          const room = getOrCreateRoomForHost(socket);
          room.host = {
            ...room.host,
            name: player.name,
            hero: player.hero,
            skinColor: player.skinColor,
            profilePicture: player.profilePicture,
            profileBorder: player.profileBorder,
          };
          room.players = [
            {
              id: socket.id,
              name: player.name,
              role: "host",
              hero: player.hero,
              skinColor: player.skinColor,
              profilePicture: player.profilePicture,
              profileBorder: player.profileBorder,
              ready: true,
            },
            ...room.players
              .filter((existing) => existing.id !== socket.id)
              .slice(0, 1),
          ];
          if (!room.clients.includes(socket)) {
            room.clients.push(socket);
          }
          socket.roomId = room.id;
          socket.send(
            JSON.stringify({ type: "host-accepted", roomId: room.id }),
          );
          broadcastRoomState(room);
          broadcastLobby();
          return;
        }

        let room = Array.from(rooms.values()).find(
          (candidate) => candidate.players.length < 2,
        );

        if (!room) {
          room = {
            id: `room-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            host: {
              id: `pending-${Date.now()}`,
              name: "Waiting host",
              role: "host",
            },
            players: [],
            clients: [],
          };
          rooms.set(room.id, room);
        }

        room.clients.push(socket);
        room.players.push({
          id: socket.id,
          name: player.name,
          role: "guest",
          hero: player.hero,
          skinColor: player.skinColor,
          profilePicture: player.profilePicture,
          profileBorder: player.profileBorder,
          ready: false,
        });
        socket.roomId = room.id;

        if (room.host.id.startsWith("pending-")) {
          room.host = {
            id: room.players[0]?.id ?? socket.id,
            name: room.players[0]?.name ?? player.name,
            role: "host",
          };
        }

        socket.send(
          JSON.stringify({
            type: "join-accepted",
            roomId: room.id,
            host: room.host,
            players: room.players,
          }),
        );

        broadcastRoomState(room);

        broadcastLobby();
        return;
      }

      if (message.type === "ready" && socket.roomId) {
        const room = rooms.get(socket.roomId);
        if (!room) {
          return;
        }

        room.players = room.players.map((player) =>
          player.id === socket.id
            ? { ...player, ready: !!message.ready }
            : player,
        );

        broadcastRoomState(room);
        broadcastLobby();
        return;
      }

      if (message.type === "command" && socket.roomId) {
        const room = rooms.get(socket.roomId);
        if (!room) {
          return;
        }

        const payload = JSON.stringify({
          type: "room-command",
          action: message.action,
          source: socket.id,
        });

        for (const client of room.clients) {
          if (client !== socket && client.readyState === 1) {
            client.send(payload);
          }
        }

        return;
      }

      if (message.type === "input" && socket.roomId) {
        const room = rooms.get(socket.roomId);
        if (!room || socket.role !== "guest") {
          return;
        }

        for (const client of room.clients) {
          if (client.role === "host" && client.readyState === 1) {
            client.send(
              JSON.stringify({
                type: "remote-input",
                sourceRole: socket.role,
                input: message.input,
              }),
            );
          }
        }
        return;
      }

      if (message.type === "action" && socket.roomId) {
        const room = rooms.get(socket.roomId);
        if (!room || socket.role !== "guest") {
          return;
        }

        for (const client of room.clients) {
          if (client.role === "host" && client.readyState === 1) {
            client.send(
              JSON.stringify({
                type: "player-action",
                sourceRole: socket.role,
                action: message.action,
                direction: message.direction,
                grenadeRange: message.grenadeRange,
              }),
            );
          }
        }
        return;
      }

      if (message.type === "state" && socket.roomId) {
        const room = rooms.get(socket.roomId);
        if (!room) {
          return;
        }

        room.gameState = message.payload ?? room.gameState;

        for (const client of room.clients) {
          if (client.readyState === 1) {
            client.send(
              JSON.stringify({
                type: "peer-state",
                from: socket.name,
                payload: message.payload,
              }),
            );
          }
        }

        broadcastRoomState(room);
        return;
      }

      if (message.type === "sync" && socket.roomId) {
        const room = rooms.get(socket.roomId);
        if (!room) {
          return;
        }

        room.gameState = message.payload ?? room.gameState;

        for (const client of room.clients) {
          if (client !== socket && client.readyState === 1) {
            client.send(
              JSON.stringify({
                type: "remote-sync",
                payload: room.gameState,
              }),
            );
          }
        }
        return;
      }
    } catch {
      socket.send(
        JSON.stringify({ type: "error", message: "Invalid lobby message" }),
      );
    }
  });

  socket.on("close", () => {
    const roomId = socket.roomId;
    if (!roomId) {
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      return;
    }

    room.clients = room.clients.filter((client) => client !== socket);
    room.players = room.players.filter((player) => player.id !== socket.id);

    if (room.players.length === 0) {
      rooms.delete(roomId);
      return;
    }

    if (room.host.id === socket.id) {
      room.host = room.players[0];
    }

    room.gameState = room.players.length > 1 ? room.gameState : null;

    broadcastLobby();
  });
});

server.listen(PORT, () => {
  console.log(`Wild Paw local multiplayer server listening on port ${PORT}`);
});
