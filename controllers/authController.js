const User = require("../models/User"); // adapte le chemin si nécessaire
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { sendPasswordResetEmail } = require('../utils/emailService');

exports.login = async (req, res) => { 
  try {
    const { email, password } = req.body;
    const cleanEmail = email.toLowerCase().trim();

    // 1. Trouver l'utilisateur avec le mot de passe
    const user = await User.findOne({ email: cleanEmail }).select('+password');
    
    if (!user) {
      console.log('✗ Utilisateur non trouvé');
      return res.status(401).json({ 
        message: "Identifiants incorrects",
        code: "INVALID_CREDENTIALS"
      });
    }

    // 2. Vérifier l'approbation
    if (!user.approved) {
      return res.status(403).json({
        message: "Compte en attente d'approbation",
        code: "ACCOUNT_PENDING"
      });
    }

    // 3. Comparaison du mot de passe
    const isMatch = await user.comparePassword(password);
    console.log('🔐 Password match:', isMatch);
    
    if (!isMatch) {
      return res.status(401).json({ 
        message: "Identifiants incorrects",
        code: "INVALID_CREDENTIALS"
      });
    }

    // 4. Générer le token
    const token = jwt.sign(
      {
        userId: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // 5. Mettre à jour lastLogin
    user.lastLogin = new Date();
    await user.save();

    // 6. Réponse
    res.json({
      success: true,
      message: "Connexion réussie",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        approved: user.approved
      }
    });

  } catch (error) {
    console.error('❌ Erreur login:', error);
    res.status(500).json({ 
      message: "Erreur serveur",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// controllers/authController.js
exports.approveUser = async (req, res) => {
  try {
      const user = await User.findByIdAndUpdate(
          req.params.id,
          { 
              approved: true,
              pending: false,
              lastLogin: null // Force une nouvelle connexion
          },
          { new: true }
      );
      
      // Optionnel : Invalider tous les tokens existants
      await Token.deleteMany({ userId: user._id });
      
      res.json({ 
          message: "Utilisateur approuvé",
          user,
          requiresReconnect: true // Informe le frontend
      });
  } catch (error) {
      res.status(500).json({ message: "Erreur serveur", error });
  }
};
// Ajoutez ces nouvelles fonctions

exports.verifyAndResetPassword = async (req, res) => {
  try {
      const { email, newPassword } = req.body;

      // 1. Vérifier si l'utilisateur existe
      const user = await User.findOne({ email });
      if (!user) {
          return res.status(404).json({ 
              success: false,
              message: "Aucun utilisateur trouvé avec cet email" 
          });
      }

      // 2. Mettre à jour le mot de passe
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
      await user.save();

      res.json({
          success: true,
          message: "Mot de passe mis à jour avec succès"
      });

  } catch (error) {
      console.error("Erreur resetPassword:", error);
      res.status(500).json({ 
          success: false,
          message: "Erreur serveur", 
          error: error.message 
      });
  }
};
exports.verifyEmail = async (req, res) => {
  try {
      const { email } = req.body;
      
      const user = await User.findOne({ email });
      if (!user) {
          return res.status(404).json({ 
              success: false,
              message: "Aucun utilisateur trouvé avec cet email" 
          });
      }

      res.json({ 
          success: true,
          message: "Email vérifié avec succès" 
      });

  } catch (error) {
      res.status(500).json({ 
          success: false,
          message: "Erreur serveur",
          error: error.message 
      });
  }
};

exports.resetPassword = async (req, res) => {
  try {
      const { email, newPassword } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
          return res.status(404).json({
              success: false,
              message: "Utilisateur non trouvé"
          });
      }

      user.password = newPassword; // <-- plus de hash ici
      await user.save();

      res.json({
          success: true,
          message: "Mot de passe mis à jour avec succès"
      });

  } catch (error) {
      res.status(500).json({
          success: false,
          message: "Erreur serveur",
          error: error.message
      });
  }
};

