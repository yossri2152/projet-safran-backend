require("dotenv").config();

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Server } = require("socket.io");
const cron = require("node-cron");
const jwt = require("jsonwebtoken");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const { authenticateUser, cleanExpiredTokens } = require("./middleware/authMiddleware");

const app = express();
const server = http.createServer(app);

// 🔧 CORS config
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      "http://localhost:3000",
      "https://ornate-daffodil-0b486e.netlify.app"
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ✅ Si tu utilises des cookies ou proxy
app.set("trust proxy", 1);

// Middleware nettoyage tokens expirés
app.use(cleanExpiredTokens);

// Connexion MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log("✅ Connexion réussie à MongoDB !");
  } catch (err) {
    console.error("❌ Erreur MongoDB:", err);
    process.exit(1);
  }
}

async function updateLateTickets() {
  console.log("Mise à jour des tickets en retard (fonction à implémenter)...");
}

async function startServer() {
  await connectDB();

  const io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:3000",
        "https://ornate-daffodil-0b486e.netlify.app"
      ],
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error("Authentication error"));
      socket.user = decoded;
      next();
    });
  });

  io.on("connection", (socket) => {
    console.log(`📡 Nouvelle connexion WS: ${socket.id} (User ${socket.user.userId})`);
    socket.join(`user_${socket.user.userId}`);
    if (socket.user.role === "admin") {
      socket.join("admin_room");
    }

    socket.on("disconnect", (reason) => {
      console.log(`🔌 Déconnexion: ${socket.id} (User ${socket.user.userId}) (${reason})`);
    });

    socket.on("error", (err) => {
      console.error("❌ Erreur Socket:", err);
    });
  });

  app.use((req, res, next) => {
    req.io = io;
    next();
  });

  // ✅ Routes
  app.use("/auth", authRoutes);
  app.use("/users", userRoutes);

  // 404
  app.use((req, res) => {
    res.status(404).json({ message: "Route non trouvée" });
  });

  // Gestion erreurs
  app.use((err, req, res, next) => {
    console.error("❌ Erreur:", err.stack);
    res.status(500).json({ message: "Erreur interne du serveur" });
  });

  // CRON job
  cron.schedule("0 0 * * *", async () => {
    console.log("🔄 Mise à jour des tickets en retard...");
    try {
      await updateLateTickets();
      console.log("✅ Mise à jour terminée !");
      io.emit("tickets:updated", { message: "Tickets mis à jour" });
    } catch (error) {
      console.error("❌ Erreur CRON:", error);
      io.emit("tickets:error", { error: error.message });
    }
  });

  // Lancement serveur
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur lancé sur port ${PORT}`);
    if (io.engine.clientsCount === 0) {
      console.log("⚠ Aucun client Socket.io connecté");
    }
  });
}

startServer();

// Arrêt propre
process.on("SIGINT", () => {
  console.log("🛑 Arrêt du serveur...");
  mongoose.connection.close(false, () => {
    console.log("✅ MongoDB déconnecté");
    server.close(() => {
      console.log("✅ Serveur arrêté");
      process.exit(0);
    });
  });
});
