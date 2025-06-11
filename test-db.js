const mongoose = require("mongoose");

const MONGO_URI = "mongodb://localhost:27017/gestionTickets"; // Remplace si besoin

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connexion réussie à gestionTickets !");
  } catch (err) {
    console.error("❌ Erreur de connexion :", err);
    process.exit(1);
  }
}

connectDB();
