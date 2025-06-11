const jwt = require("jsonwebtoken");
const User = require('../models/User'); // Chemin relatif correct vers votre modèle User

const SECRET_KEY = process.env.JWT_SECRET || "secret";

// ✅ Middleware principal pour vérifier le token JWT
const verifyToken = async (req, res, next) => {
  try {
      // 1. Vérification du header Authorization
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
              message: "Authorization header missing or invalid",
              code: "AUTH_HEADER_MISSING"
          });
      }

      // 2. Extraction et vérification du token
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 3. Vérification en base de données (optionnel - à adapter selon vos besoins)
      const user = await User.findById(decoded.userId)
          .select('_id name email role approved')
          .lean();

      if (!user) {
          return res.status(401).json({
              message: "User not found",
              code: "USER_NOT_FOUND"
          });
      }

      // 4. Vérification de l'approbation du compte (si nécessaire)
      if (!user.approved && user.role !== 'admin') {
          return res.status(403).json({
              message: "Account pending approval",
              code: "ACCOUNT_PENDING"
          });
      }

      // 5. Normalisation des données utilisateur
      req.user = {
          // Version string pour les comparaisons
          userId: user._id.toString(),
          id: user._id.toString(), // Alias pour compatibilité
          
          // Version ObjectId pour les requêtes MongoDB
          _id: user._id,
          
          // Données utilisateur
          name: user.name,
          email: user.email,
          role: user.role,
          approved: user.approved
      };

      next();
  } catch (err) {
      console.error("Authentication error:", err);
      
      // Gestion des erreurs spécifiques
      if (err.name === 'TokenExpiredError') {
          return res.status(401).json({
              message: "Token expired",
              code: "TOKEN_EXPIRED"
          });
      }
      
      if (err.name === 'JsonWebTokenError') {
          return res.status(403).json({
              message: "Invalid token",
              code: "INVALID_TOKEN"
          });
      }

      // Erreur serveur inattendue
      return res.status(500).json({
          message: "Authentication failed",
          code: "AUTH_FAILURE"
      });
  }
};

// ✅ Middleware alias pour compatibilité
const authenticateUser = verifyToken;

// ✅ Middleware pour vérifier si l'utilisateur est admin
const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "⛔ Accès refusé. Admin requis." });
  }
  next();
};

// ✅ Middleware strictement admin (version alternative)
const strictAdminCheck = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: "Accès refusé. Droits admin requis."
    });
  }
  next();
};

// ✅ Middleware pour vérifier les rôles autorisés
// Dans authMiddleware.js
// Middleware verifyRole mis à jour
// Middleware verifyRole amélioré
const verifyRole = (...allowedRoles) => {
  return (req, res, next) => {
    console.log('\n=== DEBUG ROLE MIDDLEWARE ===');
    console.log('User Object:', req.user); // Vérifiez toute la structure
    console.log('User Role:', req.user?.role);
    console.log('Allowed Roles:', allowedRoles);
    
    if (!req.user?.role) {
      console.log('ERREUR: Aucun rôle trouvé dans req.user');
      return res.status(403).json({ 
        success: false,
        message: "Accès refusé. Rôle utilisateur manquant." 
      });
    }

    // Conversion en minuscules et suppression des espaces
    const userRole = req.user.role.toString().toLowerCase().trim();
    const normalizedAllowed = allowedRoles.map(r => r.toString().toLowerCase().trim());

    console.log('Normalized User Role:', userRole);
    console.log('Normalized Allowed:', normalizedAllowed);

    if (!normalizedAllowed.includes(userRole)) {
      console.log(`ERREUR: Rôle ${userRole} non autorisé`);
      return res.status(403).json({
        success: false,
        message: `Accès refusé. Rôle "${userRole}" insuffisant. Requis: ${allowedRoles.join(', ')}`,
        details: {
          yourRole: userRole,
          requiredRoles: allowedRoles
        }
      });
    }

    console.log('=== ACCÈS AUTORISÉ ===\n');
    next();
  };
};

// ✅ Middleware pour vérifier l'approbation utilisateur
const checkApproval = (req, res, next) => {
  if (!req.user.approved && req.user.role !== "admin") {
    return res.status(403).json({
      message: "⛔ Votre compte est en attente d'approbation par un administrateur"
    });
  }
  next();
};

// Dans authMiddleware.js
const cleanExpiredTokens = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        // Supprimer le token expiré du header
        delete req.headers['authorization'];
      }
      next();
    }
  } else {
    next();
  }
};

const debugUserUpdate = (req, res, next) => {
  console.log('\n=== DEBUG USER UPDATE ===');
  console.log('Headers:', req.headers);
  console.log('Token User ID:', req.user?.userId);
  console.log('Param ID:', req.params.id);
  console.log('User Role:', req.user?.role);
  console.log('Body:', req.body);
  next();
};

// Middleware pour vérifier les types de fichiers
const checkFileType = (req, res, next) => {
  if (!req.file) return next();
  
  const filetypes = /jpeg|jpg|png|gif/;
  const extname = filetypes.test(path.extname(req.file.originalname).toLowerCase());
  const mimetype = filetypes.test(req.file.mimetype);
  
  if (extname && mimetype) {
      return next();
  } else {
      return res.status(400).json({ error: 'Seules les images sont autorisées!' });
  }
};
 
module.exports = {
  verifyToken,
  authenticateUser,
  isAdmin,
  verifyRole,
  checkApproval,
  strictAdminCheck,
  cleanExpiredTokens,
  debugUserUpdate,
  checkFileType
};
