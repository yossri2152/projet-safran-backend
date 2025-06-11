const mongoose = require('mongoose');

const SousEnsembleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    content: { type: String },
    images: [{ type: String }],
    files: [{ type: String }],
    ensembleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ensemble' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

SousEnsembleSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('SousEnsemble', SousEnsembleSchema);