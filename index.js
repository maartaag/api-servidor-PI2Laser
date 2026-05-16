import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const server = createServer(app);

app.use(cors());

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const users = {};
const targets = {};

const MAX_TARGETS = 6;
const TICK_RATE = 1000 / 30;

let lastTick = Date.now();

io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  socket.on("join", ({ role, nombre }) => {
    if (role === "client") {
      socket.join("clients");

      users[socket.id] = {
        id: socket.id,
        nombre: nombre || `user-${socket.id.slice(0, 4)}`,
        score: 0,
        color: randomColor(),
      };

      console.log("client connected:", socket.id, users[socket.id].nombre);

      socket.emit("player:init", {
        id: socket.id,
        player: users[socket.id],
      });

      io.emit("players:update", Object.values(users));

      socket.emit("game:init", {
        targets: Object.values(targets),
        players: Object.values(users),
      });
    }

    if (role === "admin") {
      socket.join("admins");

      console.log("admin connected:", socket.id);

      socket.emit("game:init", {
        targets: Object.values(targets),
        players: Object.values(users),
      });
    }
  });

  // Posició del cursor / punter del jugador
  socket.on("player:aim", ({ x, y }) => {
    const player = users[socket.id];

    if (!player) return;

    const aim = {
      id: socket.id,
      nombre: player.nombre,
      color: player.color,
      x: clamp(x, 0, 1),
      y: clamp(y, 0, 1),
    };

    // S'envia a tothom excepte al mateix jugador
    socket.broadcast.emit("player:aim", aim);
  });

  // Dispar del jugador
  socket.on("player:shot", ({ x, y }) => {
    const player = users[socket.id];

    if (!player) return;

    const shot = {
      id: crypto.randomUUID(),
      userId: socket.id,
      playerName: player.nombre,
      playerColor: player.color,
      x: clamp(x, 0, 1),
      y: clamp(y, 0, 1),
      createdAt: Date.now(),
    };

    io.emit("player:shot", shot);

    const hitTarget = findHitTarget(shot.x, shot.y);

    if (hitTarget) {
      delete targets[hitTarget.id];

      player.score += 1;

      io.emit("target:hit", {
        targetId: hitTarget.id,
        shot,
        player,
      });

      io.emit("targets:update", Object.values(targets));
      io.emit("players:update", Object.values(users));
    }
  });

  socket.on("disconnect", () => {
    console.log("socket disconnected:", socket.id);

    if (users[socket.id]) {
      delete users[socket.id];

      io.emit("players:update", Object.values(users));

      // Avisem els altres clients perquè eliminin el cursor d'aquest jugador
      io.emit("player:left", socket.id);

      console.log("client removed:", socket.id);
    }
  });
});

function gameLoop() {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;

  updateTargets(dt);

  if (Object.keys(targets).length < MAX_TARGETS && Math.random() < 0.025) {
    spawnTarget();
  }

  io.emit("targets:update", Object.values(targets));
}

function spawnTarget() {
  const id = crypto.randomUUID();

  const fromLeft = Math.random() > 0.5;
  const radius = randomBetween(0.035, 0.075);
  const y = randomBetween(0.12, 0.88);
  const speed = randomBetween(0.12, 0.32);

  targets[id] = {
    id,
    x: fromLeft ? -radius : 1 + radius,
    y,
    radius,
    vx: fromLeft ? speed : -speed,
    vy: randomBetween(-0.08, 0.08),
    color: randomTargetColor(),
  };
}

function updateTargets(dt) {
  Object.values(targets).forEach((target) => {
    target.x += target.vx * dt;
    target.y += target.vy * dt;

    if (target.y < target.radius || target.y > 1 - target.radius) {
      target.vy *= -1;
    }

    const isOutLeft = target.x < -target.radius * 2;
    const isOutRight = target.x > 1 + target.radius * 2;

    if (isOutLeft || isOutRight) {
      delete targets[target.id];
    }
  });
}

function findHitTarget(x, y) {
  return Object.values(targets).find((target) => {
    const dx = x - target.x;
    const dy = y - target.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance <= target.radius;
  });
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomColor() {
  const colors = [
    "#ff004c",
    "#00ff88",
    "#00aaff",
    "#ffcc00",
    "#ff00ff",
    "#ffffff",
  ];

  return colors[Math.floor(Math.random() * colors.length)];
}

function randomTargetColor() {
  const colors = ["#ff004c", "#00ff88", "#00aaff", "#ffcc00", "#ff00ff"];

  return colors[Math.floor(Math.random() * colors.length)];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

setInterval(gameLoop, TICK_RATE);

server.listen(3000, () => {
  console.log("server running at http://localhost:3000");
});