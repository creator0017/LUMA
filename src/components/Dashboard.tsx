import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Menu,
  Home,
  BookOpen,
  Sparkles,
  Target,
  Sprout,
  Settings,
  LogOut,
  Moon,
  Sun,
  Search,
  Bell,
  ChevronDown,
  Plus,
  Mic,
  MicOff,
  FileText,
  Upload,
  ArrowRight,
  Code2,
  Calendar,
  MoreVertical,
  Check,
  CheckCircle2,
  Loader2,
  X,
  Send,
  HelpCircle,
  TrendingUp,
  AlertCircle,
  Trophy,
  BarChart3
} from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { useTheme } from '../context/ThemeContext';
import { getUserProfile, PersonaType } from '../services/userService';
import {
  JournalEntry,
  subscribeToJournals,
  createJournalEntry,
  deleteJournalEntry,
  logUserMood,
  subscribeToLatestMood,
  subscribeToInsights,
  fetchAggregatedInsights,
  DashboardInsights
} from '../services/dashboardService';
import { auth } from '../lib/firebase';
import { DailyMoodModal, MoodKey, checkHasUserMoodToday } from './DailyMoodModal';
import { SettingsView } from './SettingsView';
import { MyJournals } from './MyJournals';

// Visual Assets
import silkBgImg from '../assets/images/luma_silk_background_1788530324776.jpg';
import studentAvatarImg from '../assets/images/student_developer_avatar_1788530257638.jpg';

interface DashboardProps {
  user?: any;
  onLogout?: () => void;
  onNavigateTab?: (tab: string) => void;
}

interface MoodItem {
  id: string;
  name: string;
  emoji: string;
  bgColor: string;
  score: number;
}

const MOODS_LIST: MoodItem[] = [
  { id: 'Amazing', name: 'Amazing', emoji: '😍', bgColor: 'bg-amber-50 text-amber-500', score: 95 },
  { id: 'Good', name: 'Good', emoji: '🙂', bgColor: 'bg-yellow-50 text-yellow-500', score: 85 },
  { id: 'Calm', name: 'Calm', emoji: '😌', bgColor: 'bg-orange-50 text-orange-500', score: 80 },
  { id: 'Stressed', name: 'Stressed', emoji: '😰', bgColor: 'bg-amber-50 text-amber-600', score: 50 },
  { id: 'Sad', name: 'Sad', emoji: '😢', bgColor: 'bg-blue-50 text-blue-500', score: 40 },
  { id: 'Angry', name: 'Angry', emoji: '😡', bgColor: 'bg-red-50 text-red-500', score: 30 }
];

