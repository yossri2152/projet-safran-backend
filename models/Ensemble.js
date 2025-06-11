const mongoose = require('mongoose');

const EnsembleSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
    imageUrl: { type: String },
    sousEnsembles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SousEnsemble' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

EnsembleSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Ensemble', EnsembleSchema);