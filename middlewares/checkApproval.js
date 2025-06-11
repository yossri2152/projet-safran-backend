// middlewares/checkApproval.js
module.exports = (req, res, next) => {
  // Routes publiques qui ne nécessitent pas d'approbation
  const publicRoutes = [
    '/auth/login',
    '/auth/register'
  ];

  if (publicRoutes.includes(req.path)) {
    return next();
  }

  // Si l'utilisateur n'est pas connecté
  if (!req.user) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Authentification requise'
    });
  }

  // Vérification d'approbation pour TOUS les utilisateurs (même les admins)
  if (!req.user.approved) {
    return res.status(403).json({
      code: 'ACCOUNT_PENDING',
      message: 'Votre compte est en attente d\'approbation par un administrateur'
    });
  }

  next();
};