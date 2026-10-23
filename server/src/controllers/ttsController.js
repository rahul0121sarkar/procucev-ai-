import { GoogleGenAI } from '@google/genai';

export async function speakText(req, res, next) {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).json({ message: 'text is required' });
    if (text.length > 4000) return res.status(400).json({ message: 'text must be 4000 characters or fewer' });
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ message: 'Gemini API key is not configured' });

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const result = await ai.interactions.create({
      model: process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview',
      input: [{ type: 'user_input', content: [{ type: 'text', text: `Speak the following text verbatim. Do not add words.\n${text}` }] }],
      response_format: { type: 'audio', mime_type: 'audio/wav' },
      generation_config: { speech_config: [{ voice: 'Kore' }] }
    });
    const audio = result.output_audio?.data;
    if (!audio) return res.status(502).json({ message: 'Gemini returned no audio output' });
    const buffer = Buffer.from(audio, 'base64');
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) { next(err); }
}
