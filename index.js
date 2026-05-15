import express from "express";
import { createServer, get } from "node:http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const server = createServer(app);
const users = {};

const io = new Server(server, {
  cors: {
    origin: "*", // Astro origin
  },
});

io.on("connection", (socket) => {
  //connect
  socket.on("join", ({ role, nombre }) => {
    if (role === "client") {
      socket.join("clients");
      console.log("client connected, " + socket.id);
      users[socket.id] = {
        id: socket.id,
        nombre,
        x: 0.5,
        y: 0.5,
        color: "#ffffff",
      };

      io.to("admins").emit("user:connected", {
        id: socket.id,
        nombre,
      });

      io.to("admins").emit("users:init", users);
    }

    if (role === "admin") {
      socket.join("admins");
      console.log("admin connected, " + socket.id);
      // al entrar, recibe estado actual
      socket.emit("users:init", users);
    }
  });
  //disconect
  socket.on("disconnect", () => {
    console.log("a user disconnected, " + socket.id);
    //let nom = getSpecificPerson(socket.id);
    // if (nom === undefined) {
    //   console.log("user disconnected en undefined");
    // } else {
    io.emit("user:disconnected", socket.id);
    socket.broadcast.emit("user:remove", socket.id);
    console.log("user disconnected en " + socket.id);
    //}
  });

  // movimiento del cursor
  socket.on("cursor:move", (data) => {
    if (users[socket.id]) {
      users[socket.id].x = data.x;
      users[socket.id].y = data.y;
    }
    console.log("cursor:move", socket.id, data);
    io.emit("cursor:move", {
      id: socket.id,
      ...data,
    });
  });
});

server.listen(3000, () => {
  console.log("server running at http://localhost:3000");
});
