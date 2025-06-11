const express = require("express");
const bcrypt = require("bcrypt");
const {
  authenticateUser,
  verifyRole,
  strictAdminCheck,
  debugUserUpdate
} = require("../middleware/authMiddleware");
const User = require("../models/User");

const router = express.Router();

/**
 * 📌 Créer un utilisateur
 * Par défaut, les utilisateurs non-admins doivent être approuvés manuellement.
 */
router.post("/", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Cet email est déjà utilisé !" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const approved = role === "admin";
    const pending = !approved;

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role,
      approved,
      pending
    });

    await newUser.save();

    res.status(201).json({
      message: approved
        ? "Utilisateur admin créé avec succès"
        : "Utilisateur créé, en attente d'approbation",
      user: newUser
    });
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
});

// Route pour approuver un utilisateur
router.patch("/:id/approve", authenticateUser, verifyRole(["admin"]), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { 
        approved: true,
        pending: false
      },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    // Envoyer une notification ou email à l'utilisateur
    // (implémentation optionnelle)

    res.json({ 
      message: "Utilisateur approuvé avec succès",
      user 
    });
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
});

// Route pour rejeter un utilisateur
router.patch("/:id/reject", authenticateUser, verifyRole(["admin"]), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { 
        approved: false,
        pending: false
      },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.json({ 
      message: "Demande d'utilisateur rejetée",
      user 
    });
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
});

// Route pour lister les utilisateurs en attente
router.get("/pending", authenticateUser, verifyRole(["admin"]), async (req, res) => {
  try {
    const pendingUsers = await User.find({ 
      pending: true,
      approved: false
    }).select("-password");

    res.json({
      success: true,
      count: pendingUsers.length,
      data: pendingUsers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
      error: error.message
    });
  }
});

/**
 * 📌 Accéder à son propre profil
 */
router.get("/profile", authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });

    res.json({ message: "Profil utilisateur", user });
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
});

/**
 * 📌 Liste de tous les utilisateurs (admin uniquement)
 */
// Route pour obtenir tous les utilisateurs
router.get("/", authenticateUser, verifyRole(["admin"]), async (req, res) => {
  try {
    const users = await User.find().select("-password -__v").lean();
    res.json({
      success: true,
      count: users.length,
      data: users // Toujours retourner les données dans une propriété 'data'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Erreur serveur", 
      error: error.message 
    });
  }
});




/**
 * 📌 Récupérer un utilisateur par ID (admin uniquement)
 */
router.get("/:id", authenticateUser, verifyRole(["admin"]), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
});

/**
 * 📌 Modifier un utilisateur (soi-même ou admin)
 */
