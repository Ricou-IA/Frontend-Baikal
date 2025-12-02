import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
// Correction de l'import : utilisation du chemin relatif pour éviter les problèmes d'alias
import { uploadMeetingAudio } from '../lib/supabaseClient';

export default function AudioRecorder({ onRecordingComplete }) {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);

    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Laisser le navigateur choisir son format natif (évite l'erreur 400 sur Safari/iOS)
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorderRef.current.onstop = processRecording;

            mediaRecorderRef.current.start();
            setIsRecording(true);
            setError(null);
            setResult(null);

            timerRef.current = setInterval(() => {
                setDuration(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error("Erreur micro:", err);
            setError("Impossible d'accéder au micro. Vérifiez vos permissions.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            setIsRecording(false);
            clearInterval(timerRef.current);
            setDuration(0);
        }
    };

    const processRecording = async () => {
        setIsProcessing(true);

        try {
            // 1. Détection intelligente du format
            const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
            let extension = 'webm';
            if (mimeType.includes('mp4')) extension = 'mp4';
            else if (mimeType.includes('ogg')) extension = 'ogg';
            else if (mimeType.includes('wav')) extension = 'wav';

            console.log(`Format détecté: ${mimeType} -> .${extension}`);

            // 2. Création du fichier
            const blob = new Blob(chunksRef.current, { type: mimeType });
            const file = new File([blob], `recording.${extension}`, { type: mimeType });

            // 3. Envoi
            const { meeting } = await uploadMeetingAudio(file, `Réunion du ${new Date().toLocaleString()}`);

            if (!meeting) throw new Error("Aucune donnée reçue du serveur");

            // 4. Appel N8N depuis le frontend après dépôt dans Storage
            // Envoi uniquement du transcript de Whisper (pas le résumé) pour éviter de polluer le RAG
            const n8nWebhookUrl = import.meta.env.VITE_N8N_INGEST_WEBHOOK_URL?.trim();
            if (n8nWebhookUrl && meeting) {
                try {
                    console.log('📤 Envoi signal à N8N pour lancer le workflow (transcript uniquement)...');
                    const n8nResponse = await fetch(n8nWebhookUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            content: meeting.transcript,  // ✅ Uniquement le transcript de Whisper (pas le résumé)
                            metadata: {
                                source: 'meeting_audio',
                                meeting_id: meeting.id,
                                title: meeting.title,
                                audio_path: meeting.audio_path || meeting.audio_url,
                                transcript_path: meeting.transcript_path,
                                user_id: meeting.user_id
                            },
                            target_verticals: ['default']
                        })
                    });

                    if (!n8nResponse.ok) {
                        console.warn('⚠️ Erreur lors de l\'appel N8N (non bloquant):', n8nResponse.status);
                    } else {
                        console.log('✅ Transcript envoyé à N8N pour embedding (RAG)');
                    }
                } catch (n8nError) {
                    console.warn('⚠️ Erreur lors de l\'appel N8N (non bloquant):', n8nError);
                }
            }

            setResult(meeting);
            if (onRecordingComplete) onRecordingComplete(meeting);

        } catch (err) {
            console.error("Erreur complète:", err);
            setError(err.message || "Erreur lors du traitement de l'audio");
        } finally {
            setIsProcessing(false);
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="w-full max-w-2xl mx-auto">
            <div className={`
        relative rounded-2xl border-2 p-8 text-center transition-all
        ${isRecording ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}
      `}>

                <div className="mb-6">
                    {isRecording ? (
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-100 text-red-600 rounded-full text-sm font-medium animate-pulse">
                            <div className="w-2 h-2 bg-red-600 rounded-full" />
                            Enregistrement en cours ({formatTime(duration)})
                        </div>
                    ) : (
                        <h3 className="text-lg font-semibold text-slate-700">Nouvelle réunion</h3>
                    )}
                </div>

                <div className="flex justify-center mb-6">
                    {isProcessing ? (
                        <div className="flex flex-col items-center">
                            <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-4" />
                            <p className="text-slate-600 font-medium">Analyse par OpenAI (Whisper + GPT-4o)...</p>
                            <p className="text-slate-400 text-sm">Cela peut prendre quelques secondes</p>
                        </div>
                    ) : isRecording ? (
                        <button
                            onClick={stopRecording}
                            className="group relative flex items-center justify-center w-20 h-20 bg-red-500 rounded-full hover:bg-red-600 transition-all shadow-lg hover:shadow-red-200"
                        >
                            <Square className="w-8 h-8 text-white fill-current" />
                            <span className="absolute -bottom-8 text-sm text-red-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                Arrêter
                            </span>
                        </button>
                    ) : (
                        <button
                            onClick={startRecording}
                            className="group relative flex items-center justify-center w-20 h-20 bg-indigo-600 rounded-full hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                        >
                            <Mic className="w-8 h-8 text-white" />
                            <span className="absolute -bottom-8 text-sm text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                Démarrer
                            </span>
                        </button>
                    )}
                </div>

                {error && (
                    <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center justify-center gap-2 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                    </div>
                )}
            </div>

            {result && (
                <div className="mt-8 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm animate-fadeIn">
                    <div className="p-4 border-b border-slate-100 bg-green-50 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-green-800">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="font-semibold">Réunion analysée avec succès</span>
                        </div>
                        <span className="text-xs text-green-600 bg-white/50 px-2 py-1 rounded">
                            GPT-4o
                        </span>
                    </div>

                    <div className="p-6">
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">
                            Résumé exécutif
                        </h4>
                        <div className="prose prose-sm text-slate-600 max-w-none mb-6 p-4 bg-slate-50 rounded-lg">
                            <pre className="whitespace-pre-wrap font-sans text-sm">
                                {result.summary || "Aucun résumé disponible."}
                            </pre>
                        </div>

                        {result.action_items && result.action_items.length > 0 && (
                            <div className="bg-indigo-50 rounded-xl p-4">
                                <h4 className="flex items-center gap-2 text-sm font-bold text-indigo-900 mb-3">
                                    <FileText className="w-4 h-4" />
                                    Actions à entreprendre
                                </h4>
                                <ul className="space-y-2">
                                    {result.action_items.map((item, idx) => (
                                        <li key={idx} className="flex items-start gap-2 text-sm text-indigo-800">
                                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
