import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/axios';
import { toast } from 'sonner';
import { Mic, MicOff, Send, Loader2, Sparkles, MessageSquare, AlertTriangle, VideoOff, Square, Clock, Volume2 } from 'lucide-react';
import * as faceapi from '@vladmandic/face-api';
import type { MockInterview } from '../../../types/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIMockInterviewSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Media
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasPermissions, setHasPermissions] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);

  // Speech Recognition (Manual Toggle)
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const transcriptRef = useRef('');
  const finalizedTextRef = useRef('');
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const stopRecordingRef = useRef<() => void>(() => {});

  // TTS
  const isAiSpeakingRef = useRef(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  // Face detection
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceDetectionFailed, setFaceDetectionFailed] = useState(false);
  const [detectorType, setDetectorType] = useState<'tiny' | 'ssd'>('tiny');
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [faceStatus, setFaceStatus] = useState<'loading' | 'ok' | 'no-face' | 'multi-face'>('loading');

  // Proctoring
  const [warnings, setWarnings] = useState(0);
  const isTerminatingRef = useRef(false);
  const interviewStartedRef = useRef(false);
  const multiFaceCooldownRef = useRef(false);

  // Timer
  const [elapsed, setElapsed] = useState(0);

  // Derived
  const questionCount = messages.filter(m => m.role === 'assistant').length;
  const answerCount = messages.filter(m => m.role === 'user').length;

  // Keep messagesRef in sync
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

  // ──────────────────────────────────────────────────────
  //  DATA
  // ──────────────────────────────────────────────────────
  const { data: interview, isLoading } = useQuery({
    queryKey: ['mock-interview', id],
    queryFn: async () => {
      const res = await api.get(`/interviews/${id}`);
      return res.data.data as MockInterview;
    },
  });

  const endInterviewMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/interviews/ai/grade`, {
        interviewId: id,
        chatHistory: messagesRef.current,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Interview completed and graded successfully!');
      queryClient.invalidateQueries({ queryKey: ['my-mock-interviews'] });
      queryClient.invalidateQueries({ queryKey: ['mock-interviews'] });
      queryClient.invalidateQueries({ queryKey: ['mock-interview', id] });
      queryClient.invalidateQueries({ queryKey: ['placement-eligibility'] });
      navigate('/my-mock-interviews');
    },
    onError: () => {
      toast.error('Failed to finalize interview.');
    }
  });

  // ──────────────────────────────────────────────────────
  //  TIMER
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ──────────────────────────────────────────────────────
  //  MEDIA SETUP
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    let active: MediaStream | null = null;
    let cancelled = false;

    async function setupMedia() {
      try {
        const str = await navigator.mediaDevices.getUserMedia({ 
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }, 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
        if (cancelled) {
          str.getTracks().forEach(track => track.stop());
          return;
        }
        active = str;
        setStream(str);
        setHasPermissions(true);
      } catch (err) {
        if (!cancelled) {
          toast.error('Camera and Microphone permissions are required for the interview.');
        }
      }
    }
    setupMedia();

    return () => {
      cancelled = true;
      if (active) {
        active.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream, hasPermissions]);

  // ──────────────────────────────────────────────────────
  //  PROCTORING — TAB SWITCH
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !isTerminatingRef.current) {
        setWarnings(prev => {
          const next = prev + 1;
          if (next >= 51) {
            if (!isTerminatingRef.current) {
              isTerminatingRef.current = true;
              toast.error("Interview terminated due to excessive tab switching.");
              endInterviewMutation.mutate();
            }
          } else {
            toast.warning(`Warning ${next}/50: Please do not switch tabs during the interview.`, { duration: 5000 });
          }
          return next;
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // ──────────────────────────────────────────────────────
  //  FACE DETECTION SETUP (Robust loading)
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    const loadModels = async () => {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        setDetectorType('tiny');
        setModelsLoaded(true);
        setFaceDetectionFailed(false);
      } catch (err) {
        console.warn('TinyFaceDetector failed to load, trying ssdMobilenetv1...', err);
        try {
          await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
          setDetectorType('ssd');
          setModelsLoaded(true);
          setFaceDetectionFailed(false);
        } catch (err2) {
          console.error('All face detection models failed to load:', err2);
          setFaceDetectionFailed(true);
          toast.error('Face detection could not load. Please refresh the page.');
        }
      }
    };
    loadModels();
  }, []);

  // ──────────────────────────────────────────────────────
  //  FACE DETECTION LOOP
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!modelsLoaded || !hasPermissions || !videoRef.current || !isVideoReady) return;

    let isCancelled = false;
    let noFaceCounter = 0;

    const opts = detectorType === 'tiny' 
      ? new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 })
      : new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

    const detectFace = async () => {
      if (isCancelled || isTerminatingRef.current) return;

      if (videoRef.current && videoRef.current.readyState === 4) {
        try {
          const detections = await faceapi.detectAllFaces(videoRef.current, opts);

          if (detections.length === 0) {
            setFaceStatus('no-face');
            noFaceCounter++;
            if (noFaceCounter >= 7) {
              setWarnings(prev => {
                const next = prev + 1;
                if (next >= 51) {
                  if (!isTerminatingRef.current) {
                    isTerminatingRef.current = true;
                    toast.error("Interview terminated: face not detected.");
                    endInterviewMutation.mutate();
                  }
                } else {
                  toast.warning(`Warning ${next}/50: Face not detected. Please ensure your face is clearly visible.`, { duration: 3000 });
                }
                return next;
              });
              noFaceCounter = 0;
            }
          } else if (detections.length > 1) {
            setFaceStatus('multi-face');
            if (!multiFaceCooldownRef.current) {
              multiFaceCooldownRef.current = true;
              setTimeout(() => { multiFaceCooldownRef.current = false; }, 5000);
              setWarnings(prev => {
                const next = prev + 1;
                if (next >= 51) {
                  if (!isTerminatingRef.current) {
                    isTerminatingRef.current = true;
                    toast.error("Interview terminated: multiple persons detected.");
                    endInterviewMutation.mutate();
                  }
                } else {
                  toast.warning(`Warning ${next}/50: ${detections.length} persons detected. Please ensure you are alone.`, { duration: 5000 });
                }
                return next;
              });
            }
            noFaceCounter = 0;
          } else {
            setFaceStatus('ok');
            noFaceCounter = 0;
          }
        } catch (e) {
          // Silent catch to prevent console spam if face detection fails occasionally
        }
      }

      if (!isCancelled && !isTerminatingRef.current) {
        setTimeout(detectFace, 700);
      }
    };

    detectFace();

    return () => {
      isCancelled = true;
    };
  }, [modelsLoaded, hasPermissions, detectorType, isVideoReady]);

  // ──────────────────────────────────────────────────────
  //  AUTO-SCROLL
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing, transcript]);

  // ──────────────────────────────────────────────────────
  //  AUTO-START INTERVIEW
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!interview || !interview.is_ai_driven || interviewStartedRef.current) return;
    interviewStartedRef.current = true;

    const startInterview = async () => {
      setIsProcessing(true);
      try {
        const res = await api.post(`/interviews/ai/start`, { interviewId: id });
        const reply = res.data.data.reply;
        setMessages([{ role: 'assistant', content: reply }]);
        speakText(reply);
      } catch (err) {
        toast.error('Failed to start interview. Please refresh.');
      } finally {
        setIsProcessing(false);
      }
    };

    startInterview();
  }, [interview]);

  // ──────────────────────────────────────────────────────
  //  TTS HELPER
  // ──────────────────────────────────────────────────────
  const speakText = useCallback((text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    (window as any).currentUtterance = utterance;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    isAiSpeakingRef.current = true;
    setIsAiSpeaking(true);

    stopRecordingRef.current();

    utterance.onend = () => {
      isAiSpeakingRef.current = false;
      setIsAiSpeaking(false);
    };
    utterance.onerror = () => {
      isAiSpeakingRef.current = false;
      setIsAiSpeaking(false);
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  // ──────────────────────────────────────────────────────
  //  SPEECH RECOGNITION (MANUAL TOGGLE)
  //  A fresh recognition instance is created on every (re)start.
  //  Reusing an ended instance is what caused the button to glitch.
  // ──────────────────────────────────────────────────────
  const restartScheduledRef = useRef(false);

  const buildRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      isRecordingRef.current = true;
      setIsRecording(true);
    };

    rec.onresult = (event: any) => {
      let sessionFinal = '';
      let sessionInterim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          sessionFinal += result[0].transcript;
        } else {
          sessionInterim += result[0].transcript;
        }
      }

      if (sessionFinal) {
        finalizedTextRef.current = (finalizedTextRef.current + ' ' + sessionFinal).trim();
      }
      const displayText = (finalizedTextRef.current + (sessionInterim ? ' ' + sessionInterim : '')).trim();

      setTranscript(displayText);
      transcriptRef.current = displayText;
    };

    rec.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error);
      // 'no-speech' and 'aborted' are non-fatal; onend handles the restart.
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        isRecordingRef.current = false;
        setIsRecording(false);
        toast.error('Microphone access was blocked. Please allow it and try again.');
      }
    };

    rec.onend = () => {
      // Detach handlers so this ended instance can be garbage collected cleanly.
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;

      if (isRecordingRef.current && !isAiSpeakingRef.current && !restartScheduledRef.current) {
        restartScheduledRef.current = true;
        setTimeout(() => {
          restartScheduledRef.current = false;
          if (isRecordingRef.current && !isAiSpeakingRef.current) {
            beginRecognition();
          }
        }, 250);
      } else if (!isRecordingRef.current) {
        setIsRecording(false);
      }
    };

    return rec;
  }, []);

  const beginRecognition = useCallback(() => {
    const rec = buildRecognition();
    if (!rec) return;
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      // If start throws (instance busy), retry once shortly.
      console.warn('rec.start threw, retrying...', err);
      setTimeout(() => {
        if (isRecordingRef.current) {
          try { rec.start(); } catch (e) { console.error('Failed to start recognition', e); }
        }
      }, 200);
    }
  }, [buildRecognition]);

  const startRecording = useCallback(() => {
    if (isRecordingRef.current || isAiSpeakingRef.current || !hasPermissions || isProcessingRef.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition is not supported. Please use Chrome or Edge.');
      return;
    }

    // Clean up any lingering instance before starting fresh.
    if (recognitionRef.current) {
      const old = recognitionRef.current;
      old.onstart = null; old.onresult = null; old.onerror = null; old.onend = null;
      try { old.stop(); } catch (e) {}
      recognitionRef.current = null;
    }

    isRecordingRef.current = true;
    setIsRecording(true);
    beginRecognition();
  }, [hasPermissions, beginRecognition]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    restartScheduledRef.current = false;
    setIsRecording(false);
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      rec.onstart = null; rec.onresult = null; rec.onerror = null; rec.onend = null;
      try { rec.stop(); } catch (e) {}
      try { rec.abort?.(); } catch (e) {}
      recognitionRef.current = null;
    }
    const current = transcriptRef.current.trim();
    if (current) {
      finalizedTextRef.current = current;
      setTranscript(current);
    }
  }, []);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        try { recognitionRef.current.stop(); } catch(e) {}
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  // ──────────────────────────────────────────────────────
  //  SEND MESSAGE TO AI
  // ──────────────────────────────────────────────────────
  const handleSendMessage = async (e?: FormEvent) => {
    e?.preventDefault();

    stopRecording();

    const textToSend = transcriptRef.current.trim();
    if (!textToSend || isProcessing) return;

    const newMessages: ChatMessage[] = [...messages, { role: 'user' as const, content: textToSend }];
    setMessages(newMessages);

    setTranscript('');
    transcriptRef.current = '';
    finalizedTextRef.current = '';

    setIsProcessing(true);

    try {
      const res = await api.post(`/interviews/ai/chat`, {
        interviewId: id,
        studentMessage: textToSend,
        chatHistory: messages,
      });

      const reply = res.data.data.reply;
      setMessages([...newMessages, { role: 'assistant', content: reply }]);
      speakText(reply);
    } catch (err) {
      toast.error('Failed to get AI response.');
      setMessages(messages);
      setTranscript(textToSend);
      transcriptRef.current = textToSend;
      finalizedTextRef.current = textToSend;
      isAiSpeakingRef.current = false;
      setIsAiSpeaking(false);
    } finally {
      setIsProcessing(false);
    }
  };

  // ──────────────────────────────────────────────────────
  //  LOADING / ERROR STATES
  // ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center animate-pulse">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <p className="text-gray-500 font-medium">Preparing your interview...</p>
        </div>
      </div>
    );
  }

  if (!interview || !interview.is_ai_driven) {
    return <div className="p-8 text-center text-red-500 font-bold">Invalid AI Interview session.</div>;
  }

  return (
    <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-5 h-[calc(100vh-80px)] p-4">
      
      {/* ═══════ LEFT PANEL — Video + Controls ═══════ */}
      <div className="w-full lg:w-[380px] flex flex-col gap-4 shrink-0">
        
        {/* Video Feed */}
        <div className="relative rounded-2xl overflow-hidden bg-gray-900 shadow-2xl aspect-video ring-1 ring-white/10">
          {hasPermissions ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={() => setIsVideoReady(true)}
                onCanPlay={() => setIsVideoReady(true)}
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              {!modelsLoaded && !faceDetectionFailed && (
                <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur text-white text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading face tracking...
                </div>
              )}
              {faceDetectionFailed && (
                <div className="absolute bottom-3 left-3 bg-red-600/90 backdrop-blur text-white text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> Face tracking unavailable
                </div>
              )}
              {modelsLoaded && !faceDetectionFailed && (
                <div className={`absolute bottom-3 left-3 backdrop-blur text-white text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${
                  faceStatus === 'ok' ? 'bg-green-600/90' :
                  faceStatus === 'multi-face' ? 'bg-red-600/90' :
                  faceStatus === 'no-face' ? 'bg-amber-600/90' :
                  'bg-black/70'
                }`}>
                  {faceStatus === 'ok' && 'Face detected'}
                  {faceStatus === 'no-face' && 'No face detected'}
                  {faceStatus === 'multi-face' && 'Multiple faces detected'}
                  {faceStatus === 'loading' && 'Initializing proctoring...'}
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
              <VideoOff className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">Camera is disabled</p>
            </div>
          )}

          {/* Status badges */}
          <div className="absolute top-3 right-3 flex gap-2">
            <div className="bg-red-600/90 backdrop-blur text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span> LIVE
            </div>
            <div className="bg-gray-900/80 backdrop-blur text-white text-[10px] font-mono px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> {fmtTime(elapsed)}
            </div>
          </div>

          {warnings > 0 && (
            <div className="absolute top-3 left-3 bg-red-600/90 backdrop-blur text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 z-10">
              <AlertTriangle className="w-3 h-3" /> {warnings}/50
            </div>
          )}
        </div>

        {/* Interview Info Card */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/60 shadow-lg p-5 flex-1 flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-sm leading-tight">AI Interviewer</h2>
              <p className="text-[11px] text-gray-500">{interview.ai_topic || 'General Technical Interview'}</p>
            </div>
            {questionCount > 0 && (
              <div className="ml-auto text-[11px] bg-indigo-50 text-indigo-600 font-semibold px-2.5 py-1 rounded-full">
                Q{questionCount}
              </div>
            )}
          </div>

          {/* Status Indicator */}
          <div className={`mb-4 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all duration-300 ${
            isAiSpeaking 
              ? 'bg-purple-50 text-purple-700 border border-purple-200' 
              : isRecording 
                ? 'bg-red-50 text-red-600 border border-red-200' 
                : 'bg-gray-50 text-gray-500 border border-gray-200'
          }`}>
            {isAiSpeaking ? (
              <>
                <Volume2 className="w-4 h-4 animate-pulse" />
                AI is speaking...
              </>
            ) : isRecording ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
                Listening... Review before sending
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" />
                Tap Mic to answer, then Send
              </>
            )}
          </div>

          <div className="flex-1"></div>

          {/* Controls */}
          <div className="flex flex-col gap-3 mt-auto">
            {/* Mic Button */}
            <button
              onClick={toggleRecording}
              disabled={isAiSpeaking || isProcessing}
              className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all duration-300 ${
                isRecording 
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 hover:bg-red-600 scale-[1.02]'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 hover:scale-[1.02]'
              } disabled:opacity-40 disabled:shadow-none disabled:scale-100`}
            >
              {isRecording ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  {isAiSpeaking ? 'Wait for AI to finish...' : 'Record Answer'}
                </>
              )}
            </button>

            {/* Input + Send */}
            <form
              className="flex gap-2"
              onSubmit={handleSendMessage}
            >
              <input
                type="text"
                placeholder={isRecording ? 'Listening...' : 'Type or edit your answer...'}
                className="flex-1 px-4 py-2.5 bg-gray-50/80 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 focus:outline-none text-sm transition-all"
                value={transcript}
                onChange={(e) => {
                  setTranscript(e.target.value);
                  transcriptRef.current = e.target.value;
                  finalizedTextRef.current = e.target.value;
                }}
                disabled={isProcessing}
              />
              <button
                type="submit"
                disabled={isProcessing || !transcript.trim()}
                className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:shadow-lg hover:shadow-indigo-500/30 disabled:opacity-40 disabled:shadow-none transition-all duration-200 flex items-center gap-2"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        </div>

        {/* End Interview */}
        <button 
          onClick={() => {
            if (window.confirm("Are you sure you want to end the interview? Your answers will be graded by AI.")) {
              stopRecording();
              window.speechSynthesis.cancel();
              endInterviewMutation.mutate();
            }
          }}
          disabled={endInterviewMutation.isPending}
          className="w-full py-3 bg-red-50 text-red-600 font-bold text-sm rounded-xl hover:bg-red-100 border border-red-200/60 transition-all duration-200"
        >
          {endInterviewMutation.isPending ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Grading...</span>
          ) : 'End Interview & Submit'}
        </button>
      </div>

      {/* ═══════ RIGHT PANEL — Chat Transcript ═══════ */}
      <div className="flex-1 bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200/60 flex flex-col overflow-hidden min-w-0">
        <div className="px-5 py-3.5 border-b border-gray-200/60 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-4.5 h-4.5 text-indigo-500" />
            <h3 className="font-bold text-gray-800 text-sm">Interview Transcript</h3>
          </div>
          <div className="text-[11px] text-gray-400 font-medium">
            {answerCount} answers · {questionCount} questions
          </div>
        </div>
        
        <div className="flex-1 px-5 py-4 overflow-y-auto flex flex-col gap-3">
          {messages.length === 0 && !isProcessing && (
            <div className="m-auto text-center text-gray-400">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-indigo-400" />
              </div>
              <p className="font-medium text-gray-600 mb-1">Preparing your interview...</p>
              <p className="text-xs text-gray-400">The AI interviewer will start in a moment</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-tr-md shadow-lg shadow-indigo-500/15' 
                  : 'bg-gray-100/80 text-gray-800 rounded-tl-md border border-gray-200/50'
              }`}>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="w-3 h-3 text-indigo-500" />
                    <span className="text-[10px] text-indigo-500 font-semibold uppercase tracking-wider">Interviewer</span>
                  </div>
                )}
                {msg.content}
              </div>
            </div>
          ))}

          {/* Live transcript preview */}
          {transcript && !isProcessing && (
            <div className="flex w-full justify-end">
              <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-indigo-50 text-indigo-700 rounded-tr-md border border-indigo-200/50 text-[13.5px] leading-relaxed">
                <div className="flex items-center gap-1.5 mb-1.5">
                  {isRecording && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                  )}
                  <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">
                    {isRecording ? 'Recording...' : 'Draft - Ready to send'}
                  </span>
                </div>
                {transcript}
              </div>
            </div>
          )}

          {isProcessing && (
            <div className="flex w-full justify-start">
              <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-gray-100/80 text-gray-600 rounded-tl-md border border-gray-200/50 flex items-center gap-2.5 text-[13.5px]">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                <span className="italic">Interviewer is thinking...</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>
    </div>
  );
}
