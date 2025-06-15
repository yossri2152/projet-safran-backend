const mongoose = require("mongoose");

async function connectDB() {
  try {
    // Connexion avec la variable d'environnement MONGO_URI
    await mongoose.connect(process.env.MONGO_URI, {
      // options recommandées (sans useNewUrlParser ni useUnifiedTopology car dépréciés)
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log("✅ Connexion réussie à la base MongoDB !");
  } catch (err) {
    console.error("❌ Erreur de connexion :", err);
    process.exit(1);
  }
}

connectDB();
