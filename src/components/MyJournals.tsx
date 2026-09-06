import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Mic, 
  FileText, 
  UploadCloud, 
  Search, 
  Calendar, 
  Smile, 
  ArrowUpDown, 
  Sparkles, 
  MoreVertical, 
  Trash2, 
  Edit3, 
  Copy, 
  Check, 
  X, 
  Code, 
  GraduationCap, 
  Briefcase, 
  RefreshCw, 
  ChevronDown,
  BookOpen,
  Send,
  Loader2,
  AlertCircle,
  Square,
  Volume2,
  MicOff
} from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { 
  JournalEntry, 
  subscribeToJournalsWithFilter, 
  createJournalEntry, 
  updateJournalEntry, 
  deleteJournalEntry 
} from '../services/dashboardService';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

interface MyJournalsProps {
  user: any;
  onNavigateBack: () => void;
  showToast?: (message: string) => void;
}

type RoleType = 'Developer' | 'Student' | 'Professional';

const MOOD_OPTIONS = [
  { id: 'Calm', label: 'Calm', emoji: '😌', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { id: 'Motivated', label: 'Motivated', emoji: '🔥', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { id: 'Focused', label: 'Focused', emoji: '🎯', color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
  { id: 'Happy', label: 'Happy', emoji: '😊', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
  { id: 'Stressed', label: 'Stressed', emoji: '😰', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  { id: 'Sad', label: 'Sad', emoji: '😢', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' }
];

export const MyJournals: React.FC<MyJournalsProps> = ({ user, onNavigateBack, showToast }) => {
  // Current active user ID with resilient multi-tier fallback
  const activeUid = user?.uid || auth.currentUser?.uid || (() => {
    try {
      const stored = localStorage.getItem('luma_active_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.uid) return parsed.uid;
      }
    } catch (_) {}
    return 'alex_sharma';
  })();

  // Real-time Profile & Role State
  const [displayName, setDisplayName] = useState<string>(() => {
    if (user?.displayName) return user.displayName;
    if (user?.email) {
      const part = user.email.split('@')[0];
      return part.charAt(0).toUpperCase() + part.slice(1);
    }
    return 'Alex Sharma';
  });
  const [role, setRole] = useState<RoleType>('Developer');
  const [isSwitchingRole, setIsSwitchingRole] = useState<boolean>(false);

  // Real-time Journals State
  const [journalsList, setJournalsList] = useState<JournalEntry[]>([]);
  const [isLoadingJournals, setIsLoadingJournals] = useState<boolean>(true);

  // Filter & Search Pipeline State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [moodFilter, setMoodFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Filter Dropdown Open State
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState<boolean>(false);
  const [isMoodDropdownOpen, setIsMoodDropdownOpen] = useState<boolean>(false);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState<boolean>(false);

  // Modals State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  // Form State for Creating / Editing
  const [entryTitle, setEntryTitle] = useState<string>('');
  const [entryContent, setEntryContent] = useState<string>('');
  const [entryMood, setEntryMood] = useState<string>('Calm');
  const [entryTag, setEntryTag] = useState<string>('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);

  // Real-time Voice Recognition & Audio Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [voiceTranscript, setVoiceTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [voiceSeconds, setVoiceSeconds] = useState<number>(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Expanded AI Summary Cards Map
  const [expandedInsights, setExpandedInsights] = useState<Record<string, boolean>>({});

  // Overflow Menu State
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 1. Real-time User Profile & Role Subscription
  useEffect(() => {
    if (!activeUid) return;

    try {
      const userRef = doc(db, 'users', activeUid);
      const unsub = onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.displayName) {
            setDisplayName(data.displayName);
          } else if (auth.currentUser?.displayName) {
            setDisplayName(auth.currentUser.displayName);
          }

          if (data.role) {
            setRole(data.role as RoleType);
          } else if (data.profile?.persona) {
            if (data.profile.persona === 'BUSY_PRO') setRole('Professional');
            else if (data.profile.persona === 'GROWTH_SEEKER') setRole('Student');
            else setRole('Developer');
          }
        }
      }, (err) => {
        console.warn('User profile realtime sync warning:', err);
      });

      return () => unsub();
    } catch (e) {
      console.warn('Profile listener error:', e);
    }
  }, [activeUid]);

  // 2. Real-time Firestore Journals Subscription
  useEffect(() => {
    if (!activeUid) {
      setJournalsList([]);
      setIsLoadingJournals(false);
      return;
    }

    setIsLoadingJournals(true);
    const unsubscribe = subscribeToJournalsWithFilter(
      activeUid,
      sortOrder,
      (entries) => {
        setJournalsList(entries);
        setIsLoadingJournals(false);
      },
      (err) => {
        console.warn('Journals snapshot warning:', err);
        setIsLoadingJournals(false);
      }
    );

    return () => unsubscribe();
  }, [activeUid, sortOrder]);

  // Handle Switch Role
  const handleSwitchRole = async () => {
    if (!activeUid || isSwitchingRole) return;
    setIsSwitchingRole(true);

    const roleOrder: RoleType[] = ['Developer', 'Student', 'Professional'];
    const currentIndex = roleOrder.indexOf(role);
    const nextRole = roleOrder[(currentIndex + 1) % roleOrder.length];

    try {
      const userRef = doc(db, 'users', activeUid);
      await setDoc(userRef, { role: nextRole, updatedAt: serverTimestamp() }, { merge: true });
      setRole(nextRole);
      if (showToast) showToast(`Role switched to ${nextRole}`);
    } catch (err: any) {
      console.warn('Role switch notice:', err);
      // Optimistic client update fallback
      setRole(nextRole);
      if (showToast) showToast(`Role set to ${nextRole}`);
    } finally {
      setIsSwitchingRole(false);
    }
  };

  // 4. Search & Filtering Pipeline
  const filteredJournals = useMemo(() => {
    let result = [...journalsList];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((entry) => 
        (entry.title && entry.title.toLowerCase().includes(q)) ||
        (entry.content && entry.content.toLowerCase().includes(q)) ||
        (entry.tag && entry.tag.toLowerCase().includes(q)) ||
        (entry.mood && entry.mood.toLowerCase().includes(q))
      );
    }

    // Mood filter
    if (moodFilter !== 'all') {
      result = result.filter((entry) => 
        entry.mood?.toLowerCase() === moodFilter.toLowerCase()
      );
    }

    // Date range filter
    if (dateFilter !== 'all') {
      const now = new Date();
      result = result.filter((entry) => {
        let entryDate: Date | null = null;
        if (entry.createdAt?.toDate) {
          entryDate = entry.createdAt.toDate();
        } else if (entry.createdAt?.seconds) {
          entryDate = new Date(entry.createdAt.seconds * 1000);
        }

        if (!entryDate) return true;

        if (dateFilter === 'today') {
          return entryDate.toDateString() === now.toDateString();
        } else if (dateFilter === 'week') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return entryDate >= weekAgo;
        } else if (dateFilter === 'month') {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          return entryDate >= monthAgo;
        }
        return true;
      });
    }

    return result;
  }, [journalsList, searchQuery, moodFilter, dateFilter]);

  // Quick Action Handler (automatically calls Gemini API, drafts entry, and opens creation modal)
  const handleQuickAction = async (actionLabel: string) => {
    setIsGeneratingAI(true);
    setEntryTitle(actionLabel);
    setEntryMood('Focused');
    setEntryTag(role);
    setEditingEntryId(null);
    setIsCreateModalOpen(true);

    try {
      const resp = await fetch('/api/ai/quick-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: actionLabel,
          role,
          userName: displayName,
          userPrompt: `Focus on actionable reflections for a ${role}.`
        })
      });

      const data = await resp.json();
      if (data.success && data.content) {
        // Extract title if starts with #
        const lines = data.content.split('\n');
        let parsedTitle = actionLabel;
        let parsedBody = data.content;

        if (lines[0] && lines[0].startsWith('# ')) {
          parsedTitle = lines[0].replace('# ', '').trim();
          parsedBody = lines.slice(1).join('\n').trim();
        }

        setEntryTitle(parsedTitle);
        setEntryContent(parsedBody);
        if (showToast) showToast('AI generated a structured journal draft for you!');
      }
    } catch (err) {
      console.warn('AI Quick Action notice:', err);
      // Fallback draft
      setEntryContent(`Summary of ${actionLabel}:\n\n- Key Progress: Addressed core milestone items.\n- Reflection: Steady execution leads to compounding success.\n\nLUMA AI Insight: Consistency and clarity define progress.`);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // AI Polish / Expansion inside Modal
  const handleAIEnhance = async () => {
    if (!entryTitle && !entryContent) {
      if (showToast) showToast('Please enter a title or a few thoughts first.');
      return;
    }

    setIsGeneratingAI(true);
    try {
      const resp = await fetch('/api/ai/quick-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: entryTitle || 'Daily Reflection',
          role,
          userName: displayName,
          userPrompt: entryContent || 'Expand on this thought.'
        })
      });

      const data = await resp.json();
      if (data.success && data.content) {
        const lines = data.content.split('\n');
        let parsedBody = data.content;
        if (lines[0] && lines[0].startsWith('# ')) {
          parsedBody = lines.slice(1).join('\n').trim();
        }
        setEntryContent(parsedBody);
        if (showToast) showToast('Entry enriched with LUMA AI insights!');
      }
    } catch (err) {
      console.warn('AI Enhance notice:', err);
      if (showToast) showToast('AI assistance unavailable right now.');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Save Journal Entry with Real-Time Multi-Tier Persistence
  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryTitle.trim() && !entryContent.trim()) {
      if (showToast) showToast('Please write something before saving.');
      return;
    }

    const effectiveUid = activeUid || user?.uid || auth.currentUser?.uid || 'alex_sharma';

    setIsSaving(true);
    try {
      const cleanTitle = entryTitle.trim() || 'Daily Reflection';
      const cleanContent = entryContent.trim();
      
      // Auto-extract or generate AI Insight snippet
      let aiInsight = '';
      if (cleanContent.includes('LUMA AI Insight:')) {
        const parts = cleanContent.split('LUMA AI Insight:');
        aiInsight = parts[1]?.trim() || '';
      } else {
        aiInsight = `LUMA Insight: Reflection completed on ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. Momentum is building!`;
      }

      if (editingEntryId) {
        await updateJournalEntry(effectiveUid, editingEntryId, {
          title: cleanTitle,
          content: cleanContent,
          mood: entryMood,
          tag: entryTag || role,
          role,
          aiInsight
        });
        if (showToast) showToast('Journal updated successfully in real time!');
      } else {
        await createJournalEntry(effectiveUid, {
          title: cleanTitle,
          content: cleanContent,
          mood: entryMood,
          tag: entryTag || role,
          role,
          aiInsight
        });
        if (showToast) showToast('New journal saved to your timeline in real time!');
      }

      // Reset and close
      setIsCreateModalOpen(false);
      setEditingEntryId(null);
      setEntryTitle('');
      setEntryContent('');
      setEntryMood('Calm');
      setEntryTag('');
    } catch (err: any) {
      console.error('Error saving journal:', err);
      if (showToast) showToast('Failed to save journal. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Journal from Firestore
  const handleDeleteEntry = async (entryId: string) => {
    if (!window.confirm('Are you sure you want to delete this journal entry?')) return;
    try {
      await deleteJournalEntry(activeUid, entryId);
      setActiveMenuId(null);
      if (isDetailModalOpen && selectedEntry?.id === entryId) {
        setIsDetailModalOpen(false);
      }
      if (showToast) showToast('Journal entry deleted.');
    } catch (err) {
      console.error('Error deleting journal:', err);
      if (showToast) showToast('Could not delete entry.');
    }
  };

  // Open Edit Modal
  const handleEditClick = (entry: JournalEntry) => {
    setEditingEntryId(entry.id);
    setEntryTitle(entry.title);
    setEntryContent(entry.content);
    setEntryMood(entry.mood || 'Calm');
    setEntryTag(entry.tag || role);
    setActiveMenuId(null);
    setIsDetailModalOpen(false);
    setIsCreateModalOpen(true);
  };

  // Copy Content
  const handleCopyContent = (entry: JournalEntry) => {
    navigator.clipboard.writeText(`${entry.title}\n\n${entry.content}`);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 2000);
    if (showToast) showToast('Journal copied to clipboard!');
  };

  // Toggle AI Insight Expansion
  const toggleInsight = (id: string) => {
    setExpandedInsights((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Stop and cleanup all active audio streams and recognition instances
  const stopAllRecordingStreams = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (_) {}
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
    }

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch (_) {}
      streamRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (_) {}
      audioContextRef.current = null;
    }

    setIsRecording(false);
    setAudioLevel(0);
  };

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stopAllRecordingStreams();
    };
  }, []);

  // Voice Recording Timer
  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setVoiceSeconds((s) => s + 1);
      }, 1000);
    } else {
      setVoiceSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Transcribe recorded audio with Gemini AI
  const transcribeRecordedAudio = async (blobOverride?: Blob, mimeOverride?: string) => {
    let blob = blobOverride;
    if (!blob && audioChunksRef.current.length > 0) {
      blob = new Blob(audioChunksRef.current, { type: mimeOverride || 'audio/webm' });
    }
    if (!blob || blob.size === 0) {
      if (showToast) showToast('No recorded voice audio found to transcribe.');
      return;
    }

    setIsTranscribing(true);
    setVoiceError(null);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const res = reader.result as string;
          resolve(res);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);
      const base64Data = await base64Promise;

      const resp = await fetch('/api/ai/transcribe-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64Data,
          mimeType: blob.type || 'audio/webm'
        })
      });

      const data = await resp.json();
      if (resp.ok && data.transcript) {
        setVoiceTranscript(data.transcript);
        setInterimTranscript('');
        if (showToast) showToast('Voice accurately transcribed with AI!');
      } else if (data.error) {
        setVoiceError(data.error);
      }
    } catch (err: any) {
      console.warn('Audio transcription error:', err);
      setVoiceError('Could not connect to AI transcription. You can type or edit your reflection directly.');
    } finally {
      setIsTranscribing(false);
    }
  };

  // Toggle Live Voice Recording & Speech-to-Text
  const toggleRecording = async () => {
    if (isRecording) {
      stopAllRecordingStreams();
      if (showToast) showToast('Recording completed.');
      return;
    }

    setVoiceError(null);
    setInterimTranscript('');
    audioChunksRef.current = [];

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setVoiceError('Microphone access is not supported in this browser environment.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Audio visualizer setup
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateVolume = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
            animationFrameRef.current = requestAnimationFrame(updateVolume);
          };
          updateVolume();
        }
      } catch (visErr) {
        console.warn('Visualizer setup notice:', visErr);
      }

      // MediaRecorder setup for Gemini STT backup
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
        else mimeType = '';
      }

      try {
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        recorder.onstop = () => {
          if (audioChunksRef.current.length > 0) {
            const recordedBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
            setVoiceTranscript((curr) => {
              if (!curr.trim()) {
                transcribeRecordedAudio(recordedBlob, mimeType || 'audio/webm');
              }
              return curr;
            });
          }
        };
        recorder.start(250);
        mediaRecorderRef.current = recorder;
      } catch (recErr) {
        console.warn('MediaRecorder notice:', recErr);
      }

      // Web Speech API real-time listening
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = navigator.language || 'en-US';

          recognition.onstart = () => {
            setIsRecording(true);
            setVoiceError(null);
          };

          recognition.onresult = (event: any) => {
            let finalStr = '';
            let interimStr = '';
            for (let i = 0; i < event.results.length; ++i) {
              const res = event.results[i];
              if (res.isFinal) {
                finalStr += res[0].transcript + ' ';
              } else {
                interimStr += res[0].transcript;
              }
            }

            setInterimTranscript(interimStr);
            if (finalStr.trim()) {
              setVoiceTranscript(finalStr.trim());
            }
          };

          recognition.onerror = (event: any) => {
            console.warn('Speech recognition warning:', event.error);
            if (event.error === 'not-allowed' || event.error === 'permission-denied') {
              setVoiceError('Microphone permission was denied. Please allow microphone access in your browser address bar.');
            }
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch (speechErr) {
          console.warn('SpeechRecognition startup notice:', speechErr);
        }
      }

      setIsRecording(true);
      if (showToast) showToast('Listening... Speak your thoughts naturally!');
    } catch (err: any) {
      console.error('Microphone access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setVoiceError('Microphone permission was blocked. Please click the lock/settings icon in your browser address bar and enable Microphone.');
      } else {
        setVoiceError('Microphone unavailable: ' + (err.message || 'Check audio hardware.'));
      }
      stopAllRecordingStreams();
    }
  };

  const handleApplyVoice = () => {
    const textToInsert = (voiceTranscript.trim() || interimTranscript.trim());
    if (!textToInsert) {
      if (showToast) showToast('No speech captured yet. Speak into your microphone first.');
      return;
    }
    stopAllRecordingStreams();
    setEntryTitle('Voice Reflection - ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    setEntryContent(textToInsert);
    setEntryMood('Focused');
    setIsVoiceModalOpen(false);
    setIsCreateModalOpen(true);
    if (showToast) showToast('Voice transcript inserted into journal!');
  };

  // Quick Action Chips Data based on Active Role
  const roleActions = useMemo(() => {
    if (role === 'Developer') {
      return [
        { label: "Summarize today's code commits", icon: Code },
        { label: 'Draft project standup note', icon: FileText },
        { label: 'Log bug resolution', icon: Sparkles }
      ];
    } else if (role === 'Student') {
      return [
        { label: 'Summarize lecture takeaways', icon: GraduationCap },
        { label: 'Draft exam revision plan', icon: FileText },
        { label: 'Note project milestone', icon: Sparkles }
      ];
    } else {
      return [
        { label: 'Executive meeting debrief', icon: Briefcase },
        { label: 'Weekly priorities reflection', icon: FileText },
        { label: 'Client interaction log', icon: Sparkles }
      ];
    }
  }, [role]);

  return (
    <div className="w-full min-h-screen bg-[#0E0E10] text-[#E0E0E0] flex flex-col font-sans selection:bg-[#EA580C]/30 selection:text-orange-200">
      
      {/* Top Breadcrumb & Return Row */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateBack}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800/80 hover:border-neutral-700 transition-all text-xs sm:text-sm font-medium shadow-sm group"
            title="Return to Dashboard"
          >
            <ArrowLeft className="w-4 h-4 text-orange-400 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Dashboard</span>
          </button>
          <span className="text-neutral-600 font-mono text-xs hidden sm:inline">&gt;</span>
          <span className="text-neutral-400 text-xs sm:text-sm font-medium hidden sm:inline">My Journals</span>
        </div>

        {/* Real-time sync badge */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Real-Time Sync Active</span>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-12 flex flex-col gap-6">

        {/* 1. Page Header & Profile Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          
          {/* Left Title & Subtitle */}
          <div className="lg:col-span-8 flex flex-col justify-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white font-serif-luma">
              My Journals
            </h1>
            <p className="text-neutral-400 text-sm sm:text-base mt-2 max-w-xl font-normal">
              Your thoughts, ideas, progress and everything in between.
            </p>
          </div>

          {/* Right Header Greeting Card (matching image.png) */}
          <div className="lg:col-span-4 relative rounded-2xl overflow-hidden p-5 border border-orange-500/20 bg-gradient-to-br from-[#1C1613] via-[#151314] to-[#121113] shadow-lg shadow-black/40 flex items-center justify-between">
            {/* Background glowing silk accents */}
            <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-orange-500/15 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-500/10 via-transparent to-transparent pointer-events-none" />

            <div className="relative z-10 flex items-center gap-4">
              {/* Role Icon Box */}
              <div className="w-12 h-12 rounded-xl bg-[#231B16] border border-orange-500/30 flex items-center justify-center text-orange-400 shadow-inner">
                {role === 'Developer' && <Code className="w-6 h-6 text-orange-400" />}
                {role === 'Student' && <GraduationCap className="w-6 h-6 text-orange-400" />}
                {role === 'Professional' && <Briefcase className="w-6 h-6 text-orange-400" />}
              </div>

              <div>
                <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight flex items-center gap-1.5">
                  <span>Hi, {displayName}!</span>
                  <span className="text-base">👋</span>
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wider bg-orange-500/15 text-orange-400 border border-orange-500/25">
                    {role}
                  </span>
                  <span className="text-xs text-neutral-400">Personal Workspace</span>
                </div>
              </div>
            </div>

            {/* Glowing LUMA Mark */}
            <div className="relative z-10 opacity-70 hover:opacity-100 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-orange-400" />
              </div>
            </div>
          </div>
        </div>

        {/* 2. Action Buttons Row (matching image.png) */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Primary + New Journal Button */}
          <button
            onClick={() => {
              setEditingEntryId(null);
              setEntryTitle('');
              setEntryContent('');
              setEntryMood('Calm');
              setEntryTag(role);
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-[#FD6B31] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white font-medium text-sm shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Journal</span>
          </button>

          {/* Voice Entry Button */}
          <button
            id="my-journals-voice-entry-btn"
            onClick={() => {
              setVoiceError(null);
              setIsVoiceModalOpen(true);
            }}
            className="group relative flex items-center gap-2.5 px-4.5 py-2.5 rounded-full bg-gradient-to-r from-neutral-900 via-neutral-900/95 to-neutral-850 hover:from-neutral-850 hover:via-neutral-800 hover:to-neutral-750 text-neutral-200 hover:text-white border border-orange-500/30 hover:border-orange-500/60 text-sm font-medium shadow-md shadow-orange-950/20 hover:shadow-orange-500/10 active:scale-[0.97] transition-all duration-200 cursor-pointer"
            title="Dictate your thoughts using real-time speech-to-text"
          >
            <span className="relative flex items-center justify-center w-5 h-5 rounded-full bg-orange-500/15 group-hover:bg-orange-500/25 transition-colors">
              <Mic className="w-3.5 h-3.5 text-orange-400 group-hover:text-orange-300 transition-transform group-hover:scale-110" />
              {isRecording && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-ping" />
              )}
            </span>
            <span className="tracking-wide">Voice Entry</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-400 font-mono font-medium border border-orange-500/20 group-hover:bg-orange-500/30">
              Live
            </span>
          </button>

          {/* Quick Note Button */}
          <button
            onClick={() => {
              setEditingEntryId(null);
              setEntryTitle('Quick Thought');
              setEntryContent('');
              setEntryMood('Calm');
              setEntryTag(role);
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-neutral-900/90 hover:bg-neutral-800 text-neutral-200 hover:text-white border border-neutral-800 hover:border-neutral-700 text-sm font-medium shadow-sm transition-all"
          >
            <FileText className="w-4 h-4 text-neutral-400" />
            <span>Quick Note</span>
          </button>

          {/* Upload File Button */}
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-neutral-900/90 hover:bg-neutral-800 text-neutral-200 hover:text-white border border-neutral-800 hover:border-neutral-700 text-sm font-medium shadow-sm transition-all"
          >
            <UploadCloud className="w-4 h-4 text-neutral-400" />
            <span>Upload File</span>
          </button>
        </div>

        {/* 3. Quick Actions for Role Card (matching image.png) */}
        <div className="relative rounded-2xl bg-[#141416] border border-neutral-800/90 p-5 shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <h2 className="text-sm sm:text-base font-semibold text-white tracking-tight">
                Quick Actions for {role}s
              </h2>
            </div>

            {/* Switch Role Button */}
            <button
              onClick={handleSwitchRole}
              disabled={isSwitchingRole}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700/80 text-xs font-medium transition-all self-start sm:self-auto disabled:opacity-50"
              title="Change your active workspace role"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-orange-400 ${isSwitchingRole ? 'animate-spin' : ''}`} />
              <span>Switch Role</span>
            </button>
          </div>

          {/* Role Action Chips */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {roleActions.map((action, idx) => {
              const ActionIcon = action.icon;
              return (
                <button
                  key={idx}
                  onClick={() => handleQuickAction(action.label)}
                  disabled={isGeneratingAI}
                  className="group relative flex items-center gap-3 p-3 rounded-xl bg-neutral-900/60 hover:bg-neutral-800/90 border border-neutral-800/80 hover:border-orange-500/30 text-left transition-all hover:scale-[1.01]"
                >
                  <div className="w-8 h-8 rounded-lg bg-neutral-800 group-hover:bg-orange-500/10 border border-neutral-700/60 group-hover:border-orange-500/20 flex items-center justify-center text-neutral-400 group-hover:text-orange-400 transition-colors shrink-0">
                    <ActionIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-neutral-200 group-hover:text-white truncate">
                      {action.label}
                    </p>
                    <p className="text-[11px] text-neutral-500 group-hover:text-orange-400/80 flex items-center gap-1 mt-0.5">
                      <span>✨ Auto-generate with AI</span>
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Search & Filter Bar (matching image.png) */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2">
          
          {/* Search Input */}
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search entries, tags or keywords..."
              className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-[#141416] border border-neutral-800 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Dropdown Filters Row */}
          <div className="flex flex-wrap items-center gap-2.5">
            
            {/* Date Range Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsDateDropdownOpen(!isDateDropdownOpen);
                  setIsMoodDropdownOpen(false);
                  setIsSortDropdownOpen(false);
                }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#141416] border border-neutral-800 hover:border-neutral-700 text-xs sm:text-sm font-medium text-neutral-300 hover:text-white transition-all"
              >
                <Calendar className="w-4 h-4 text-neutral-400" />
                <span className="capitalize">{dateFilter === 'all' ? 'Date Range' : dateFilter}</span>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
              </button>

              {isDateDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-40 rounded-xl bg-[#18181B] border border-neutral-700/80 shadow-xl py-1 z-30">
                  {[
                    { id: 'all', label: 'All Dates' },
                    { id: 'today', label: 'Today' },
                    { id: 'week', label: 'This Week' },
                    { id: 'month', label: 'This Month' }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setDateFilter(opt.id as any);
                        setIsDateDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-xs transition-colors flex items-center justify-between ${
                        dateFilter === opt.id ? 'text-orange-400 bg-orange-500/10 font-semibold' : 'text-neutral-300 hover:bg-neutral-800'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {dateFilter === opt.id && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mood Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsMoodDropdownOpen(!isMoodDropdownOpen);
                  setIsDateDropdownOpen(false);
                  setIsSortDropdownOpen(false);
                }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#141416] border border-neutral-800 hover:border-neutral-700 text-xs sm:text-sm font-medium text-neutral-300 hover:text-white transition-all"
              >
                <Smile className="w-4 h-4 text-neutral-400" />
                <span className="capitalize">{moodFilter === 'all' ? 'All Moods' : moodFilter}</span>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
              </button>

              {isMoodDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-[#18181B] border border-neutral-700/80 shadow-xl py-1 z-30">
                  <button
                    onClick={() => {
                      setMoodFilter('all');
                      setIsMoodDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-xs transition-colors flex items-center justify-between ${
                      moodFilter === 'all' ? 'text-orange-400 bg-orange-500/10 font-semibold' : 'text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <span>All Moods</span>
                    {moodFilter === 'all' && <Check className="w-3.5 h-3.5" />}
                  </button>
                  {MOOD_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setMoodFilter(opt.id);
                        setIsMoodDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-xs transition-colors flex items-center justify-between ${
                        moodFilter === opt.id ? 'text-orange-400 bg-orange-500/10 font-semibold' : 'text-neutral-300 hover:bg-neutral-800'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span>{opt.emoji}</span>
                        <span>{opt.label}</span>
                      </span>
                      {moodFilter === opt.id && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsSortDropdownOpen(!isSortDropdownOpen);
                  setIsDateDropdownOpen(false);
                  setIsMoodDropdownOpen(false);
                }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#141416] border border-neutral-800 hover:border-neutral-700 text-xs sm:text-sm font-medium text-neutral-300 hover:text-white transition-all"
              >
                <ArrowUpDown className="w-4 h-4 text-orange-400" />
                <span>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
              </button>

              {isSortDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-40 rounded-xl bg-[#18181B] border border-neutral-700/80 shadow-xl py-1 z-30">
                  <button
                    onClick={() => {
                      setSortOrder('desc');
                      setIsSortDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-xs transition-colors flex items-center justify-between ${
                      sortOrder === 'desc' ? 'text-orange-400 bg-orange-500/10 font-semibold' : 'text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <span>Newest First</span>
                    {sortOrder === 'desc' && <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => {
                      setSortOrder('asc');
                      setIsSortDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-xs transition-colors flex items-center justify-between ${
                      sortOrder === 'asc' ? 'text-orange-400 bg-orange-500/10 font-semibold' : 'text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <span>Oldest First</span>
                    {sortOrder === 'asc' && <Check className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* 5. Main Canvas: Dynamic State (Empty Wireframe vs. Populated Cards) */}
        {isLoadingJournals ? (
          <div className="w-full py-24 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <p className="text-sm text-neutral-400">Loading your real-time journals...</p>
          </div>
        ) : filteredJournals.length === 0 && journalsList.length === 0 ? (
          
          /* --- EMPTY STATE WIREFRAME (EXACTLY MATCHING image.png) --- */
          <div className="w-full py-16 sm:py-24 flex flex-col items-center justify-center text-center px-4 relative">
            
            {/* Ambient Background Warm Glow */}
            <div className="absolute w-72 h-72 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />

            {/* Open Notebook & Fountain Pen Luxury Graphic (matching image.png) */}
            <div className="relative mb-6">
              <svg width="240" height="150" viewBox="0 0 240 150" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-[0_15px_30px_rgba(234,88,12,0.15)]">
                {/* Ambient glow under notebook */}
                <ellipse cx="120" cy="115" rx="100" ry="25" fill="#EA580C" fillOpacity="0.15" filter="blur(15px)" />
                
                {/* Notebook Back Cover */}
                <path d="M 25 110 Q 120 125 215 110 L 220 50 Q 120 62 20 50 Z" fill="#1C1816" stroke="#422415" strokeWidth="2" />
                
                {/* Left Page with gentle curve */}
                <path d="M 30 102 Q 80 108 120 105 L 120 45 Q 80 48 30 42 Z" fill="#F4EFEA" />
                <path d="M 32 100 Q 80 106 118 103 L 118 47 Q 80 50 32 44 Z" fill="#FFFDF9" />
                
                {/* Right Page */}
                <path d="M 120 105 Q 160 108 210 102 L 210 42 Q 160 48 120 45 Z" fill="#F4EFEA" />
                <path d="M 122 103 Q 160 106 208 100 L 208 44 Q 160 50 122 47 Z" fill="#FFFDF9" />
                
                {/* Center Book Spine Crease & Ribbon */}
                <line x1="120" y1="45" x2="120" y2="105" stroke="#D1C7BD" strokeWidth="2" strokeLinecap="round" />
                <path d="M 120 105 Q 115 125 125 140" stroke="#EA580C" strokeWidth="3" strokeLinecap="round" />

                {/* Journal Ruled Lines on Left Page */}
                <line x1="45" y1="58" x2="105" y2="60" stroke="#E5DDD5" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="45" y1="68" x2="105" y2="70" stroke="#E5DDD5" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="45" y1="78" x2="105" y2="80" stroke="#E5DDD5" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="45" y1="88" x2="95" y2="90" stroke="#E5DDD5" strokeWidth="1.5" strokeLinecap="round" />

                {/* Journal Ruled Lines on Right Page */}
                <line x1="135" y1="60" x2="195" y2="58" stroke="#E5DDD5" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="135" y1="70" x2="195" y2="68" stroke="#E5DDD5" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="135" y1="80" x2="195" y2="78" stroke="#E5DDD5" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="135" y1="90" x2="180" y2="88" stroke="#E5DDD5" strokeWidth="1.5" strokeLinecap="round" />

                {/* Luxury Fountain Pen Resting Across */}
                <g transform="rotate(-25 150 75)">
                  {/* Pen Body */}
                  <rect x="70" y="70" width="100" height="7" rx="3.5" fill="#1A1A1A" stroke="#2D2D2D" strokeWidth="1" />
                  {/* Gold Pen Trim */}
                  <rect x="145" y="69.5" width="4" height="8" rx="1" fill="#F59E0B" />
                  <rect x="85" y="69.5" width="2" height="8" rx="0.5" fill="#F59E0B" />
                  {/* Gold Nib */}
                  <path d="M 68 73.5 L 58 71.5 L 52 73.5 L 58 75.5 Z" fill="#F59E0B" stroke="#D97706" strokeWidth="0.5" />
                </g>

                {/* Floating Orange Embers / Leaves particles */}
                <circle cx="55" cy="35" r="2.5" fill="#EA580C" opacity="0.8" />
                <circle cx="185" cy="30" r="3" fill="#F97316" opacity="0.7" />
                <circle cx="210" cy="80" r="2" fill="#FBBF24" opacity="0.8" />
                <circle cx="35" cy="85" r="2" fill="#EA580C" opacity="0.6" />
                <path d="M 190 32 Q 195 25 190 20 Q 185 25 190 32 Z" fill="#EA580C" opacity="0.7" />
              </svg>
            </div>

            {/* Typography (matching image.png) */}
            <h2 className="text-2xl sm:text-3xl font-normal text-white font-serif-luma tracking-tight">
              Your Journal is waiting
            </h2>
            <p className="text-neutral-400 text-sm sm:text-base mt-2 max-w-md font-normal">
              Capture your thoughts, ideas, learnings and make today meaningful.
            </p>

            {/* CTA Button (matching image.png) */}
            <button
              onClick={() => {
                setEditingEntryId(null);
                setEntryTitle('');
                setEntryContent('');
                setEntryMood('Calm');
                setEntryTag(role);
                setIsCreateModalOpen(true);
              }}
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#FD6B31] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white font-medium text-sm shadow-xl shadow-orange-500/30 hover:scale-105 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Write Your First Journal</span>
            </button>
          </div>

        ) : filteredJournals.length === 0 ? (
          
          /* No search results state */
          <div className="w-full py-16 text-center">
            <p className="text-neutral-400 text-sm">No journals match your current search and filter criteria.</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setMoodFilter('all');
                setDateFilter('all');
              }}
              className="mt-3 px-4 py-1.5 rounded-lg bg-neutral-800 text-xs text-neutral-200 hover:text-white"
            >
              Clear All Filters
            </button>
          </div>

        ) : (
          
          /* --- POPULATED LIVE CARD GRID --- */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredJournals.map((entry) => {
              const moodConfig = MOOD_OPTIONS.find((m) => m.id.toLowerCase() === entry.mood?.toLowerCase()) || MOOD_OPTIONS[0];
              const isExpanded = !!expandedInsights[entry.id];

              return (
                <div
                  key={entry.id}
                  className="group relative rounded-2xl bg-[#141416] hover:bg-[#18181B] border border-neutral-800/90 hover:border-neutral-700 p-5 flex flex-col justify-between transition-all duration-200 shadow-sm hover:shadow-xl hover:shadow-black/40"
                >
                  {/* Top Metadata Row */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Role Tag */}
                        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700/60">
                          #{entry.role || role}
                        </span>

                        {/* Mood Badge */}
                        <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold border flex items-center gap-1 ${moodConfig.color}`}>
                          <span>{moodConfig.emoji}</span>
                          <span>#{entry.mood || 'Calm'}</span>
                        </span>
                      </div>

                      {/* Created Timestamp */}
                      <span className="text-xs text-neutral-500 font-mono">
                        {entry.formattedDate}
                      </span>
                    </div>

                    {/* Entry Title */}
                    <h3 
                      onClick={() => {
                        setSelectedEntry(entry);
                        setIsDetailModalOpen(true);
                      }}
                      className="text-base sm:text-lg font-semibold text-white group-hover:text-orange-200 transition-colors cursor-pointer line-clamp-1"
                    >
                      {entry.title}
                    </h3>

                    {/* Text Preview */}
                    <p 
                      onClick={() => {
                        setSelectedEntry(entry);
                        setIsDetailModalOpen(true);
                      }}
                      className="text-xs sm:text-sm text-neutral-400 mt-2 line-clamp-3 cursor-pointer leading-relaxed"
                    >
                      {entry.content}
                    </p>
                  </div>

                  {/* Bottom Area: AI Summary & Overflow Menu */}
                  <div className="mt-4 pt-3 border-t border-neutral-800/70 flex flex-col gap-2.5">
                    
                    {/* Expandable Gemini AI Summary Banner */}
                    {entry.aiInsight && (
                      <div className="rounded-xl bg-orange-500/5 border border-orange-500/15 p-2.5 transition-all">
                        <button
                          onClick={() => toggleInsight(entry.id)}
                          className="w-full flex items-center justify-between text-left text-xs font-medium text-orange-400 hover:text-orange-300"
                        >
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                            <span>LUMA AI Summary</span>
                          </span>
                          <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                            {isExpanded ? 'Hide' : 'Expand'}
                          </span>
                        </button>

                        {isExpanded && (
                          <p className="text-xs text-neutral-300 mt-2 leading-relaxed pl-5 border-l border-orange-500/30 animate-fadeIn">
                            {entry.aiInsight}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between text-xs text-neutral-400">
                      <button
                        onClick={() => {
                          setSelectedEntry(entry);
                          setIsDetailModalOpen(true);
                        }}
                        className="text-xs text-neutral-400 hover:text-white font-medium flex items-center gap-1 group/btn"
                      >
                        <span>Read full entry</span>
                        <span className="group-hover/btn:translate-x-0.5 transition-transform">&rarr;</span>
                      </button>

                      {/* Actions Menu */}
                      <div className="relative">
                        <button
                          onClick={() => setActiveMenuId(activeMenuId === entry.id ? null : entry.id)}
                          className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {activeMenuId === entry.id && (
                          <div className="absolute right-0 bottom-full mb-1 w-36 rounded-xl bg-[#18181B] border border-neutral-700 shadow-xl py-1 z-20">
                            <button
                              onClick={() => handleCopyContent(entry)}
                              className="w-full px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800 flex items-center gap-2"
                            >
                              {copiedId === entry.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedId === entry.id ? 'Copied!' : 'Copy Text'}</span>
                            </button>
                            <button
                              onClick={() => handleEditClick(entry)}
                              className="w-full px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800 flex items-center gap-2"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit Entry</span>
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(entry.id)}
                              className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* --- CREATE / EDIT JOURNAL MODAL --- */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-2xl rounded-3xl bg-[#141416] border border-neutral-800 shadow-2xl p-6 overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {editingEntryId ? 'Edit Journal' : 'Write Journal'}
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Document your reflections in real time
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveEntry} className="flex-1 overflow-y-auto py-4 flex flex-col gap-4">
              
              {/* Title Input */}
              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1">
                  Journal Title
                </label>
                <input
                  type="text"
                  value={entryTitle}
                  onChange={(e) => setEntryTitle(e.target.value)}
                  placeholder="e.g. Deep Work Breakthrough & Architecture"
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-orange-500/50"
                  required
                />
              </div>

              {/* Mood Selector Row */}
              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1.5">
                  How are you feeling?
                </label>
                <div className="flex flex-wrap gap-2">
                  {MOOD_OPTIONS.map((opt) => (
                    <button
                      type="button"
                      key={opt.id}
                      onClick={() => setEntryMood(opt.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all ${
                        entryMood === opt.id 
                          ? `${opt.color} ring-2 ring-orange-500/30` 
                          : 'bg-neutral-900/60 text-neutral-400 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      <span>{opt.emoji}</span>
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Content Textarea */}
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-neutral-400">
                    Reflections & Notes
                  </label>
                  
                  {/* AI Enhance Trigger */}
                  <button
                    type="button"
                    onClick={handleAIEnhance}
                    disabled={isGeneratingAI}
                    className="inline-flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 font-medium disabled:opacity-50"
                  >
                    {isGeneratingAI ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>{isGeneratingAI ? 'Generating...' : '✨ Enhance with LUMA AI'}</span>
                  </button>
                </div>

                <textarea
                  value={entryContent}
                  onChange={(e) => setEntryContent(e.target.value)}
                  rows={8}
                  placeholder="What did you build, learn, or discover today? Any blockers or momentum takeaways?"
                  className="w-full px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-orange-500/50 leading-relaxed resize-none"
                  required
                />
              </div>

              {/* Footer Actions */}
              <div className="pt-3 border-t border-neutral-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-neutral-400 hover:text-white text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="my-journals-save-btn"
                  type="submit"
                  disabled={isSaving || isGeneratingAI}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#FD6B31] via-[#EA580C] to-[#C2410C] hover:from-[#EA580C] hover:to-[#9A3412] active:scale-[0.98] text-white text-sm font-semibold shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Saving in Real-Time...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span>Save Journal</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* --- VOICE ENTRY MODAL --- */}
      {isVoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-lg rounded-3xl bg-[#141416] border border-neutral-800 shadow-2xl p-6 sm:p-7 flex flex-col items-center">
            
            <button
              onClick={() => {
                stopAllRecordingStreams();
                setIsVoiceModalOpen(false);
              }}
              className="absolute right-4 top-4 p-2 rounded-full bg-neutral-900/80 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition-colors"
              title="Close voice recorder"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center max-w-sm">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-medium mb-2">
                <Mic className="w-3.5 h-3.5" />
                <span>Real-Time Speech-to-Text</span>
              </div>
              <h3 className="text-xl font-semibold text-white tracking-tight">
                Voice Reflection
              </h3>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                Speak naturally into your microphone. Your genuine words are captured in real-time.
              </p>
            </div>

            {/* Error Notification */}
            {voiceError && (
              <div className="w-full mt-4 p-3 rounded-2xl bg-red-950/40 border border-red-500/30 flex items-start gap-2.5 text-left text-xs text-red-300">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">{voiceError}</p>
                  <button
                    onClick={toggleRecording}
                    className="mt-1.5 text-[11px] underline text-red-300 hover:text-white font-medium"
                  >
                    Click here to retry microphone
                  </button>
                </div>
              </div>
            )}

            {/* Central Recording Control & Audio Visualizer */}
            <div className="relative my-6 flex flex-col items-center">
              {/* Outer Pulsing Aura */}
              {isRecording && (
                <>
                  <div 
                    className="absolute -inset-3 rounded-full bg-orange-500/15 animate-ping"
                    style={{ animationDuration: '2s' }}
                  />
                  <div 
                    className="absolute -inset-1 rounded-full bg-orange-500/20 blur-md transition-all"
                    style={{ transform: `scale(${1 + audioLevel * 0.005})` }}
                  />
                </>
              )}

              {/* Main Toggle Button */}
              <button
                onClick={toggleRecording}
                className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl cursor-pointer ${
                  isRecording 
                    ? 'bg-gradient-to-tr from-red-600 via-orange-600 to-amber-500 text-white shadow-red-600/30 scale-105 border-2 border-orange-400' 
                    : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700 hover:border-orange-500/50 hover:scale-105'
                }`}
                title={isRecording ? 'Click to stop recording' : 'Click to start speaking'}
              >
                {isRecording ? (
                  <Square className="w-7 h-7 fill-white text-white" />
                ) : (
                  <Mic className="w-8 h-8 text-orange-400" />
                )}
              </button>

              {/* Audio Waveform Equalizer when Recording */}
              {isRecording ? (
                <div className="flex items-center gap-1.5 mt-4 h-6">
                  {[0.4, 0.8, 1.2, 0.9, 0.5, 0.7].map((factor, idx) => {
                    const height = Math.max(6, Math.min(24, Math.round(audioLevel * factor * 0.35)));
                    return (
                      <span 
                        key={idx}
                        className="w-1 rounded-full bg-gradient-to-t from-orange-500 to-amber-400 transition-all duration-75"
                        style={{ height: `${height}px` }}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="h-6 mt-4 flex items-center">
                  <span className="text-xs text-neutral-500 font-medium">Click microphone to start</span>
                </div>
              )}

              {/* Timer & Status Label */}
              <div className="flex items-center gap-2 mt-1">
                {isRecording && (
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                )}
                <span className="text-xs font-mono text-orange-400 font-semibold tracking-wider">
                  {isRecording 
                    ? `REC ${Math.floor(voiceSeconds / 60).toString().padStart(2, '0')}:${(voiceSeconds % 60).toString().padStart(2, '0')}`
                    : voiceTranscript ? 'Speech captured' : 'Ready'
                  }
                </span>
              </div>
            </div>

            {/* Live Editable Transcript Area */}
            <div className="w-full text-left">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-neutral-400 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Your Spoken Words</span>
                </label>
                <div className="flex items-center gap-2">
                  {voiceTranscript && (
                    <button
                      onClick={() => {
                        setVoiceTranscript('');
                        setInterimTranscript('');
                      }}
                      className="text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                  <span className="text-[11px] text-neutral-500 font-mono">
                    {voiceTranscript.trim().split(/\s+/).filter(Boolean).length} words
                  </span>
                </div>
              </div>

              <div className="relative w-full rounded-2xl bg-neutral-900/90 border border-neutral-800 focus-within:border-orange-500/50 transition-colors p-3">
                <textarea
                  value={voiceTranscript}
                  onChange={(e) => setVoiceTranscript(e.target.value)}
                  placeholder={isRecording ? 'Listening... Speak into your microphone now...' : 'Your spoken words will appear here in real-time. You can also edit them freely...'}
                  rows={4}
                  className="w-full bg-transparent text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none resize-none leading-relaxed"
                />

                {/* Live interim speech ghost text */}
                {isRecording && interimTranscript && (
                  <div className="mt-1 pt-1 border-t border-neutral-800/80 text-xs italic text-orange-300/80 flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                    <span>"{interimTranscript}"</span>
                  </div>
                )}
              </div>
            </div>

            {/* Auxiliary Actions & AI STT Fallback */}
            <div className="w-full flex items-center justify-between gap-2 mt-4 pt-4 border-t border-neutral-800/80">
              <button
                type="button"
                onClick={() => transcribeRecordedAudio()}
                disabled={isTranscribing || isRecording || audioChunksRef.current.length === 0}
                className="inline-flex items-center gap-1.5 text-xs text-orange-400/90 hover:text-orange-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Enhance accuracy using Gemini audio speech processing"
              >
                {isTranscribing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>AI Transcribing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Enhance with Gemini AI</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    stopAllRecordingStreams();
                    setIsVoiceModalOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl text-neutral-400 hover:text-white text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyVoice}
                  disabled={!voiceTranscript.trim() && !interimTranscript.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-[#FD6B31] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white text-xs font-medium shadow-md shadow-orange-500/25 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Insert into Journal</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* --- UPLOAD FILE MODAL --- */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md rounded-3xl bg-[#141416] border border-neutral-800 shadow-2xl p-6">
            
            <button
              onClick={() => setIsUploadModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-semibold text-white">
              Upload Notes or Markdown
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              Select or drop a .txt or .md file to create a journal entry.
            </p>

            <div 
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.txt,.md,.json';
                input.onchange = (e: any) => {
                  const file = e.target?.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const text = event.target?.result as string;
                      setEntryTitle(file.name.replace(/\.[^/.]+$/, ''));
                      setEntryContent(text || '');
                      setEntryMood('Focused');
                      setIsUploadModalOpen(false);
                      setIsCreateModalOpen(true);
                    };
                    reader.readAsText(file);
                  }
                };
                input.click();
              }}
              className="my-6 p-8 rounded-2xl border-2 border-dashed border-neutral-700 hover:border-orange-500/60 bg-neutral-900/50 hover:bg-neutral-900 text-center cursor-pointer transition-all group"
            >
              <UploadCloud className="w-10 h-10 text-neutral-500 group-hover:text-orange-400 mx-auto transition-colors" />
              <p className="text-xs text-neutral-300 font-medium mt-3">
                Click to browse files or drag and drop here
              </p>
              <p className="text-[11px] text-neutral-500 mt-1">
                Supports TXT, Markdown, and JSON notes
              </p>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="px-4 py-2 rounded-xl text-neutral-400 hover:text-white text-xs"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* --- ENTRY DETAIL MODAL --- */}
      {isDetailModalOpen && selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-2xl rounded-3xl bg-[#141416] border border-neutral-800 shadow-2xl p-6 sm:p-8 overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-neutral-800">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-neutral-800 text-neutral-300">
                    #{selectedEntry.role || role}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
                    #{selectedEntry.mood}
                  </span>
                  <span className="text-xs text-neutral-500 font-mono">
                    {selectedEntry.formattedDate}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white font-serif-luma">
                  {selectedEntry.title}
                </h2>
              </div>

              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto py-5 flex flex-col gap-4">
              <div className="text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap">
                {selectedEntry.content}
              </div>

              {selectedEntry.aiInsight && (
                <div className="mt-4 p-4 rounded-2xl bg-orange-500/10 border border-orange-500/20">
                  <div className="flex items-center gap-1.5 text-orange-400 text-xs font-semibold mb-1">
                    <Sparkles className="w-4 h-4" />
                    <span>LUMA AI Insight</span>
                  </div>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    {selectedEntry.aiInsight}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-neutral-800 flex items-center justify-between">
              <button
                onClick={() => handleDeleteEntry(selectedEntry.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-red-400 hover:bg-red-500/10 text-xs transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyContent(selectedEntry)}
                  className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors"
                >
                  Copy Text
                </button>
                <button
                  onClick={() => handleEditClick(selectedEntry)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#FD6B31] to-[#EA580C] text-white text-xs font-medium shadow-md shadow-orange-500/20"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Entry</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
