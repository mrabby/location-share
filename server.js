import express from "express";
import http from "http";
import crypto from "crypto";
import { WebSocketServer } from "ws";
import url from "url";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

app.use(express.json());
app.use(express.static("public"));

// Ustvari nov ID sobe (povezavo za deljenje)
app.get("/new", (req, res) => {
  const id = crypto.randomBytes(8).toString("hex");
  res.json({ id });
});

// Shranjuj povezave po sobah
const rooms = new Map(); // roomId -> { senders:Set<ws>, viewers:Set<ws> }

wss.on("connection", (ws, req) => {
  const { query } = url.parse(req.url, true);
  const roomId = query.room;
  const role = query.role; // "sender" ali "viewer"

  if (!roomId || !role) {
    ws.close(1008, "Missing room or role");
    return;
  }

  if (!rooms.has(roomId)) {
    rooms.set(roomId, { senders: new Set(), viewers: new Set() });
  }
  const room = rooms.get(roomId);
  const bucket = role === "sender" ? room.senders : room.viewers;
  bucket.add(ws);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      // Pričakujemo {type: "loc", lat, lng, accuracy, ts}
      if (msg.type === "loc" && role === "sender") {
        // Pošlji vsem viewerjem v isti sobi
        const payload = JSON.stringify({ type: "loc", lat: msg.lat, lng: msg.lng, accuracy: msg.accuracy, ts: msg.ts });
        room.viewers.forEach((client) => {
          if (client.readyState === 1) client.send(payload);
        });
      }
    } catch (e) {
      // ignoriraj neveljaven JSON
    }
  });

  ws.on("close", () => {
    bucket.delete(ws);
    // Po potrebi počisti prazne sobe
    if (room.senders.size === 0 && room.viewers.size === 0) {
      rooms.delete(roomId);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server teče na http://localhost:${PORT}`);
});
