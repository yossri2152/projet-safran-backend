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

// Configuration CORS améliorée
const corsOptions = {
  origin: "http://localhost:3000",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 🔐 Middleware pour nettoyer les tokens expirés
app.use(cleanExpiredTokens);

// Middleware pour passer io aux routes (UNIQUEMENT UNE FOIS, placé ici pour que io soit défini avant)
let io;
(async () => {
  // Connexion MongoDB
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log("✅ Connexion réussie à MongoDB !");
  } catch (err) {
    console.error("❌ Erreur MongoDB:", err);
    process.exit(1);
  }

  // Configuration Socket.io
  io = new Server(server, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    },
  });

  // Middleware d'authentification pour Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error("Authentication error"));
      socket.user = decoded;
      next();
    });
  });

  // Gestion des connexions Socket.io avec authentification
  io.on("connection", (socket) => {
    console.log(`📡 Nouvelle connexion WebSocket: ${socket.id} (User ${socket.user.userId})`);

    // Rejoindre une salle pour l'utilisateur
    socket.join(`user_${socket.user.userId}`);

    // Rejoindre une salle admin si rôle admin
    if (socket.user.role === "admin") {
      socket.join("admin_room");
    }

    // Gestion des déconnexions
    socket.on("disconnect", (reason) => {
      console.log(`🔌 Déconnexion: ${socket.id} (User ${socket.user.userId}) (${reason})`);
    });

    // Gestion des erreurs
    socket.on("error", (err) => {
      console.error("❌ Erreur Socket:", err);
    });
  });

  // Middleware pour passer io aux routes (après création de io)
  app.use((req, res, next) => {
    req.io = io;
    next();
  });

  // Routes
  app.use("/auth", authRoutes);
  app.use("/users", userRoutes);

  // Middleware 404
  app.use((req, res, next) => {
    res.status(404).json({ message: "Route non trouvée" });
  });

  // Middleware global de gestion des erreurs
  app.use((err, req, res, next) => {
    console.error("❌ Erreur:", err.stack);
    res.status(500).json({ message: "Erreur interne du serveur" });
  });

  // Tâche CRON (exemple à adapter, n'oublie pas de définir updateLateTickets)
  cron.schedule("0 0 * * *", async () => {
    console.log("🔄 Mise à jour des tickets en retard...");
    try {
      await updateLateTickets(); // À définir/importer
      console.log("✅ Mise à jour terminée !");
      io.emit("tickets:updated", { message: "Tickets mis à jour" });
    } catch (error) {
      console.error("❌ Erreur CRON:", error);
      io.emit("tickets:error", { error: error.message });
    }
  });

  // Démarrer le serveur
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`🚀 Serveur sur http://localhost:${PORT}`);
    if (io.engine.clientsCount === 0) {
      console.log("⚠ Aucun client Socket.io connecté");
    }
  });
})();

// Gestion des arrêts propres
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
