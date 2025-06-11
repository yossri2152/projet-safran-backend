const express = require('express');
const router = express.Router();
const authenticateUser = require('../middleware/authMiddleware');
const Ensemble = require('../models/Ensemble');
const SousEnsemble = require('../models/SousEnsemble');
const multer = require('multer');
const path = require('path');

// Configuration Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Seules les images sont autorisées!'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Middleware de vérification de type de fichier
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

// Créer un nouvel ensemble
router.post('/', authenticateUser, upload.single('image'), checkFileType, async (req, res) => {
    try {
        const { name, description } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
        
        const newEnsemble = new Ensemble({
            name,
            description,
            imageUrl,
            createdBy: req.user.userId
        });

        await newEnsemble.save();
        req.io.emit('ensembles:updated', { action: 'create', ensemble: newEnsemble });
        res.status(201).json(newEnsemble);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Obtenir tous les ensembles
router.get('/', async (req, res) => {
    try {
        const ensembles = await Ensemble.find().populate('sousEnsembles');
        res.json(ensembles);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Obtenir un ensemble spécifique
router.get('/:id', async (req, res) => {
    try {
        const ensemble = await Ensemble.findById(req.params.id).populate('sousEnsembles');
        if (!ensemble) return res.status(404).json({ message: 'Ensemble non trouvé' });
        res.json(ensemble);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Mettre à jour un ensemble
router.put('/:id', authenticateUser, upload.single('image'), checkFileType, async (req, res) => {
    try {
        const { name, description } = req.body;
        const updateData = { name, description, updatedAt: Date.now() };
        
        if (req.file) {
            updateData.imageUrl = `/uploads/${req.file.filename}`;
        }

        const updatedEnsemble = await Ensemble.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );

        if (!updatedEnsemble) return res.status(404).json({ message: 'Ensemble non trouvé' });
        
        req.io.emit('ensembles:updated', { action: 'update', ensemble: updatedEnsemble });
        res.json(updatedEnsemble);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Supprimer un ensemble
router.delete('/:id', authenticateUser, async (req, res) => {
    try {
        const deletedEnsemble = await Ensemble.findByIdAndDelete(req.params.id);
        if (!deletedEnsemble) return res.status(404).json({ message: 'Ensemble non trouvé' });
        
        await SousEnsemble.deleteMany({ ensembleId: req.params.id });
        
        req.io.emit('ensembles:updated', { action: 'delete', ensembleId: req.params.id });
        res.json({ message: 'Ensemble supprimé avec succès' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Routes pour les sous-ensembles
router.post('/:ensembleId/sous-ensembles', authenticateUser, upload.array('images', 5), async (req, res) => {
    try {
        const { name, content } = req.body;
        const images = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];
        
        const newSousEnsemble = new SousEnsemble({
            name,
            content,
            images,
            ensembleId: req.params.ensembleId,
            createdBy: req.user.userId
        });

        await newSousEnsemble.save();
        
        await Ensemble.findByIdAndUpdate(
            req.params.ensembleId,
            { $push: { sousEnsembles: newSousEnsemble._id } }
        );

        req.io.emit('sous-ensembles:updated', { 
            action: 'create', 
            sousEnsemble: newSousEnsemble,
            ensembleId: req.params.ensembleId
        });
        
        res.status(201).json(newSousEnsemble);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;