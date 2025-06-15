const express = require("express");
const bcrypt = require('bcryptjs');
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authController = require("../controllers/authController");
const { authenticateUser, verifyRole } = require("../middleware/authMiddleware");
const {resetPassword,verifyAndResetPassword,verifyEmail} = require ("../controllers/authController");
const router = express.Router();
const SECRET_KEY = process.env.JWT_SECRET || "secret"; // Clé secrète pour JWT
// 🔐 Inscription
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role = "user" } = req.body; // Valeur par défaut "user"

    // Validation de l'email
    if (!email || !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      return res.status(400).json({ message: "Veuillez fournir un email valide" });
    }

    // Validation du mot de passe
    if (!password || password.length < 6) {
      return res.status(400).json({ message: "Le mot de passe doit contenir au moins 6 caractères" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        message: "Email déjà utilisé",
        code: "EMAIL_EXISTS"
      });
    }

    const validRoles = ["admin", "user", "technicien"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        message: "Rôle invalide",
        code: "INVALID_ROLE",
        validRoles // Renvoyer les rôles valides pour référence
      });
    }

    // Création de l'utilisateur
    const newUser = new User({ 
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: password.trim(), // Le middleware pre-save hash le mot de passe
      role,
      approved: false, // Tous les nouveaux comptes non approuvés
      pending: true    // En attente d'approbation
    });

    await newUser.save();

    // Réponse détaillée
    res.status(201).json({ 
      success: true,
      message: "Inscription réussie! Votre compte est en attente d'approbation par un administrateur.",
      data: {
        userId: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        requiresApproval: true,
        approvalStatus: "pending"
      }
    });

  } catch (error) {
    console.error("Erreur d'inscription:", error);
    
    // Gestion des erreurs Mongoose
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: "Erreur de validation",
        errors 
      });
    }
    
    res.status(500).json({ 
      message: "Erreur lors de l'inscription",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 🔑 Connexion
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Nettoyage des entrées
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    
    console.log("📩 Tentative de connexion avec email:", cleanEmail);
    
    // Trouver l'utilisateur avec le mot de passe
    const user = await User.findOne({ email: cleanEmail }).select('+password');
    
    if (!user) {
      console.log("❌ Utilisateur non trouvé");
      return res.status(401).json({ 
        message: "Identifiants incorrects",
        code: "USER_NOT_FOUND"
      });
    }
    
    console.log("✅ Utilisateur trouvé - Statut approbation:", user.approved);
    
    // Vérification de l'approbation du compte
    if (!user.approved) {
      console.log("⚠ Compte non approuvé - ID:", user._id);
      return res.status(403).json({ 
        message: "Votre compte est en attente d'approbation par un administrateur",
        code: "ACCOUNT_PENDING",
        userId: user._id // Optionnel: pour faciliter le débogage
      });
    }
    
    // Vérification du mot de passe
    const isMatch = await user.comparePassword(cleanPassword);
    if (!isMatch) {
      console.log("❌ Mot de passe incorrect pour l'utilisateur:", user._id);
      return res.status(401).json({ 
        message: "Identifiants incorrects",
        code: "INVALID_PASSWORD"
      });
    }
    
    console.log("🔑 Authentification réussie pour:", user._id);
    
    // Génération du token JWT
    const token = jwt.sign(
      { 
        userId: user._id, 
        role: user.role,
        name: user.name,
        email: user.email
      },
      SECRET_KEY,
      { expiresIn: "2h" }
    );
    
    // Mise à jour de la dernière connexion
    user.lastLogin = new Date();
    await user.save();
    
    // Réponse réussie
    res.json({ 
      success: true,
      message: "Connexion réussie !", 
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin
      }
    });
    
  } catch (error) {
    console.error("❌ Erreur serveur lors de la connexion:", error);
    res.status(500).json({ 
      success: false,
      message: "Erreur lors de la connexion", 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 🔍 Accéder à son profil
router.get("/profile", authenticateUser, async (req, res) => {
try {
const user = await User.findById(req.user.userId).select("-password");
if (!user) return res.status(404).json({ message: "Utilisateur non trouvé"
});
res.json({ message: "Profil utilisateur", user });
} catch (error) {
res.status(500).json({ message: "Erreur serveur", error: error.message });
}
});
// 🔍 Accéder à la liste des utilisateurs (seulement les admins)
router.get("/", authenticateUser, verifyRole(["admin"]), async (req, res) => {
try {
const users = await User.find();
res.json(users);
} catch (err) {
res.status(500).json({ message: "Erreur lors de la récupération des utili￾sateurs." });
}
});


// Ajoutez ces nouvelles routes
router.post('/reset-password', authController.resetPassword);
router.post('/verify-and-reset-password', authController.verifyAndResetPassword);
router.post('/verify-email', authController.verifyEmail);
module.exports = router;