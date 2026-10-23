import mongoose from 'mongoose';
import Transcription from '../models/Transcription.js';

const validId = (id) => mongoose.isValidObjectId(id);

export async function listTranscriptions(req, res, next) {
  try {
    const items = await Transcription.find().sort({ createdAt: -1 }).limit(200).lean();
    res.json({ count: items.length, transcriptions: items });
  } catch (err) { next(err); }
}

export async function getTranscription(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid transcription id' });
    const item = await Transcription.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Transcription not found' });
    res.json({ transcription: item });
  } catch (err) { next(err); }
}

export async function createTranscription(req, res, next) {
  try {
    const { text, language, durationSeconds } = req.body;
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ message: 'text is required' });
    const item = await Transcription.create({ text: text.trim(), language, durationSeconds });
    res.status(201).json({ message: 'Transcription saved', transcription: item });
  } catch (err) { next(err); }
}

export async function updateTranscription(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid transcription id' });
    const allowed = ['text', 'language', 'durationSeconds'];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
    if ('text' in updates && (typeof updates.text !== 'string' || !updates.text.trim())) {
      return res.status(400).json({ message: 'text cannot be empty' });
    }
    const item = await Transcription.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ message: 'Transcription not found' });
    res.json({ message: 'Transcription updated', transcription: item });
  } catch (err) { next(err); }
}

export async function deleteTranscription(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid transcription id' });
    const item = await Transcription.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: 'Transcription not found' });
    res.json({ message: 'Transcription deleted', id: item.id });
  } catch (err) { next(err); }
}
