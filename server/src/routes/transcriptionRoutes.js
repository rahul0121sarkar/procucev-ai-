import { Router } from 'express';
import { listTranscriptions, getTranscription, createTranscription, updateTranscription, deleteTranscription } from '../controllers/transcriptionController.js';

const router = Router();
router.get('/', listTranscriptions);
router.get('/:id', getTranscription);
router.post('/', createTranscription);
router.patch('/:id', updateTranscription);
router.delete('/:id', deleteTranscription);
export default router;
