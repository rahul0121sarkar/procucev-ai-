import mongoose from 'mongoose';

const transcriptionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, maxlength: 50000 },
  language: { type: String, trim: true, default: 'Auto-detected' },
  durationSeconds: { type: Number, min: 0, default: 0 },
}, { timestamps: true });

export default mongoose.model('Transcription', transcriptionSchema);
