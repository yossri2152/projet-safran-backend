const errorHandler = (err, req, res, next) => {
    console.error('❌ Erreur:', err.stack);
    
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Erreur serveur interne';
    
    res.status(statusCode).json({
      success: false,
      message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  };
  
  module.exports = errorHandler;