export const Dashboard: React.FC<DashboardProps> = ({ user: propUser, onLogout }) => {
  const { user: authUser } = useAuth();
  const user = propUser || authUser;

  // Real-Time Clock & Dynamic Greeting
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const greeting = useMemo(() => {
    const hour = currentTime.getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 22) return 'Good evening';
    return 'Good night';
  }, [currentTime]);

  const formattedTime = useMemo(() => {
    return currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  }, [currentTime]);

  const formattedDate = useMemo(() => {
    return currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }, [currentTime]);

  // Navigation State
  const [activeNav, setActiveNav] = useState<string>('dashboard');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const { theme, resolvedTheme, setTheme, colorTheme, colorThemeConfig, setColorTheme, cycleNextColorTheme } = useTheme();
  const darkMode = resolvedTheme === 'dark';
  const [isMenuListOpen, setIsMenuListOpen] = useState<boolean>(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // User Profile & Realtime Data State
  const [persona, setPersona] = useState<PersonaType>('STUDENT_DEV');
  const [userGoals, setUserGoals] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState<string>(() => {
    const active = propUser || authUser;
    if (active?.displayName) return active.displayName;
    if (active?.email) {
      const namePart = active.email.split('@')[0];
      const clean = namePart.replace(/[0-9]/g, '');
      if (clean.toLowerCase().includes('done') && clean.toLowerCase().includes('boss')) {
        return 'Boss Done';
      }
      return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }
    try {
      const stored = localStorage.getItem('luma_active_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.displayName) return parsed.displayName;
        if (parsed.email) {
          const part = parsed.email.split('@')[0];
          const clean = part.replace(/[0-9]/g, '');
          if (clean.toLowerCase().includes('done') && clean.toLowerCase().includes('boss')) {
            return 'Boss Done';
          }
          return part.charAt(0).toUpperCase() + part.slice(1);
        }
      }
    } catch (_) {}
    return 'Boss Done';
  });

  // Mood State
  const [selectedMood, setSelectedMood] = useState<string>('Calm');
  const [isLoggingMood, setIsLoggingMood] = useState<boolean>(false);

  // Journals State - 100% Real-Time Firestore backplane, zero demo data
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [activeEntryMenu, setActiveEntryMenu] = useState<string | null>(null);

  // Insights State - 100% Real-Time dynamic data
  const [insights, setInsights] = useState<DashboardInsights>({
    productivityScore: 0,
    scoreDelta: 0,
    totalEntries: 0,
    streakDays: 0,
    distribution: [],
    hasData: false
  });

  // Modal / Interaction States
  const [showNewJournalModal, setShowNewJournalModal] = useState<boolean>(false);
  const [showDailyMoodModal, setShowDailyMoodModal] = useState<boolean>(false);
  const [todayThought, setTodayThought] = useState<string>('');
  const [journalTitle, setJournalTitle] = useState<string>('');
  const [journalContent, setJournalContent] = useState<string>('');
  const [journalMood, setJournalMood] = useState<string>('Calm');
  const [savingJournal, setSavingJournal] = useState<boolean>(false);

  // AI Companion State
  const [aiCompanionPrompt, setAiCompanionPrompt] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiResponseModal, setAiResponseModal] = useState<{ title: string; content: string } | null>(null);

  // Speech Recognition (Voice Entry)
  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

  // File Upload Reference
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quick Notification Toast helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Sync User Profile from Firestore / Auth
  useEffect(() => {
    if (!user) return;

    // Set display name from user object or email fallback
    if (user.displayName) {
      setDisplayName(user.displayName);
    } else if (user.email) {
      const namePart = user.email.split('@')[0];
      setDisplayName(namePart.charAt(0).toUpperCase() + namePart.slice(1));
    }

    let isMounted = true;
    if (user.uid) {
      getUserProfile(user.uid)
        .then((profileData: any) => {
          if (isMounted && profileData) {
            if (profileData.displayName) {
              setDisplayName(profileData.displayName);
            }
            if (profileData.profile) {
              if (profileData.profile.displayName || profileData.profile.name) {
                setDisplayName(profileData.profile.displayName || profileData.profile.name);
              }
              if (profileData.profile.persona) {
                setPersona(profileData.profile.persona);
              }
              if (Array.isArray(profileData.profile.goals)) {
                setUserGoals(profileData.profile.goals);
              }
            }
          }
        })
        .catch((err) => console.warn('Profile fetch notice:', err));
    }

    return () => {
      isMounted = false;
    };
  }, [user]);

  // 2. Real-time Subscriptions for Journals, Moods & Aggregated Insights
  useEffect(() => {
    if (!user?.uid) return;

    const unsubJournals = subscribeToJournals(user.uid, (entries) => {
      setJournals(entries);
    });

    const unsubMood = subscribeToLatestMood(user.uid, (latestMood) => {
      if (latestMood) setSelectedMood(latestMood);
    });

    const unsubInsights = subscribeToInsights(user.uid, (realtimeInsights) => {
      setInsights(realtimeInsights);
    });

    return () => {
      unsubJournals();
      unsubMood();
      unsubInsights();
    };
  }, [user?.uid]);

  // 3. Daily Mood Trigger: Dashboard displays for the first ~4 seconds, then shows the DailyMoodModal
  useEffect(() => {
    if (!user?.uid) return;
    let isMounted = true;
    const sessionSeenKey = `luma_mood_prompted_session_${user.uid}`;

    // Load any existing state for today
    checkHasUserMoodToday(user.uid).then((res) => {
      if (!isMounted) return;
      if (res.mood) setSelectedMood(res.mood);
      if (res.thought) setTodayThought(res.thought);
    });

    // Check if the popup was already prompted or dismissed in this browser session
    const alreadyPrompted = sessionStorage.getItem(sessionSeenKey);
    let timer: any = null;
    if (!alreadyPrompted) {
      // 4-second delay: the user sees the dashboard first, then the emoji popup modal appears
      timer = setTimeout(() => {
        if (isMounted) {
          setShowDailyMoodModal(true);
        }
      }, 4000);
    }

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [user?.uid]);

  // Check if today's mindset/mood check-in was completed
  const [hasCompletedTodayCheckIn, setHasCompletedTodayCheckIn] = useState<boolean>(false);

  useEffect(() => {
    if (user?.uid) {
      const todayString = new Date().toISOString().split('T')[0];
      const cachedDate = localStorage.getItem(`luma_last_mood_${user.uid}`);
      if (cachedDate === todayString) {
        setHasCompletedTodayCheckIn(true);
      }
    }
  }, [user?.uid, selectedMood]);

  // Derived Real-Time Metrics (Responsive to Topic & Popup Screen Page Data)
  const todayStr = new Date().toISOString().split('T')[0];
  const todayJournalCount = journals.filter((j: any) => {
    const entryDate = j.createdAt?.toDate 
      ? j.createdAt.toDate().toISOString().split('T')[0] 
      : (typeof j.createdAt === 'string' ? j.createdAt.split('T')[0] : (j.date || ''));
    return entryDate === todayStr;
  }).length;
  
  // Total wins today includes any logged journals plus today's mindset check-in
  const effectiveWinsCount = todayJournalCount + (hasCompletedTodayCheckIn ? 1 : 0);

  // Topic & Mindset score mapping from the popup screen page
  const moodScoreMap: Record<string, { score: number; topic: string; balance: string; balanceColor: string }> = {
    Amazing: { score: 95, topic: 'Motivated', balance: 'Optimal', balanceColor: 'text-emerald-500' },
    Good: { score: 85, topic: 'Focused', balance: 'Balanced', balanceColor: 'text-emerald-500' },
    Calm: { score: 80, topic: 'Mindful', balance: 'Steady', balanceColor: 'text-sky-500' },
    Stressed: { score: 55, topic: 'Paced', balance: 'Pacing', balanceColor: 'text-amber-500' },
    Sad: { score: 45, topic: 'Gentle', balance: 'Recharge', balanceColor: 'text-rose-500' },
    Angry: { score: 40, topic: 'Reset', balance: 'Mind Reset', balanceColor: 'text-red-500' }
  };
  const activeTopicInfo = moodScoreMap[selectedMood] || { score: 80, topic: 'Active', balance: 'Balanced', balanceColor: 'text-emerald-500' };

  // 2. Productivity: Reflects active topic + consistency
  const productivityValue = useMemo(() => {
    if (hasCompletedTodayCheckIn || journals.length > 0) {
      const base = activeTopicInfo.score;
      const bonus = Math.min(15, effectiveWinsCount * 5);
      return Math.min(100, base + bonus);
    }
    return 75; // Baseline score
  }, [hasCompletedTodayCheckIn, journals.length, activeTopicInfo.score, effectiveWinsCount]);

  // 3. Upcoming Review: Cleanly formatted, never truncated
  const upcomingReviewDaysText = useMemo(() => {
    if (userGoals.length > 0) return 'In 5 Days';
    if (hasCompletedTodayCheckIn) return 'Tomorrow';
    return 'Today 8 PM';
  }, [userGoals.length, hasCompletedTodayCheckIn]);

  const upcomingReviewBadge = useMemo(() => {
    if (userGoals.length > 0) return 'Goals';
    if (hasCompletedTodayCheckIn) return 'Daily';
    return 'Pending';
  }, [userGoals.length, hasCompletedTodayCheckIn]);

  // 4. Work-Life Balance: Driven by topic selected in popup
  const workLifeBalanceStatus = useMemo(() => {
    return activeTopicInfo.balance;
  }, [activeTopicInfo.balance]);

  // Handle Daily Mood Complete
  const handleDailyMoodComplete = (mood: MoodKey, thought: string) => {
    setSelectedMood(mood);
    setTodayThought(thought);
    setHasCompletedTodayCheckIn(true);
    if (user?.uid) {
      const todayDate = new Date().toISOString().split('T')[0];
      sessionStorage.setItem(`luma_mood_prompted_session_${user.uid}`, 'true');
      localStorage.setItem(`luma_last_mood_${user.uid}`, todayDate);
      localStorage.setItem(`luma_today_mood_val_${user.uid}`, mood);
      localStorage.setItem(`luma_today_thought_${user.uid}`, thought);
    }
    showToast(`Topic updated: ${mood}`);
    if (user?.uid) {
      fetchAggregatedInsights(user.uid).then(setInsights);
    }
  };

  const handleDailyMoodSkip = () => {
    if (user?.uid) {
      sessionStorage.setItem(`luma_mood_prompted_session_${user.uid}`, 'true');
    }
    setShowDailyMoodModal(false);
  };

  // Handle Mood Selection
  const handleMoodSelect = async (moodName: string, score: number) => {
    setSelectedMood(moodName);
    setIsLoggingMood(true);
    showToast(`Logged mood as ${moodName}`);
    if (user?.uid) {
      try {
        await logUserMood(user.uid, moodName, score);
        const updated = await fetchAggregatedInsights(user.uid);
        setInsights(updated);
      } catch (err) {
        console.warn('Mood save notice:', err);
      } finally {
        setIsLoggingMood(false);
      }
    } else {
      setIsLoggingMood(false);
    }
  };

  // Handle New Journal Submission
  const handleSaveJournal = async () => {
    if (!journalTitle.trim() || !journalContent.trim()) {
      showToast('Please enter both a title and reflection content.');
      return;
    }

    setSavingJournal(true);
    try {
      const targetUid = user?.uid || auth.currentUser?.uid || 'alex_sharma';
      await createJournalEntry(targetUid, {
        title: journalTitle,
        content: journalContent,
        mood: journalMood,
        tag: journalMood
      });

      showToast('Journal entry saved successfully!');
      setShowNewJournalModal(false);
      setJournalTitle('');
      setJournalContent('');
      setJournalMood('Calm');
    } catch (err) {
      console.error('Error saving journal:', err);
      showToast('Failed to save journal entry.');
    } finally {
      setSavingJournal(false);
    }
  };

  // Handle Voice Entry via Web Speech API
  const toggleVoiceRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Speech recognition is not supported in this browser.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      showToast('Voice recording stopped.');
    } else {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsListening(true);
          showToast('Listening... Speak your thoughts clearly.');
          setShowNewJournalModal(true);
          if (!journalTitle) setJournalTitle('Voice Reflection');
        };

        recognition.onresult = (event: any) => {
          let fullTranscript = '';
          for (let i = 0; i < event.results.length; ++i) {
            fullTranscript += event.results[i][0].transcript + (event.results[i].isFinal ? ' ' : '');
          }
          if (fullTranscript.trim()) {
            setJournalContent(fullTranscript.trim());
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition error:', event.error);
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (err) {
        console.warn('Speech recognition activation notice:', err);
        setIsListening(false);
      }
    }
  };

  // Handle File Upload for thoughts / notes
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const titleFromName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setJournalTitle(titleFromName.charAt(0).toUpperCase() + titleFromName.slice(1));
        setJournalContent(content);
        setShowNewJournalModal(true);
        showToast(`Imported ${file.name}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Trigger Gemini AI Assistance
  const handleAskLumaAI = async (customPrompt?: string) => {
    const promptToSend = customPrompt || aiCompanionPrompt;
    if (!promptToSend.trim()) return;

    setAiLoading(true);
    setAiCompanionPrompt('');

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToSend,
          context: `User persona: ${persona}. Goals: ${userGoals.join(', ')}. Act as LUMA AI, a warm, supportive, and precise mindfulness and productivity companion.`
        })
      });

      if (res.ok) {
        const data = await res.json();
        setAiResponseModal({
          title: promptToSend,
          content: data.result || 'Here is your thoughtful response from LUMA AI.'
        });
      } else {
        setAiResponseModal({
          title: promptToSend,
          content: `LUMA Reflection on "${promptToSend}":\n\nTake a deep breath. Focus on one intentional task at a time, celebrate micro-wins, and trust the process of daily compounding progress.`
        });
      }
    } catch (err) {
      console.warn('AI generate error fallback:', err);
      setAiResponseModal({
        title: promptToSend,
        content: `LUMA Reflection on "${promptToSend}":\n\nTake a deep breath. Focus on one intentional task at a time, celebrate micro-wins, and trust the process of daily compounding progress.`
      });
    } finally {
      setAiLoading(false);
    }
  };

  // Persona-adaptive prompt chips matching the exact requirements
  const getPersonaChips = () => {
    if (persona === 'STUDENT_DEV') {
      return [
        {
          id: 'code-commits',
          label: "Summarize today's code commits",
          icon: <Code2 className="w-3.5 h-3.5 text-[#EA580C]" />,
          prompt: "Summarize today's software code commits and technical achievements into a clear developer standup."
        },
        {
          id: 'project-standup',
          label: 'Draft project standup note',
          icon: <FileText className="w-3.5 h-3.5 text-[#EA580C]" />,
          prompt: 'Draft an agile daily standup note: what was completed, what is in progress, and potential blockers.'
        },
        {
          id: 'bug-resolution',
          label: 'Log bug resolution',
          icon: <Target className="w-3.5 h-3.5 text-[#EA580C]" />,
          prompt: 'Help me document a bug resolution reflection: the root cause, fix applied, and lessons learned.'
        }
      ];
    } else if (persona === 'BUSY_PRO') {
      return [
        {
          id: 'work-wins',
          label: 'Compile daily work wins',
          icon: <Sparkles className="w-3.5 h-3.5 text-[#EA580C]" />,
          prompt: 'Help me compile today’s executive work wins and strategic impact.'
        },
        {
          id: 'weekly-review',
          label: 'Draft weekly review',
          icon: <FileText className="w-3.5 h-3.5 text-[#EA580C]" />,
          prompt: 'Draft a structured weekly review highlighting milestones and upcoming focus areas.'
        },
        {
          id: 'work-life',
          label: 'Track work-life balance',
          icon: <Sprout className="w-3.5 h-3.5 text-[#EA580C]" />,
          prompt: 'Guide a quick 3-minute evening boundary check to transition smoothly from work to rest.'
        }
      ];
    } else {
      return [
        {
          id: 'affirmation',
          label: 'Suggest daily affirmation',
          icon: <Sparkles className="w-3.5 h-3.5 text-[#EA580C]" />,
          prompt: 'Suggest a grounded, authentic daily affirmation based on intentional self-growth.'
        },
        {
          id: 'stress-reflection',
          label: 'Reflect on current stress',
          icon: <Sprout className="w-3.5 h-3.5 text-[#EA580C]" />,
          prompt: 'Guide a mindful reflection on acknowledging and gently releasing current stressors.'
        },
        {
          id: 'mindfulness-prompt',
          label: 'Guided mindfulness prompt',
          icon: <Target className="w-3.5 h-3.5 text-[#EA580C]" />,
          prompt: 'Provide a thoughtful 5-minute journaling prompt to cultivate inner clarity.'
        }
      ];
    }
  };

  const getPersonaSubtitle = () => {
    if (persona === 'STUDENT_DEV') return 'Your personal coding productivity partner';
    if (persona === 'BUSY_PRO') return 'Your personal executive productivity partner';
    return 'Your personal mindfulness & growth partner';
  };

  // Filter journals based on search query
  const filteredJournals = journals.filter(
    (j) =>
      j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.mood.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      className="h-screen max-h-screen w-full flex flex-row overflow-hidden font-sans selection:bg-orange-100 selection:text-orange-900 relative transition-colors duration-300"
      style={{ backgroundColor: colorThemeConfig.bgMain, color: colorThemeConfig.textPrimary }}
    >
      {/* Background Decorative Ambient Shapes & Orange Glow (Image 1 & Image 3) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 transition-opacity duration-500">
        {darkMode ? (
          <>
            {/* Cinematic dark glowing orbs matching Image 3 */}
            <div className="absolute -top-32 -left-32 w-[600px] h-[600px] bg-gradient-to-br from-[#FD6B31]/12 via-orange-950/20 to-transparent rounded-full blur-[110px]" />
            <div className="absolute top-1/3 -right-32 w-[700px] h-[700px] bg-gradient-to-bl from-[#FD6B31]/10 via-amber-950/15 to-transparent rounded-full blur-[130px]" />
            <div className="absolute -bottom-40 left-1/3 w-[800px] h-[500px] bg-gradient-to-t from-orange-900/12 via-[#161616]/40 to-transparent rounded-full blur-[110px]" />
          </>
        ) : (
          <>
            {/* Warm ivory peach flowing glow matching Image 1 */}
            <div className="absolute -top-32 -left-32 w-[550px] h-[550px] bg-gradient-to-br from-orange-200/40 via-amber-100/30 to-transparent rounded-full blur-3xl opacity-80" />
            <div className="absolute top-1/4 -right-32 w-[650px] h-[650px] bg-gradient-to-bl from-orange-200/35 via-orange-100/25 to-transparent rounded-full blur-3xl opacity-70" />
            <div className="absolute -bottom-40 left-1/4 w-[750px] h-[450px] bg-gradient-to-t from-amber-200/30 via-orange-100/20 to-transparent rounded-full blur-3xl opacity-70" />
          </>
        )}
      </div>
      
      {/* Hidden File Input for Upload button */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".txt,.md,.json"
        className="hidden"
      />

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 right-1/2 translate-x-1/2 z-50 bg-neutral-900 text-white text-xs px-4 py-2 rounded-full shadow-lg flex items-center gap-2 border border-neutral-700"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-[#FD6B31]" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* 1. SLIDE-OVER NAVIGATION DRAWER (Toggled by Menu Icon)    */}
      {/* ========================================================= */}
      <AnimatePresence>
        {isMenuListOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsMenuListOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity"
            />

            {/* Slide-Over Navigation Drawer */}
            <motion.aside
              id="sidebar-navigation-drawer"
              key="drawer-sidebar"
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed top-0 left-0 bottom-0 w-64 max-w-[85vw] h-full border-r flex flex-col justify-between p-4 z-50 shadow-2xl select-none transition-colors duration-300"
              style={{ backgroundColor: colorThemeConfig.bgSidebar, borderColor: colorThemeConfig.border }}
            >
              <div>
                {/* Top: Brand Logo + Close Button */}
                <div className="flex items-center justify-between mb-6 px-1">
                  <div
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => {
                      setActiveNav('dashboard');
                      setIsMenuListOpen(false);
                    }}
                  >
                    <img
                      src="/luma-emblem.png"
                      alt="LUMA"
                      className="h-6 w-auto object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/luma-logo.png';
                      }}
                    />
                    <span
                      className="font-serif-luma font-bold text-xl tracking-[0.16em]"
                      style={{ color: colorThemeConfig.textPrimary }}
                    >
                      LUMA
                    </span>
                  </div>

                  <button
                    id="sidebar-drawer-close-btn"
                    type="button"
                    onClick={() => setIsMenuListOpen(false)}
                    className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800 cursor-pointer transition-colors"
                    title="Close menu"
                    aria-label="Close menu"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Navigation Items */}
                <nav className="space-y-1">
                  <button
                    id="sidebar-nav-dashboard"
                    onClick={() => {
                      setActiveNav('dashboard');
                      setIsMenuListOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      activeNav === 'dashboard'
                        ? 'shadow-2xs'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100/60 dark:hover:bg-neutral-800/50'
                    }`}
                    style={activeNav === 'dashboard' ? {
                      backgroundColor: colorThemeConfig.accentBg,
                      color: colorThemeConfig.accentText
                    } : undefined}
                  >
                    <Home
                      className="w-4 h-4"
                      style={{ color: activeNav === 'dashboard' ? colorThemeConfig.primary : undefined }}
                    />
                    <span>Dashboard</span>
                  </button>

                  <button
                    id="sidebar-nav-journals"
                    onClick={() => {
                      setActiveNav('journals');
                      setIsMenuListOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      activeNav === 'journals'
                        ? 'shadow-2xs'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100/60 dark:hover:bg-neutral-800/50'
                    }`}
                    style={activeNav === 'journals' ? {
                      backgroundColor: colorThemeConfig.accentBg,
                      color: colorThemeConfig.accentText
                    } : undefined}
                  >
                    <BookOpen className="w-4 h-4 text-neutral-500" />
                    <span>My Journals</span>
                  </button>

                  <button
                    id="sidebar-nav-insights"
                    onClick={() => {
                      setActiveNav('insights');
                      handleAskLumaAI("Show my weekly productivity insights and positive habit suggestions.");
                      setIsMenuListOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      activeNav === 'insights'
                        ? 'shadow-2xs'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100/60 dark:hover:bg-neutral-800/50'
                    }`}
                    style={activeNav === 'insights' ? {
                      backgroundColor: colorThemeConfig.accentBg,
                      color: colorThemeConfig.accentText
                    } : undefined}
                  >
                    <Sparkles className="w-4 h-4 text-neutral-500" />
                    <span>AI Insights</span>
                  </button>

                  <button
                    id="sidebar-nav-goals"
                    onClick={() => {
                      setActiveNav('goals');
                      showToast("Viewing active goals: " + (userGoals.length ? userGoals.join(', ') : 'Track Coding Progress'));
                      setIsMenuListOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      activeNav === 'goals'
                        ? 'shadow-2xs'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100/60 dark:hover:bg-neutral-800/50'
                    }`}
                    style={activeNav === 'goals' ? {
                      backgroundColor: colorThemeConfig.accentBg,
                      color: colorThemeConfig.accentText
                    } : undefined}
                  >
                    <Target className="w-4 h-4 text-neutral-500" />
                    <span>Goals</span>
                  </button>

                  <button
                    id="sidebar-nav-mindfulness"
                    onClick={() => {
                      setActiveNav('mindfulness');
                      handleAskLumaAI("Guide a 2-minute breathing and mindfulness break.");
                      setIsMenuListOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      activeNav === 'mindfulness'
                        ? 'shadow-2xs'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100/60 dark:hover:bg-neutral-800/50'
                    }`}
                    style={activeNav === 'mindfulness' ? {
                      backgroundColor: colorThemeConfig.accentBg,
                      color: colorThemeConfig.accentText
                    } : undefined}
                  >
                    <Sprout className="w-4 h-4 text-neutral-500" />
                    <span>Mindfulness</span>
                  </button>

                  <button
                    id="sidebar-nav-settings"
                    onClick={() => {
                      setActiveNav('settings');
                      showToast("Settings: Preferences synced with Cloud Firestore.");
                      setIsMenuListOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      activeNav === 'settings'
                        ? 'shadow-2xs'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100/60 dark:hover:bg-neutral-800/50'
                    }`}
                    style={activeNav === 'settings' ? {
                      backgroundColor: colorThemeConfig.accentBg,
                      color: colorThemeConfig.accentText
                    } : undefined}
                  >
                    <Settings className="w-4 h-4 text-neutral-500" />
                    <span>Settings</span>
                  </button>
                </nav>
              </div>

              {/* Bottom Actions Row: Logout & Theme Toggle */}
              <div
                className="pt-2 border-t flex items-center justify-between px-1"
                style={{ borderColor: colorThemeConfig.border }}
              >
                <button
                  id="sidebar-logout-btn"
                  onClick={onLogout}
                  className="flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-red-600 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const nextTheme = darkMode ? 'light' : 'dark';
                    setTheme(nextTheme);
                    showToast(darkMode ? "Appearance: Light" : "Appearance: Dark");
                  }}
                  className="p-1 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 rounded-md hover:bg-neutral-200/50 cursor-pointer"
                  title="Toggle theme"
                >
                  {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5" />}
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* 2. MAIN DASHBOARD CONTENT AREA                            */}
      {/* ========================================================= */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        
        {/* Top Header Bar: Search Bar, Notifications, Sparkle Badge, User Menu */}
        <header
          className="h-14 border-b px-4 sm:px-6 flex items-center justify-between shrink-0 select-none z-10 transition-colors duration-300"
          style={{
            backgroundColor: colorThemeConfig.bgHeader,
            borderColor: colorThemeConfig.border
          }}
        >
          {/* Left Header Group: Menu Toggle Icon, Brand Logo, and Search Input */}
          <div className="flex items-center gap-3 sm:gap-4 flex-1 max-w-xl">
            {/* Hamburger Menu Toggle Icon */}
            <button
              id="sidebar-menu-toggle-btn"
              type="button"
              onClick={() => {
                const nextState = !isMenuListOpen;
                setIsMenuListOpen(nextState);
                showToast(nextState ? "Menu list options opened" : "Menu list options closed");
              }}
              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white p-1.5 sm:p-2 rounded-xl hover:bg-neutral-200/50 dark:hover:bg-neutral-800 cursor-pointer transition-colors border border-neutral-200/80 dark:border-neutral-700/80 shadow-2xs shrink-0"
              title={isMenuListOpen ? "Close menu list options" : "Open all menu list options"}
              aria-label="Toggle menu list options"
              aria-expanded={isMenuListOpen}
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Official LUMA Logo (remains exactly the same) */}
            <div
              className="flex items-center gap-2 cursor-pointer select-none shrink-0"
              onClick={() => setActiveNav('dashboard')}
              title="LUMA Dashboard"
            >
              <img
                src="/luma-emblem.png"
                alt="LUMA"
                className="h-6 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/luma-logo.png';
                }}
              />
              <span
                className="font-serif-luma font-bold text-xl tracking-[0.16em]"
                style={{ color: colorThemeConfig.textPrimary }}
              >
                LUMA
              </span>
            </div>


          </div>

          {/* Right Header Icons & Profile */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Quick 1-Click Theme Toggle Button (Light/Dark Switch) */}
            <button
              id="header-theme-toggle-btn"
              type="button"
              onClick={() => {
                const nextTheme = darkMode ? 'light' : 'dark';
                setTheme(nextTheme);
                showToast(darkMode ? "Theme: Light (Warm Ivory)" : "Theme: Dark (Deep Charcoal)");
              }}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-300 cursor-pointer shadow-2xs hover:scale-[1.02] select-none"
              style={{
                backgroundColor: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                borderColor: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)',
                color: darkMode ? '#F5F5F5' : '#1A1C1C'
              }}
              title={darkMode ? "Switch to Light Theme (Image 1)" : "Switch to Dark Theme (Image 3)"}
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-[#FD6B31]" />
                  <span className="text-[11px] font-semibold text-neutral-200">Dark</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-neutral-700" />
                  <span className="text-[11px] font-semibold text-neutral-800">Light</span>
                </>
              )}
            </button>

            {/* Bell Notification */}
            <button
              type="button"
              onClick={() => showToast("All notifications caught up!")}
              className="relative p-2 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white rounded-full hover:bg-neutral-200/40 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: colorThemeConfig.primary }}
              />
            </button>

            {/* Sparkle badge in peach circle */}
            <button
              type="button"
              onClick={() => handleAskLumaAI("What is my mindful focus for today?")}
              className="w-7 h-7 rounded-full bg-[#FFF2E8] dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800/60 flex items-center justify-center text-[#EA580C] dark:text-[#FD6B31] hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors cursor-pointer shadow-2xs"
              title="Daily Sparkle"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>

            {/* User Profile Pill & Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 py-1 pl-1 pr-2 rounded-full hover:bg-neutral-200/40 dark:hover:bg-neutral-800 transition-colors cursor-pointer select-none"
              >
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={displayName}
                    className="w-7 h-7 rounded-full object-cover border border-orange-200 shadow-2xs"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#EA580C] to-[#FD6B31] text-white text-xs font-semibold flex items-center justify-center border border-orange-200 shadow-2xs">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  {displayName}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
              </button>

              {/* Dropdown Menu */}
              {userDropdownOpen && (
                <div 
                  className="absolute right-0 mt-1.5 w-56 rounded-2xl border shadow-xl py-2 z-50 text-xs backdrop-blur-xl transition-all"
                  style={{
                    backgroundColor: darkMode ? '#161616' : '#FFFFFF',
                    borderColor: darkMode ? 'rgba(255,255,255,0.12)' : '#E5E0D8',
                    color: darkMode ? '#F5F5F5' : '#1A1C1C'
                  }}
                >
                  <div className="px-3 py-1.5 border-b text-neutral-500 dark:text-neutral-400" style={{ borderColor: darkMode ? 'rgba(255,255,255,0.08)' : '#F0EDE8' }}>
                    Signed in as <br />
                    <strong className="text-neutral-900 dark:text-white truncate block">{user?.email || displayName}</strong>
                  </div>

                  {/* Theme Mode Selector in Dropdown */}
                  <div className="px-3 py-2 border-b" style={{ borderColor: darkMode ? 'rgba(255,255,255,0.08)' : '#F0EDE8' }}>
                    <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 mb-1.5 flex items-center justify-between">
                      <span>Theme</span>
                      <span className="text-[10px] text-[#FD6B31] font-bold">{theme.toUpperCase()}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 bg-neutral-100 dark:bg-neutral-800/80 p-0.5 rounded-lg text-center">
                      <button
                        type="button"
                        onClick={() => { setTheme('light'); showToast("Theme: Light (Warm Ivory)"); }}
                        className={`py-1 px-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${theme === 'light' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs font-bold' : 'text-neutral-600 dark:text-neutral-400'}`}
                      >
                        Light
                      </button>
                      <button
                        type="button"
                        onClick={() => { setTheme('system'); showToast("Theme: System"); }}
                        className={`py-1 px-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${theme === 'system' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs font-bold' : 'text-neutral-600 dark:text-neutral-400'}`}
                      >
                        System
                      </button>
                      <button
                        type="button"
                        onClick={() => { setTheme('dark'); showToast("Theme: Dark (Deep Charcoal)"); }}
                        className={`py-1 px-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${theme === 'dark' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs font-bold' : 'text-neutral-600 dark:text-neutral-400'}`}
                      >
                        Dark
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      setActiveNav('settings');
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-neutral-100 dark:hover:bg-white/5 flex items-center gap-2 cursor-pointer text-neutral-800 dark:text-neutral-200"
                  >
                    <Settings className="w-3.5 h-3.5 text-[#FD6B31]" />
                    <span>Appearance &amp; Settings</span>
                  </button>

                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      onLogout?.();
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center gap-2 cursor-pointer border-t"
                    style={{ borderColor: darkMode ? 'rgba(255,255,255,0.08)' : '#F0EDE8' }}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>

        </header>

        {/* Dashboard Main Content Area / Settings View / My Journals View */}
        <main className="flex-1 p-4 xl:p-5 overflow-y-auto min-h-0">
          {activeNav === 'settings' ? (
            <SettingsView user={user} showToast={showToast} />
          ) : activeNav === 'journals' ? (
            <MyJournals 
              user={user} 
              onNavigateBack={() => setActiveNav('dashboard')} 
              showToast={showToast} 
            />
          ) : (
            <div className="w-full h-full grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-5 min-h-0">
              <div className="lg:col-span-8 flex flex-col gap-4">
            
            {/* 1. Dynamic Hero Banner with Silk Texture and Luxury Pen */}
            <div 
              className="relative rounded-3xl overflow-hidden p-5 sm:p-6 border shadow-[0_4px_20px_rgba(234,88,12,0.04)] flex flex-col justify-between shrink-0 transition-colors duration-300"
              style={{
                background: darkMode 
                  ? 'linear-gradient(135deg, #181513 0%, #141312 50%, #100F0E 100%)' 
                  : 'linear-gradient(90deg, #FFF5EE 0%, #FFEFE4 50%, #FCE7D7 100%)',
                borderColor: darkMode ? 'rgba(255, 255, 255, 0.10)' : '#F5DAC6'
              }}
            >
              
              {/* Background Silk Texture Overlay */}
              <div className="absolute inset-0 pointer-events-none opacity-25 mix-blend-multiply dark:mix-blend-overlay dark:opacity-10">
                <img
                  src={silkBgImg}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Top Row: Greeting & Cursive Callout */}
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <h1 
                    className="font-serif-luma text-2xl sm:text-3xl font-normal tracking-tight leading-tight flex items-center gap-2"
                    style={{ color: darkMode ? '#F5F5F5' : '#1A1C1C' }}
                  >
                    <span>{greeting}, {displayName}</span>
                    <span className="text-2xl">👋</span>
                  </h1>

                  {/* Real-Time Live Clock & Mindset Indicator */}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-500/10 dark:bg-orange-500/20 border border-orange-500/25 text-[#FD6B31] text-[11px] font-medium font-mono shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>{formattedTime}</span>
                      <span className="text-neutral-400 dark:text-neutral-500">•</span>
                      <span>{formattedDate}</span>
                    </div>

                    {todayThought && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700/80 text-neutral-700 dark:text-neutral-300 text-[11px] font-medium truncate max-w-xs sm:max-w-md">
                        <Sparkles className="w-3 h-3 text-orange-500 shrink-0" />
                        <span className="truncate">&ldquo;{todayThought}&rdquo;</span>
                      </div>
                    )}
                  </div>

                  <p 
                    className="text-xs sm:text-sm font-normal mt-1.5"
                    style={{ color: darkMode ? '#B8B8B8' : '#4C4546' }}
                  >
                    Let&apos;s capture your thoughts and make today meaningful.
                  </p>
                </div>

                {/* Cursive callout */}
                <div 
                  className="hidden sm:block font-script-luma text-base xl:text-lg font-semibold leading-tight select-none rotate-[-4deg] text-right pr-2"
                  style={{ color: '#FD6B31' }}
                >
                  Small Steps<br />Big Changes
                </div>
              </div>

              {/* Action Buttons Row & 3D Pen Graphic */}
              <div className="relative z-10 flex items-center justify-between mt-5 pt-1">
                
                {/* 4 Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    id="hero-new-journal-btn"
                    type="button"
                    onClick={() => setShowNewJournalModal(true)}
                    className="py-2 px-4 rounded-full font-medium text-xs shadow-sm hover:shadow flex items-center gap-1.5 transition-all cursor-pointer hover:scale-[1.02]"
                    style={{
                      backgroundColor: darkMode ? '#FD6B31' : '#000000',
                      color: '#FFFFFF'
                    }}
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>New Journal</span>
                  </button>

                  <button
                    id="hero-voice-entry-btn"
                    type="button"
                    onClick={toggleVoiceRecording}
                    className={`py-2 px-3.5 rounded-full border text-xs font-medium shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer hover:scale-[1.02] ${
                      isListening
                        ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 animate-pulse'
                        : ''
                    }`}
                    style={!isListening ? {
                      backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                      borderColor: darkMode ? 'rgba(255,255,255,0.12)' : '#E5E5E5',
                      color: darkMode ? '#E5E5E5' : '#1A1C1C'
                    } : {}}
                  >
                    {isListening ? <MicOff className="w-3.5 h-3.5 text-red-500" /> : <Mic className="w-3.5 h-3.5" />}
                    <span>{isListening ? 'Listening...' : 'Voice Entry'}</span>
                  </button>

                  <button
                    id="hero-quick-note-btn"
                    type="button"
                    onClick={() => {
                      setJournalTitle('Quick Thought');
                      setShowNewJournalModal(true);
                    }}
                    className="py-2 px-3.5 rounded-full border font-medium text-xs shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer hover:scale-[1.02]"
                    style={{
                      backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                      borderColor: darkMode ? 'rgba(255,255,255,0.12)' : '#E5E5E5',
                      color: darkMode ? '#E5E5E5' : '#1A1C1C'
                    }}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Quick Note</span>
                  </button>

                  <button
                    id="hero-upload-btn"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-2 px-3.5 rounded-full border font-medium text-xs shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer hover:scale-[1.02]"
                    style={{
                      backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                      borderColor: darkMode ? 'rgba(255,255,255,0.12)' : '#E5E5E5',
                      color: darkMode ? '#E5E5E5' : '#1A1C1C'
                    }}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload</span>
                  </button>
                </div>

                {/* Realistic Luxury Fountain Pen Illustration */}
                <div className="relative hidden xl:block w-36 h-12 pointer-events-none select-none -mt-4">
                  <svg className="w-full h-full drop-shadow-md" viewBox="0 0 160 50" fill="none">
                    {/* Pen barrel in gloss black with gold ring & gold nib */}
                    <g transform="rotate(-28 80 25)">
                      <rect x="25" y="18" width="85" height="12" rx="2" fill="#1C1917" />
                      <rect x="110" y="17" width="20" height="14" rx="1.5" fill="#1C1917" />
                      {/* Gold bands */}
                      <rect x="108" y="17" width="3" height="14" fill="#EAB308" />
                      <rect x="24" y="18" width="3" height="12" fill="#EAB308" />
                      {/* Gold Clip */}
                      <rect x="112" y="13" width="14" height="2" fill="#FACC15" />
                      {/* Gold Nib */}
                      <polygon points="24,19 8,24 24,29" fill="#EAB308" stroke="#CA8A04" strokeWidth="0.8" />
                      <line x1="14" y1="24" x2="23" y2="24" stroke="#78350F" strokeWidth="0.8" />
                    </g>
                  </svg>
                </div>

              </div>

            </div>

            {/* Live Real-Time Metrics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { 
                  title: "Today's Wins", 
                  value: todayJournalCount, 
                  badge: todayJournalCount > 0 ? "Live" : "Ready",
                  badgeColor: "text-emerald-500",
                  subtext: todayJournalCount > 0 ? (todayJournalCount === 1 ? '1 Entry Logged' : `${todayJournalCount} Entries Logged`) : 'Ready to log',
                  icon: <Trophy className="w-3.5 h-3.5 text-[#FD6B31]" />
                },
                { 
                  title: "Productivity", 
                  value: `${productivityValue}%`, 
                  badge: "Score",
                  badgeColor: "text-blue-500",
                  subtext: "Activity tracking",
                  icon: <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
                },
                { 
                  title: "Upcoming Review", 
                  value: upcomingReviewDaysText, 
                  badge: upcomingReviewBadge,
                  badgeColor: "text-amber-500",
                  subtext: "Reflection cycle",
                  icon: <Calendar className="w-3.5 h-3.5 text-amber-500" />
                },
                { 
                  title: "Work-Life Balance", 
                  value: workLifeBalanceStatus, 
                  badge: null,
                  badgeColor: "text-emerald-500",
                  subtext: "Wellness rhythm",
                  icon: <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                }
              ].map((metric, mIdx) => (
                <div 
                  key={mIdx}
                  className="rounded-2xl p-3 border shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col justify-between text-left transition-colors duration-300"
                  style={{
                    backgroundColor: colorThemeConfig.bgSurface,
                    borderColor: colorThemeConfig.border
                  }}
                >
                  <div className="flex items-center justify-between mb-1 w-full" style={{ color: colorThemeConfig.textSecondary }}>
                    <span className="text-[11px] font-medium">{metric.title}</span>
                    {metric.icon}
                  </div>
                  <div className="flex items-baseline gap-1.5 my-0.5">
                    <span className="text-xl sm:text-2xl font-bold truncate" style={{ color: colorThemeConfig.textPrimary }}>
                      {metric.value}
                    </span>
                    {metric.badge && (
                      <span className={`text-[10px] font-semibold ${metric.badgeColor}`}>
                        {metric.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] truncate" style={{ color: colorThemeConfig.textSecondary }}>
                    {metric.subtext}
                  </span>
                </div>
              ))}
            </div>

            {/* 2. Recent Journals Stream */}
            <div 
              className="rounded-3xl p-4 sm:p-5 border shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex-1 flex flex-col justify-between transition-colors duration-300"
              style={{
                backgroundColor: colorThemeConfig.bgSurface,
                borderColor: colorThemeConfig.border
              }}
            >
              
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs sm:text-sm font-bold tracking-tight" style={{ color: colorThemeConfig.textPrimary }}>
                  Recent Journals
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveNav('journals')}
                  className="group flex items-center gap-1 text-xs font-semibold text-[#FD6B31] hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <span>See All</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>

              {/* Journal List Items */}
              <div className="space-y-2.5">
                {filteredJournals.length === 0 ? (
                  <div
                    className="flex flex-col items-center justify-center py-7 px-4 text-center border border-dashed rounded-2xl transition-colors"
                    style={{
                      borderColor: darkMode ? 'rgba(255, 255, 255, 0.12)' : '#E8E2D9'
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-[#FD6B31] flex items-center justify-center mb-2.5 border border-orange-200/60 dark:border-orange-900/40">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <h3 className="text-xs sm:text-sm font-bold" style={{ color: colorThemeConfig.textPrimary }}>
                      No journal entries yet
                    </h3>
                    <p className="text-[11px] mt-1 max-w-xs leading-relaxed" style={{ color: colorThemeConfig.textSecondary }}>
                      Your reflections, focus logs, and daily thoughts will appear here in real time as you record them.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowNewJournalModal(true)}
                      className="mt-3 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#FD6B31] text-white hover:bg-orange-600 transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Write First Journal</span>
                    </button>
                  </div>
                ) : (
                  filteredJournals.slice(0, 4).map((entry, idx) => {
                    // Varied colors matching the screenshot
                    const getIconDesign = (index: number) => {
                      switch (index % 4) {
                        case 0:
                          return {
                            bg: 'bg-[#FFF2E8] dark:bg-neutral-800 border-[#FFE4D6] dark:border-neutral-700',
                            badge: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800',
                            icon: <Sprout className="w-4 h-4 text-[#EA580C]" />
                          };
                        case 1:
                          return {
                            bg: 'bg-sky-50 dark:bg-neutral-800 border-sky-100 dark:border-neutral-700',
                            badge: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800',
                            icon: <Code2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                          };
                        case 2:
                          return {
                            bg: 'bg-amber-50 dark:bg-neutral-800 border-amber-100 dark:border-neutral-700',
                            badge: 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-200/60 dark:border-orange-800',
                            icon: <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          };
                        default:
                          return {
                            bg: 'bg-purple-50 dark:bg-neutral-800 border-purple-100 dark:border-neutral-700',
                            badge: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-800',
                            icon: <Target className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                          };
                      }
                    };

                    const design = getIconDesign(idx);

                    return (
                      <div
                        key={entry.id}
                        id={`journal-row-${entry.id}`}
                        className="group flex items-center justify-between p-2.5 sm:p-3 rounded-2xl hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 border transition-all cursor-pointer"
                        style={{
                          borderColor: darkMode ? 'rgba(255, 255, 255, 0.08)' : '#F0EBE3'
                        }}
                        onClick={() => {
                          setAiResponseModal({
                            title: entry.title,
                            content: `${entry.content}\n\n[Mood: ${entry.mood} | ${entry.formattedDate}]\n\nLUMA AI Insight:\n${entry.aiInsight || 'You maintained consistent momentum. Reflecting regularly solidifies long-term mental resilience.'}`
                          });
                        }}
                      >
                        {/* Left: Icon, Title & Truncated Preview */}
                        <div className="flex items-center gap-3 min-w-0 pr-3">
                          <div
                            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${design.bg}`}
                          >
                            {design.icon}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <h3 className="text-xs sm:text-sm font-bold truncate" style={{ color: colorThemeConfig.textPrimary }}>
                              {entry.title}
                            </h3>
                            <p className="text-[11px] truncate leading-tight mt-0.5" style={{ color: colorThemeConfig.textSecondary }}>
                              {entry.preview}
                            </p>
                          </div>
                        </div>

                        {/* Right: Timestamp, Mood Badge Pill, Menu */}
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[11px] hidden sm:inline-block" style={{ color: colorThemeConfig.textSecondary }}>
                            {entry.formattedDate}
                          </span>

                          <span
                            className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${design.badge}`}
                          >
                            {entry.mood}
                          </span>

                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveEntryMenu(activeEntryMenu === entry.id ? null : entry.id);
                              }}
                              className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-md hover:bg-neutral-200/50 dark:hover:bg-neutral-800 cursor-pointer"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>

                            {activeEntryMenu === entry.id && (
                              <div 
                                className="absolute right-0 mt-1 w-32 rounded-xl border shadow-lg py-1 z-30 text-xs"
                                style={{
                                  backgroundColor: colorThemeConfig.bgSurface,
                                  borderColor: colorThemeConfig.border
                                }}
                              >
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setActiveEntryMenu(null);
                                    if (user?.uid) {
                                      await deleteJournalEntry(user.uid, entry.id);
                                      showToast('Journal entry deleted.');
                                    }
                                  }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 font-medium cursor-pointer"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    );
                  })
                )}
              </div>

            </div>

          </div>

          {/* ======================================================= */}
          {/* RIGHT 4-COL: LUMA AI Companion & Your Insights Donut    */}
          {/* ======================================================= */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            
            {/* 1. LUMA AI Companion Card */}
            <div 
              className="rounded-3xl p-4 sm:p-5 border shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between relative overflow-hidden transition-colors duration-300"
              style={{
                backgroundColor: colorThemeConfig.bgSurface,
                borderColor: colorThemeConfig.border
              }}
            >
              
              {/* Header: Title & Subtitle + 3D Glowing Sphere with Emblem */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold tracking-tight" style={{ color: colorThemeConfig.textPrimary }}>
                    <Sparkles className="w-3.5 h-3.5 text-[#FD6B31]" />
                    <span>LUMA AI Companion</span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: colorThemeConfig.textSecondary }}>
                    {getPersonaSubtitle()}
                  </p>
                </div>

                {/* 3D Glowing Floating Sphere with LUMA Logo */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFE7D6] via-[#FFD2B8] to-[#FD6B31]/30 dark:from-orange-950/50 dark:to-orange-800/30 ring-2 ring-orange-200/60 dark:ring-orange-800/50 shadow-[0_4px_16px_rgba(253,107,49,0.25)] flex items-center justify-center relative overflow-hidden shrink-0">
                  <div className="absolute top-1 left-2 w-3 h-1.5 rounded-full bg-white/70 blur-[0.3px]" />
                  <img
                    src="/luma-emblem.png"
                    alt=""
                    className="w-5 h-auto object-contain drop-shadow-xs"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/luma-logo.png';
                    }}
                  />
                </div>
              </div>

              {/* Input: How can I help you today? with mic button */}
              <div className="relative mb-3">
                <input
                  id="ai-companion-prompt-input"
                  type="text"
                  placeholder="How can I help you today?"
                  value={aiCompanionPrompt}
                  onChange={(e) => setAiCompanionPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAskLumaAI();
                  }}
                  className="w-full border rounded-full pl-3.5 pr-10 py-2 text-xs focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-200 transition-all shadow-2xs"
                  style={{
                    backgroundColor: darkMode ? '#161616' : '#FAF7F2',
                    borderColor: darkMode ? 'rgba(255,255,255,0.12)' : '#E5E0D8',
                    color: darkMode ? '#F5F5F5' : '#1A1C1C'
                  }}
                />
                <button
                  id="ai-companion-send-btn"
                  type="button"
                  disabled={aiLoading}
                  onClick={() => handleAskLumaAI()}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black dark:bg-[#FD6B31] text-white flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer"
                >
                  {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mic className="w-3 h-3" />}
                </button>
              </div>

              {/* 3 Persona-Adaptive Prompt Action Chips */}
              <div className="space-y-2">
                {getPersonaChips().map((chip) => (
                  <button
                    key={chip.id}
                    id={`ai-chip-${chip.id}`}
                    type="button"
                    onClick={() => handleAskLumaAI(chip.prompt)}
                    className="w-full flex items-center justify-between p-2.5 rounded-2xl border transition-all text-left cursor-pointer group"
                    style={{
                      backgroundColor: darkMode ? 'rgba(255,255,255,0.04)' : '#FAF7F2',
                      borderColor: darkMode ? 'rgba(255,255,255,0.08)' : '#E5E0D8'
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <div className="shrink-0">{chip.icon}</div>
                      <span className="text-xs font-semibold truncate" style={{ color: colorThemeConfig.textPrimary }}>
                        {chip.label}
                      </span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-neutral-400 group-hover:text-[#FD6B31] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>

            </div>

            {/* 2. Your Insights Card with Dynamic Real-Time Donut Chart */}
            <div 
              className="rounded-3xl p-4 sm:p-5 border shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex-1 flex flex-col justify-between transition-colors duration-300"
              style={{
                backgroundColor: colorThemeConfig.bgSurface,
                borderColor: colorThemeConfig.border
              }}
            >
              
              {/* Header with Real-time Live Indicator */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs sm:text-sm font-bold tracking-tight" style={{ color: colorThemeConfig.textPrimary }}>
                    Your Insights
                  </h2>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                    </span>
                    <span>Real-time Sync</span>
                  </div>
                </div>

                <div 
                  className="flex items-center gap-1 text-xs font-medium border rounded-lg px-2 py-0.5 cursor-pointer"
                  style={{
                    backgroundColor: darkMode ? 'rgba(255,255,255,0.04)' : '#FAF7F2',
                    borderColor: darkMode ? 'rgba(255,255,255,0.08)' : '#E5E0D8',
                    color: colorThemeConfig.textSecondary
                  }}
                  onClick={() => {
                    if (user?.uid) {
                      fetchAggregatedInsights(user.uid).then(setInsights);
                      showToast('Refreshed real-time insights.');
                    }
                  }}
                  title="Click to re-fetch"
                >
                  <span>This Week</span>
                  <ChevronDown className="w-3 h-3" />
                </div>
              </div>

              {/* Donut Chart & Legend */}
              <div className="flex items-center justify-between gap-3 my-2">
                
                {/* SVG Donut Chart with Centered Score */}
                <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    {/* Background Ring */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      stroke={darkMode ? '#262626' : '#F3F4F6'}
                      strokeWidth="10"
                      fill="none"
                    />

                    {/* Dynamic Real-Time Donut Segments */}
                    {insights.hasData && insights.distribution.length > 0 ? (
                      (() => {
                        const C = 2 * Math.PI * 38;
                        let accumulated = 0;
                        return insights.distribution.map((item, index) => {
                          const strokeLen = (item.percentage / 100) * C;
                          const strokeGap = Math.max(0, C - strokeLen);
                          const currentOffset = -accumulated;
                          accumulated += strokeLen;
                          return (
                            <circle
                              key={item.label}
                              cx="50"
                              cy="50"
                              r="38"
                              stroke={item.color}
                              strokeWidth="10"
                              strokeDasharray={`${strokeLen.toFixed(1)} ${strokeGap.toFixed(1)}`}
                              strokeDashoffset={currentOffset.toFixed(1)}
                              fill="none"
                              strokeLinecap={insights.distribution.length === 1 ? 'round' : 'butt'}
                              className="transition-all duration-700 ease-out"
                            />
                          );
                        });
                      })()
                    ) : (
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        stroke={darkMode ? '#404040' : '#D1D5DB'}
                        strokeWidth="8"
                        strokeDasharray="4 4"
                        fill="none"
                      />
                    )}
                  </svg>

                  {/* Center Metric Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                    <span className="text-xl font-bold text-neutral-900 dark:text-white leading-none">
                      {insights.hasData ? `${insights.productivityScore}%` : '0%'}
                    </span>
                    <span className="text-[8px] font-semibold text-neutral-500 dark:text-neutral-400 leading-tight mt-0.5">
                      {insights.hasData ? 'Activity Score' : 'No Logs Yet'}
                    </span>
                    <span className="text-[7.5px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
                      {insights.hasData 
                        ? (insights.scoreDelta >= 0 ? `+${insights.scoreDelta}% this week` : `${insights.scoreDelta}% this week`)
                        : 'Ready to track'}
                    </span>
                  </div>
                </div>

                {/* Legend List or Clean Empty State */}
                {insights.hasData && insights.distribution.length > 0 ? (
                  <div className="space-y-1.5 flex-1 pl-2 min-w-0">
                    {insights.distribution.map((item) => (
                      <div key={item.label} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300 truncate">
                            {item.label} ({item.count})
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-neutral-900 dark:text-white shrink-0 ml-1">
                          {item.percentage}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 pl-2 flex flex-col justify-center">
                    <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      Awaiting your first entries
                    </p>
                    <p className="text-[10.5px] text-neutral-500 dark:text-neutral-400 mt-1 leading-snug">
                      Log your mood or create a journal to see your live breakdown.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowDailyMoodModal(true)}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#FD6B31] hover:text-orange-600 transition-colors cursor-pointer self-start"
                    >
                      <span>Log mood now</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

              </div>

              {/* Bottom Dynamic Quote Block */}
              {insights.hasData ? (
                (() => {
                  const quotesByMood: Record<string, string> = {
                    Calm: 'A calm mind turns complex engineering challenges into clear, solvable milestones.',
                    Focused: 'Deep focus creates compounding momentum. Build with steady rhythm and precision.',
                    Motivated: 'Channel this motivation toward your highest leverage task first.',
                    Learning: 'Mastery of new architecture compounds quickly into effortless technical leverage.',
                    Amazing: 'High creative energy is rare and catalytic. Build something exceptional today.',
                    Happy: 'Gratitude and positivity clear mental friction and elevate your execution.'
                  };
                  const text = (insights.topMood && quotesByMood[insights.topMood]) || 'Consistent daily reflections build compounding clarity and mental resilience.';
                  return (
                    <div 
                      className="border rounded-2xl p-3 flex items-start gap-1.5 mt-2 transition-colors duration-300"
                      style={{
                        backgroundColor: darkMode ? 'rgba(253, 107, 49, 0.08)' : '#FFF8F2',
                        borderColor: darkMode ? 'rgba(253, 107, 49, 0.22)' : '#FFE7D6'
                      }}
                    >
                      <span className="text-lg font-serif leading-none text-[#FD6B31] font-bold select-none">
                        “
                      </span>
                      <div className="flex flex-col flex-1">
                        <p className="text-[10.5px] font-medium leading-tight" style={{ color: colorThemeConfig.textPrimary }}>
                          {text}
                        </p>
                        <span className="text-[9.5px] mt-1 flex items-center gap-1" style={{ color: colorThemeConfig.textSecondary }}>
                          <span>— LUMA AI</span>
                          <span className="w-1 h-1 rounded-full bg-[#FD6B31]"></span>
                          <span>Real-time insight</span>
                        </span>
                      </div>
                      <span className="text-lg font-serif leading-none text-[#FD6B31] font-bold select-none ml-auto">
                        ”
                      </span>
                    </div>
                  );
                })()
              ) : (
                <div 
                  className="border rounded-2xl p-3 flex items-start gap-1.5 mt-2 transition-colors duration-300"
                  style={{
                    backgroundColor: darkMode ? 'rgba(253, 107, 49, 0.08)' : '#FFF8F2',
                    borderColor: darkMode ? 'rgba(253, 107, 49, 0.22)' : '#FFE7D6'
                  }}
                >
                  <span className="text-lg font-serif leading-none text-[#FD6B31] font-bold select-none">
                    “
                  </span>
                  <div className="flex flex-col">
                    <p className="text-[10.5px] font-medium leading-tight" style={{ color: colorThemeConfig.textPrimary }}>
                      Every journey starts with a single reflection. Write a quick entry or log your mood to begin your personal tracking.
                    </p>
                    <span className="text-[9.5px] mt-1" style={{ color: colorThemeConfig.textSecondary }}>
                      — LUMA AI
                    </span>
                  </div>
                  <span className="text-lg font-serif leading-none text-[#FD6B31] font-bold select-none ml-auto">
                    ”
                  </span>
                </div>
              )}

            </div>

          </div>

            </div>
          )}

        </main>

      </div>

      {/* ========================================================= */}
      {/* 3. NEW JOURNAL MODAL                                      */}
      {/* ========================================================= */}
      <AnimatePresence>
        {showNewJournalModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="rounded-3xl p-6 w-full max-w-lg shadow-2xl border relative transition-colors duration-300"
              style={{
                backgroundColor: colorThemeConfig.bgSurface,
                borderColor: colorThemeConfig.border
              }}
            >
              <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: darkMode ? 'rgba(255,255,255,0.08)' : '#F0EBE3' }}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[#FD6B31]" style={{ backgroundColor: darkMode ? 'rgba(253,107,49,0.15)' : '#FFF2E8' }}>
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold" style={{ color: colorThemeConfig.textPrimary }}>New Journal Entry</h3>
                    <p className="text-[11px]" style={{ color: colorThemeConfig.textSecondary }}>Capture your reflection and insights</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowNewJournalModal(false)}
                  className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-bold block mb-1" style={{ color: colorThemeConfig.textPrimary }}>Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Deep Work Session & Wins"
                    value={journalTitle}
                    onChange={(e) => setJournalTitle(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-300"
                    style={{
                      backgroundColor: darkMode ? '#161616' : '#FAF7F2',
                      borderColor: darkMode ? 'rgba(255,255,255,0.12)' : '#E5E0D8',
                      color: colorThemeConfig.textPrimary
                    }}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold block mb-1" style={{ color: colorThemeConfig.textPrimary }}>Your Reflection</label>
                  <textarea
                    rows={4}
                    placeholder="Write what you accomplished, what challenged you, and what you are grateful for..."
                    value={journalContent}
                    onChange={(e) => setJournalContent(e.target.value)}
                    className="w-full border rounded-xl p-3 text-xs focus:outline-none focus:border-orange-300"
                    style={{
                      backgroundColor: darkMode ? '#161616' : '#FAF7F2',
                      borderColor: darkMode ? 'rgba(255,255,255,0.12)' : '#E5E0D8',
                      color: colorThemeConfig.textPrimary
                    }}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold block mb-1" style={{ color: colorThemeConfig.textPrimary }}>Mood Tag</label>
                  <div className="flex gap-2">
                    {['Calm', 'Motivated', 'Happy', 'Focused'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setJournalMood(m)}
                        className={`text-xs px-3 py-1 rounded-full border transition-all cursor-pointer ${
                          journalMood === m
                            ? 'bg-[#FD6B31] text-white border-[#FD6B31] font-semibold'
                            : 'border hover:opacity-80'
                        }`}
                        style={journalMood !== m ? {
                          backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : '#FAF7F2',
                          borderColor: darkMode ? 'rgba(255,255,255,0.12)' : '#E5E0D8',
                          color: colorThemeConfig.textPrimary
                        } : {}}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t flex items-center justify-end gap-2" style={{ borderColor: darkMode ? 'rgba(255,255,255,0.08)' : '#F0EBE3' }}>
                <button
                  type="button"
                  onClick={() => setShowNewJournalModal(false)}
                  className="px-4 py-2 rounded-full text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  style={{ color: colorThemeConfig.textSecondary }}
                >
                  Cancel
                </button>
                <button
                  id="save-new-journal-btn"
                  type="button"
                  disabled={savingJournal}
                  onClick={handleSaveJournal}
                  className="px-6 py-2 rounded-full text-white text-xs font-medium flex items-center gap-1.5 shadow-xs cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#FD6B31' }}
                >
                  {savingJournal ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Journal</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* 4. AI COMPANION RESPONSE MODAL                            */}
      {/* ========================================================= */}
      <AnimatePresence>
        {aiResponseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="rounded-3xl p-6 w-full max-w-lg shadow-2xl border relative max-h-[85vh] flex flex-col transition-colors duration-300"
              style={{
                backgroundColor: colorThemeConfig.bgSurface,
                borderColor: colorThemeConfig.border
              }}
            >
              <div className="flex items-center justify-between pb-3 border-b shrink-0" style={{ borderColor: darkMode ? 'rgba(255,255,255,0.08)' : '#F0EBE3' }}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[#FD6B31]" style={{ backgroundColor: darkMode ? 'rgba(253,107,49,0.15)' : '#FFF2E8' }}>
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold truncate max-w-xs" style={{ color: colorThemeConfig.textPrimary }}>{aiResponseModal.title}</h3>
                    <p className="text-[10px]" style={{ color: colorThemeConfig.textSecondary }}>LUMA AI Companion</p>
                  </div>
                </div>
                <button
                  onClick={() => setAiResponseModal(null)}
                  className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div 
                className="my-4 overflow-y-auto pr-1 text-xs leading-relaxed whitespace-pre-line p-4 rounded-2xl border font-mono"
                style={{
                  backgroundColor: darkMode ? '#161616' : '#FAF7F2',
                  borderColor: darkMode ? 'rgba(255,255,255,0.08)' : '#E5E0D8',
                  color: colorThemeConfig.textPrimary
                }}
              >
                {aiResponseModal.content}
              </div>

              <div className="pt-3 border-t flex items-center justify-between shrink-0" style={{ borderColor: darkMode ? 'rgba(255,255,255,0.08)' : '#F0EBE3' }}>
                <button
                  type="button"
                  onClick={() => {
                    setJournalTitle(aiResponseModal.title);
                    setJournalContent(aiResponseModal.content);
                    setAiResponseModal(null);
                    setShowNewJournalModal(true);
                  }}
                  className="text-xs text-[#FD6B31] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Save as Journal Entry</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setAiResponseModal(null)}
                  className="px-5 py-2 rounded-full text-white text-xs font-medium cursor-pointer hover:opacity-90"
                  style={{ backgroundColor: '#FD6B31' }}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Daily Login Mood & Thought Modal */}
      <DailyMoodModal
        isOpen={showDailyMoodModal}
        onClose={() => {
          if (user?.uid) {
            sessionStorage.setItem(`luma_mood_prompted_session_${user.uid}`, 'true');
          }
          setShowDailyMoodModal(false);
        }}
        onSkip={handleDailyMoodSkip}
        onComplete={handleDailyMoodComplete}
        userId={user?.uid}
        existingMood={selectedMood as MoodKey}
        existingThought={todayThought}
      />

    </div>
  );
};