router.put("/:id", authenticateUser, debugUserUpdate, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const requestingUserId = req.user.userId;
    const targetUserId = req.params.id;

    // Logs de débogage
    console.log('\n=== USER UPDATE REQUEST ===');
    console.log('Requesting User:', {
      id: requestingUserId,
      role: req.user.role,
      isAdmin: req.user.role === 'admin'
    });
    console.log('Target User ID:', targetUserId);
    console.log('Update Data:', { name, email, role: !!role });

    // Vérification des autorisations
    const isSelfUpdate = requestingUserId === targetUserId;
    const isAdmin = req.user.role === 'admin';
    
    if (!isAdmin && !isSelfUpdate) {
      console.log('FAIL: Unauthorized update attempt');
      return res.status(403).json({ 
        message: "Action non autorisée",
        code: "UNAUTHORIZED_UPDATE_ATTEMPT"
      });
    }

    // Protection contre l'élévation de privilèges
    if (role && !isAdmin) {
      console.log('FAIL: Role modification attempt by non-admin');
      return res.status(403).json({ 
        message: "Seuls les administrateurs peuvent modifier les rôles",
        code: "ROLE_MODIFICATION_FORBIDDEN"
      });
    }

    // Validation des données
    if (password && password.length < 6) {
      return res.status(400).json({ 
        message: "Le mot de passe doit contenir au moins 6 caractères",
        code: "PASSWORD_TOO_SHORT"
      });
    }

    // Récupération de l'utilisateur existant
    const userToUpdate = await User.findById(targetUserId);
    if (!userToUpdate) {
      console.log('FAIL: User not found');
      return res.status(404).json({ 
        message: "Utilisateur introuvable",
        code: "USER_NOT_FOUND"
      });
    }

    // Mise à jour des champs
    userToUpdate.name = name || userToUpdate.name;
    userToUpdate.email = email || userToUpdate.email;
    
    if (isAdmin && role) {
      userToUpdate.role = role;
    }

    // Hashage du mot de passe si fourni
    if (password) {
      const salt = await bcrypt.genSalt(10);
      userToUpdate.password = await bcrypt.hash(password, salt);
      console.log('Password updated (hashed)');
    }

    // Sauvegarde avec validation
    const updatedUser = await userToUpdate.save();

    console.log('SUCCESS: User updated successfully');
    res.json({
      success: true,
      data: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        approved: updatedUser.approved
      }
    });

  } catch (error) {
    console.error("UPDATE ERROR:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // Gestion des erreurs spécifiques
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: "Données invalides",
        errors: Object.values(error.errors).map(err => err.message),
        code: "VALIDATION_ERROR"
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        message: "Cet email est déjà utilisé",
        code: "DUPLICATE_EMAIL"
      });
    }

    res.status(500).json({ 
      message: "Erreur interne du serveur",
      code: "INTERNAL_SERVER_ERROR",
      ...(process.env.NODE_ENV === 'development' && {
        debug: error.message
      })
    });
  }
});
/**
* DELETE /users/:id - Supprimer un utilisateur
*/
router.delete("/:id", authenticateUser, async (req, res) => {
  try {
      const requestingUserId = req.user.userId.toString();
      const targetUserId = req.params.id.toString();

      console.log('\n=== DELETE DEBUG ===');
      console.log('Requesting User:', requestingUserId);
      console.log('Target User:', targetUserId);
      console.log('Is Admin:', req.user.role === 'admin');

      if (req.user.role !== "admin" && requestingUserId !== targetUserId) {
          console.log('FAIL: Unauthorized delete attempt');
          return res.status(403).json({ 
              message: "Suppression non autorisée !",
              details: {
                  requestingUser: requestingUserId,
                  targetUser: targetUserId
              }
          });
      }

      const deletedUser = await User.findByIdAndDelete(targetUserId);
      
      if (!deletedUser) {
          return res.status(404).json({ 
              message: "Utilisateur non trouvé",
              userId: targetUserId
          });
      }

      console.log('SUCCESS: User deleted');
      res.json({ 
          message: "Utilisateur supprimé avec succès",
          userId: targetUserId
      });

  } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      res.status(500).json({ 
          message: "Erreur serveur",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
  }
});
router.get('/ensembles/list', authenticateUser, async (req, res) => {
  try {
    const ensemblesData = {
      "Congé et Vacance": ["Congés", "POINTAGE", "TELETRAVAIL TT"],
      "QRQC": ["Fiche Bleue", "Fiche Jaune", "TACHES"],
      "INDUSTRIALISATION": [
        "acronymes lexique",
        "certif",
        "convertion",
        "convergence / Legacy",
        "Découpe Tissu",
        "ECR",
        "Etiquette",
        "Gabarit Carton",
        "Impression 3D",
        "MAKE OR BUY",
        "MODE OPERATOIRE",
        "OF INDUS",
        "OF RETOUCHE",
        "OUTILLAGE",
        "RECHANGE",
        "VALIDAION PLAN"
      ],
      "INFORMATIQUE": ["M3", "SMARTEAM"],
      "PRODUCTION ET PLANIFICATION": ["PLANNING", "SORTIE DE STOCK"],
      "METHODE": ["COLLE", "DEMANDE PROGRAMME DE COUPE"],
      "QUALITE,COUT,DELAI ET SECURITE": ["chiffrage", "ETQ", "FAI"],
      "PROCEDURE ET INSTRUCTION": [
        "INTERLOCUTEUR",
        "NORME",
        "PROCEDURES",
        "RETEX INDUS HABILLAGE",
        "SIEGE TECHNIQUE"
      ],
      "Deplacement et Transfert": ["Colis Tunisie", "Deplacement"],
      "ADMINISTRATIF": [  // J'ajoute un 10ème ensemble comme vous avez demandé 10
        "Facturation",
        "Contrats",
        "Documents légaux",
        "Archivage"
      ]
    };
      res.json({ success: true, data: ensembles });
  } catch (error) {
      res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

module.exports = router;
