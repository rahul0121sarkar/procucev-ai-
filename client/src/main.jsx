import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AudioLines, Clock3, FileText, Headphones, Mic, MicOff, Pencil, Play, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:5000/ws/transcribe';

function pcm16Base64(float32, inputRate) {
  const targetRate = 16000;
  const ratio = inputRate / targetRate;
  const length = Math.floor(float32.length / ratio);
  const buffer = new ArrayBuffer(length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < length; i++) {
    const pos = Math.floor(i * ratio);
    const sample = Math.max(-1, Math.min(1, float32[pos] || 0));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function App() {
  const [items, setItems] = useState([]);
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const startedAtRef = useRef(0);
  const transcriptRef = useRef('');

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/transcriptions`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not load history');
      setItems(data.transcriptions || []);
    } catch (e) { setError(`${e.message}. Is the backend running?`); }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const stopAudioCapture = useCallback(async () => {
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current.onaudioprocess = null; processorRef.current = null; }
    if (sourceRef.current) { sourceRef.current.disconnect(); sourceRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (audioContextRef.current) { await audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
  }, []);

  const startRecording = async () => {
    setError(''); setTranscript(''); transcriptRef.current = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const context = new AudioContext();
      audioContextRef.current = context;
      await context.resume();
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'start' }));
      ws.onmessage = async event => {
        const message = JSON.parse(event.data);
        if (message.type === 'ready') {
          setStatus('recording');
          startedAtRef.current = Date.now();
          const source = context.createMediaStreamSource(stream);
          const processor = context.createScriptProcessor(4096, 1, 1);
          sourceRef.current = source; processorRef.current = processor;
          processor.onaudioprocess = e => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const pcm = pcm16Base64(e.inputBuffer.getChannelData(0), context.sampleRate);
            ws.send(JSON.stringify({ type: 'audio', data: pcm }));
          };
          source.connect(processor); processor.connect(context.destination);
        } else if (message.type === 'transcript' && message.text) {
          // Live API may return partial chunks; append only new text fragments.
          const chunk = message.text;
          transcriptRef.current = `${transcriptRef.current}${chunk}`;
          setTranscript(transcriptRef.current);
        } else if (message.type === 'error') {
          setError(message.message || 'Transcription error'); setStatus('error');
        }
      };
      ws.onerror = () => { setError('WebSocket connection failed. Check the backend and Gemini API key.'); setStatus('error'); };
      ws.onclose = () => { if (status === 'recording') setStatus('idle'); };
      setStatus('connecting');
    } catch (e) { setError(e.message || 'Microphone permission was denied.'); setStatus('error'); }
  };

  const stopRecording = async () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }));
    wsRef.current = null;
    await stopAudioCapture();
    setStatus('idle');
    const text = transcriptRef.current.trim();
    if (text) {
      setSaving(true);
      try {
        const response = await fetch(`${API}/api/transcriptions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, language: 'Hindi + English / auto-detected', durationSeconds: Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)) }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not save transcript');
        await loadHistory();
      } catch (e) { setError(e.message); }
      finally { setSaving(false); }
    }
  };

  useEffect(() => () => {
    if (wsRef.current) wsRef.current.close();
    stopAudioCapture();
  }, [stopAudioCapture]);

  const deleteItem = async id => {
    if (!confirm('Delete this transcription permanently?')) return;
    try {
      const response = await fetch(`${API}/api/transcriptions/${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Delete failed');
      setItems(prev => prev.filter(item => item._id !== id));
    } catch (e) { setError(e.message); }
  };

  const beginEdit = item => { setEditing(item._id); setEditText(item.text); };
  const saveEdit = async id => {
    try {
      const response = await fetch(`${API}/api/transcriptions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: editText }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Update failed');
      setItems(prev => prev.map(item => item._id === id ? data.transcription : item)); setEditing(null);
    } catch (e) { setError(e.message); }
  };

  const speak = async text => {
    try {
      setError('');
      const response = await fetch(`${API}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.message || 'TTS request failed'); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url); await audio.play();
    } catch (e) { setError(`Text-to-speech: ${e.message}`); }
  };

  const filtered = items.filter(item => item.text.toLowerCase().includes(search.toLowerCase()));
  const isActive = status === 'recording' || status === 'connecting';
  const totalWords = items.reduce((n, item) => n + item.text.trim().split(/\s+/).filter(Boolean).length, 0);
  const formatDate = date => new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><AudioLines size={21}/></div><div><strong>procucev<span>.ai</span></strong><small>SPEECH STUDIO</small></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="nav-item active"><Activity size={17}/> Transcription Studio</div>
      <div className="nav-item"><FileText size={17}/> My transcripts <span className="nav-count">{items.length}</span></div>
      <div className="sidebar-bottom"><div className="api-status"><span className="status-dot"/><div><b>System status</b><small>API connection configured</small></div></div><div className="profile"><div className="avatar">PS</div><div><b>Personal workspace</b><small>Hiring assignment</small></div></div></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <b>Transcription Studio</b></div><div className="topbar-right"><span className="secure-label"><span className="status-dot"/> Gemini Live</span><div className="avatar mini">AI</div></div></header>
      <div className="page-content">
        <section className="welcome-row"><div><div className="eyebrow"><Sparkles size={14}/> MULTILINGUAL AI</div><h1>Speech, meet text.</h1><p>Capture every word, in every language. Naturally.</p></div><div className="date-pill"><Clock3 size={15}/>{new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div></section>

        {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={16}/></button></div>}

        <section className="studio-grid">
          <div className="record-card">
            <div className="card-heading"><div><span className="section-kicker">LIVE CAPTURE</span><h2>Transcription studio</h2></div><div className={`live-indicator ${status === 'recording' ? 'is-live' : ''}`}><span/> {status === 'recording' ? 'LIVE' : status === 'connecting' ? 'CONNECTING' : 'READY'}</div></div>
            <div className={`mic-orbit ${status === 'recording' ? 'pulse' : ''}`}><div className="mic-inner"><Mic size={29}/></div><div className="orbit orbit-one"/><div className="orbit orbit-two"/></div>
            <h3>{status === 'recording' ? 'Listening to you…' : status === 'connecting' ? 'Connecting to Gemini…' : status === 'error' ? 'Something needs attention' : 'Ready when you are'}</h3>
            <p className="record-subtitle">{status === 'recording' ? 'Speak naturally in Hindi, English, or mix both.' : 'Tap the microphone to start a live transcription.'}</p>
            <button className={`record-button ${isActive ? 'stop' : ''}`} onClick={isActive ? stopRecording : startRecording} disabled={saving || status === 'connecting'}>{isActive ? <><MicOff size={17}/> Stop recording</> : <><Mic size={17}/> Start speaking</>}</button>
            <div className="language-note"><span className="language-chip">हि हिन्दी</span><span className="language-chip">EN English</span><span className="language-chip muted-chip">+ Multilingual</span></div>
            <div className="transcript-preview"><div className="preview-head"><span><span className="tiny-dot"/> LIVE TRANSCRIPT</span><span>{transcript.trim() ? `${transcript.trim().split(/\s+/).length} words` : 'Waiting for speech'}</span></div><div className={`preview-body ${transcript ? 'has-text' : ''}`}>{transcript || <span className="placeholder-text">Your words will appear here as you speak…</span>}</div>{transcript && <div className="preview-actions"><button className="text-button" onClick={() => { navigator.clipboard?.writeText(transcript); }}><FileText size={14}/> Copy text</button><button className="text-button" onClick={() => speak(transcript)}><Headphones size={14}/> Read aloud</button></div>}</div>
            {saving && <div className="saving-note">Saving transcript to MongoDB…</div>}
          </div>
          <div className="insights-column">
            <div className="stat-card"><div className="stat-top"><span>Total transcripts</span><div className="stat-icon violet"><FileText size={17}/></div></div><div className="stat-number">{items.length.toString().padStart(2, '0')}</div><div className="stat-foot">Saved to your workspace</div></div>
            <div className="stat-card"><div className="stat-top"><span>Words captured</span><div className="stat-icon blue"><AudioLines size={17}/></div></div><div className="stat-number">{totalWords.toLocaleString()}</div><div className="stat-foot">Across all saved transcripts</div></div>
            <div className="tip-card"><div className="tip-icon"><Sparkles size={17}/></div><div><b>A little tip</b><p>Switch between Hindi and English naturally. No need to pause or change any settings.</p></div></div>
            <div className="engine-card"><div className="engine-icon"><Activity size={16}/></div><div><b>Powered by Gemini Live</b><small>Low-latency speech understanding</small></div><span className="engine-dot"/></div>
          </div>
        </section>

        <section className="history-section"><div className="history-header"><div><span className="section-kicker">YOUR LIBRARY</span><h2>Recent transcripts <span className="count-badge">{items.length}</span></h2><p>Review, edit, or revisit your past sessions.</p></div><div className="history-tools"><div className="search-box"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transcripts…"/></div><button className="refresh-button" onClick={loadHistory} title="Refresh history"><Activity size={16}/></button></div></div>
          {filtered.length === 0 ? <div className="empty-state"><div className="empty-icon"><FileText size={24}/></div><b>{search ? 'No matching transcripts' : 'Your story starts here'}</b><p>{search ? 'Try another search term.' : 'Your saved transcriptions will show up here after your first recording.'}</p><button className="small-primary" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><Plus size={15}/> Start a session</button></div> : <div className="history-list">{filtered.map((item, index) => <article className="history-item" key={item._id}><div className="history-file-icon"><FileText size={18}/></div><div className="history-item-content">{editing === item._id ? <textarea className="edit-area" value={editText} onChange={e => setEditText(e.target.value)} autoFocus/> : <p>{item.text}</p>}<div className="history-meta"><span><Clock3 size={12}/>{formatDate(item.createdAt)}</span><span className="meta-separator">·</span><span>{item.text.trim().split(/\s+/).filter(Boolean).length} words</span><span className="language-tag">{item.language || 'Auto-detected'}</span></div></div><div className="item-actions">{editing === item._id ? <><button className="action-btn save-action" onClick={() => saveEdit(item._id)}>Save</button><button className="action-btn" onClick={() => setEditing(null)} title="Cancel"><X size={15}/></button></> : <><button className="action-btn" onClick={() => speak(item.text)} title="Read aloud"><Play size={15}/></button><button className="action-btn" onClick={() => beginEdit(item)} title="Edit transcript"><Pencil size={15}/></button><button className="action-btn delete-action" onClick={() => deleteItem(item._id)} title="Delete transcript"><Trash2 size={15}/></button></>}</div></article>)}</div>}
        </section>
        <footer className="footer"><span>Built for the Procucev AI Tech Hiring Assignment</span><span>Node.js <i/> MongoDB <i/> Gemini</span></footer>
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
