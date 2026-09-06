import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ArrowRight, X, Check, Quote } from 'lucide-react';
import { doc, setDoc, addDoc, collection, serverTimestamp, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { createJournalEntry } from '../services/dashboardService';

export type MoodKey = 'Amazing' | 'Good' | 'Calm' | 'Stressed' | 'Sad' | 'Angry';

export interface MoodOption {
  key: MoodKey;
  label: string;
  emoji: string;
  score: number;
  bgGradient: string;
  hoverBorder: string;
  ringColor: string;
  textColor: string;
  badgeBg: string;
  quotes: string[];
}

export const MOOD_OPTIONS: Record<MoodKey, MoodOption> = {
  Amazing: {
    key: 'Amazing',
    label: 'Amazing / Motivated',
    emoji: '😍',
    score: 95,
    bgGradient: 'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20',
    hoverBorder: 'hover:border-amber-400 dark:hover:border-amber-500',
    ringColor: 'ring-amber-400/30',
    textColor: 'text-amber-800 dark:text-amber-300',
    badgeBg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-700',
    quotes: [
      "You have unstoppable momentum. Channel it into your biggest target today.",
      "Inspiration dies fast without execution. Use this spark on your hardest task first.",
      "High energy is a catalyst. Build something exceptional today."
    ]
  },
  Good: {
    key: 'Good',
    label: 'Good / Happy',
    emoji: '😊',
    score: 85,
    bgGradient: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20',
    hoverBorder: 'hover:border-emerald-400 dark:hover:border-emerald-500',
    ringColor: 'ring-emerald-400/30',
    textColor: 'text-emerald-800 dark:text-emerald-300',
    badgeBg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
    quotes: [
      "Great energy creates great results. Start with your highest priority first.",
      "A positive mindset is a force multiplier. Let this momentum drive your focus.",
      "Positivity clears the path. Turn today's good mood into tangible progress."
    ]
  },
  Calm: {
    key: 'Calm',
    label: 'Calm',
    emoji: '😌',
    score: 80,
    bgGradient: 'from-sky-50 to-indigo-50 dark:from-sky-950/30 dark:to-indigo-950/20',
    hoverBorder: 'hover:border-sky-400 dark:hover:border-sky-500',
    ringColor: 'ring-sky-400/30',
    textColor: 'text-sky-800 dark:text-sky-300',
    badgeBg: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300 border-sky-200 dark:border-sky-700',
    quotes: [
      "A quiet mind sees solutions clearly. Build today with steady focus.",
      "Clarity is a rare advantage. Use this quiet focus to solve complex problems.",
      "Stillness leads to precision. Work calmly and let quality speak."
    ]
  },
  Stressed: {
    key: 'Stressed',
    label: 'Stressed',
    emoji: '😰',
    score: 50,
    bgGradient: 'from-orange-50 to-rose-50 dark:from-orange-950/30 dark:to-rose-950/20',
    hoverBorder: 'hover:border-orange-400 dark:hover:border-orange-500',
    ringColor: 'ring-orange-400/30',
    textColor: 'text-orange-800 dark:text-orange-300',
    badgeBg: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300 border-orange-200 dark:border-orange-700',
    quotes: [
      "Take a deep breath. Focus on finishing just one small step right now.",
      "Pressure means you're tackling something that matters—break it into one action item.",
      "Scale back the noise. Pick your top task and ignore the rest for now."
    ]
  },
  Sad: {
    key: 'Sad',
    label: 'Sad',
    emoji: '😢',
    score: 40,
    bgGradient: 'from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-950/20',
    hoverBorder: 'hover:border-blue-400 dark:hover:border-blue-500',
    ringColor: 'ring-blue-400/30',
    textColor: 'text-blue-800 dark:text-blue-300',
    badgeBg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 border-blue-200 dark:border-blue-700',
    quotes: [
      "Progress isn't always fast. Go easy on yourself and take it one step at a time.",
      "Rest is an active part of progress, not a reward for it. Protect your energy today.",
      "Small steps still move you forward. Focus on gentle, consistent effort."
    ]
  },
  Angry: {
    key: 'Angry',
    label: 'Angry',
    emoji: '😡',
    score: 35,
    bgGradient: 'from-rose-50 to-red-50 dark:from-rose-950/30 dark:to-red-950/20',
    hoverBorder: 'hover:border-rose-400 dark:hover:border-rose-500',
    ringColor: 'ring-rose-400/30',
    textColor: 'text-rose-800 dark:text-rose-300',
    badgeBg: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300 border-rose-200 dark:border-rose-700',
    quotes: [
      "Pause for a second. Turn that intense energy into quiet, laser-focused execution.",
      "Frustration often precedes a major breakthrough. Channel it into fixing the bottleneck.",
      "Use this friction as fuel. Direct your focus entirely onto the code/solution."
    ]
  }
};

/**
 * Strips all undefined properties from an object to ensure zero-crash Firestore writes
 */
function sanitizePayload<T extends Record<string, any>>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_, value) => (value === undefined ? null : value)));
}

/**
 * Calculates a dynamic, daily-rotating quote index for the given pool so that
 * today's quote differs from tomorrow's quote deterministically.
 */
export function getRotatingThoughtOfDay(moodKey?: MoodKey | string): string {
  const safeKey = (moodKey && MOOD_OPTIONS[moodKey as MoodKey]) ? (moodKey as MoodKey) : 'Calm';
  const option = MOOD_OPTIONS[safeKey];
  const pool = option.quotes;
  const dayIndex = Math.floor(Date.now() / 86400000) % pool.length;
  return pool[dayIndex];
}

/**
 * Checks if the user has already submitted a mood entry today (in localStorage or Firestore)
 */
export async function checkHasUserMoodToday(userId: string): Promise<{
  hasSubmitted: boolean;
  mood?: MoodKey;
  thought?: string;
}> {
  const todayString = new Date().toISOString().split('T')[0];

  // 1. Fast check via localStorage
  try {
    const cachedDate = localStorage.getItem(`luma_last_mood_${userId}`);
    if (cachedDate === todayString) {
      const cachedMood = localStorage.getItem(`luma_today_mood_val_${userId}`) as MoodKey;
      const cachedThought = localStorage.getItem(`luma_today_thought_${userId}`) || undefined;
      return {
        hasSubmitted: true,
        mood: cachedMood && MOOD_OPTIONS[cachedMood] ? cachedMood : 'Calm',
        thought: cachedThought
      };
    }
  } catch (_) {}

  // 2. Authoritative check via Firestore users/{userId}
  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.lastMoodDate === todayString) {
        const moodKey = (data.lastMood as MoodKey) || 'Calm';
        const thought = data.todayThought || getRotatingThoughtOfDay(moodKey);

        // Warm local cache
        try {
          localStorage.setItem(`luma_last_mood_${userId}`, todayString);
          localStorage.setItem(`luma_today_mood_val_${userId}`, moodKey);
          localStorage.setItem(`luma_today_thought_${userId}`, thought);
        } catch (_) {}

        return {
          hasSubmitted: true,
          mood: moodKey,
          thought
        };
      }
    }
  } catch (err) {
    console.warn('Daily mood verification check notice:', err);
  }

  return { hasSubmitted: false };
}

interface DailyMoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (selectedMood: MoodKey, thought: string) => void;
  onSkip?: () => void;
  userId?: string;
  initialStep?: 1 | 2;
  existingMood?: MoodKey | string;
  existingThought?: string;
}

export const DailyMoodModal: React.FC<DailyMoodModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  onSkip,
  userId,
  initialStep = 1,
  existingMood = 'Calm',
  existingThought
}) => {
  const safeExistingMood: MoodKey = (existingMood && MOOD_OPTIONS[existingMood as MoodKey]) ? (existingMood as MoodKey) : 'Calm';
  const [step, setStep] = useState<1 | 2>(initialStep);
  const [selectedMood, setSelectedMood] = useState<MoodKey>(safeExistingMood);
  const [todayThought, setTodayThought] = useState<string>(existingThought || '');

  useEffect(() => {
    if (isOpen) {
      setStep(initialStep);
      const safeMood: MoodKey = (existingMood && MOOD_OPTIONS[existingMood as MoodKey]) ? (existingMood as MoodKey) : 'Calm';
      setSelectedMood(safeMood);
      if (existingThought) {
        setTodayThought(existingThought);
      } else {
        setTodayThought(getRotatingThoughtOfDay(safeMood));
      }
    }
  }, [isOpen, initialStep, existingMood, existingThought]);

  if (!isOpen) return null;

  const handleSelectMood = (moodKey: MoodKey) => {
    // 1. Instantaneous UI Transition - Never block on network!
    setSelectedMood(moodKey);
    const calculatedThought = getRotatingThoughtOfDay(moodKey);
    setTodayThought(calculatedThought);
    setStep(2);

    // Notify parent immediately so dashboard metrics and active topic update in real time
    if (onComplete) {
      onComplete(moodKey, calculatedThought);
    }

    const todayString = new Date().toISOString().split('T')[0];
    const activeUid = userId || auth.currentUser?.uid;

    // 2. Cache locally for immediate persistence
    if (activeUid) {
      try {
        localStorage.setItem(`luma_last_mood_${activeUid}`, todayString);
        localStorage.setItem(`luma_today_mood_val_${activeUid}`, moodKey);
        localStorage.setItem(`luma_today_thought_${activeUid}`, calculatedThought);
      } catch (_) {}

      // 3. Persist to Cloud Firestore & App Journal Cache in the background
      (async () => {
        try {
          const userRef = doc(db, 'users', activeUid);
          const userUpdatePayload = sanitizePayload({
            lastMood: moodKey,
            lastMoodDate: todayString,
            todayThought: calculatedThought,
            updatedAt: serverTimestamp()
          });
          await setDoc(userRef, userUpdatePayload, { merge: true });

          // Also record a daily check-in journal entry through dashboard service
          await createJournalEntry(activeUid, {
            title: `Mindset: ${moodKey}`,
            content: calculatedThought,
            mood: moodKey,
            tag: moodKey,
            role: 'Daily Mindset'
          });

          // Also save in user journals subcollection for direct Firestore consistency
          const userJournalsRef = collection(db, 'users', activeUid, 'journals');
          const journalSnapshotPayload = sanitizePayload({
            userId: activeUid,
            title: `Mindset: ${moodKey}`,
            content: calculatedThought,
            preview: calculatedThought.slice(0, 75) + '...',
            mood: moodKey,
            tag: moodKey,
            type: 'daily_checkin',
            createdAt: serverTimestamp()
          });
          await addDoc(userJournalsRef, journalSnapshotPayload);
        } catch (error) {
          console.warn('Notice persisting daily mood to Firestore:', error);
        }
      })();
    }
  };

  const handleEnterWorkspace = () => {
    if (onComplete) {
      onComplete(selectedMood, todayThought);
    }
    onClose();
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    }
    onClose();
  };

  const currentOption = MOOD_OPTIONS[selectedMood] || MOOD_OPTIONS.Calm;

  return (
    <div
      id="daily-mood-modal-backdrop"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        id="daily-mood-modal-card"
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-lg overflow-hidden bg-white dark:bg-neutral-900 border border-neutral-200/90 dark:border-neutral-800 rounded-3xl shadow-2xl z-[101]"
      >
        {/* Top Decorative Header Accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-orange-400 via-amber-500 to-rose-500" />

        {/* Close Button */}
        <button
          id="daily-mood-modal-close-btn"
          type="button"
          onClick={handleSkip}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer z-10"
          title="Close dialog"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Content */}
        <div className="p-6 sm:p-8">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              /* ========================================================= */
              /* STEP 1: MOOD SELECTION SCREEN                             */
              /* ========================================================= */
              <motion.div
                key="step-1-mood-selection"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.22 }}
                className="flex flex-col"
              >
                {/* Brand & Sparkle Badge */}
                <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full bg-orange-50 dark:bg-orange-950/40 border border-orange-200/80 dark:border-orange-800/60 text-[#EA580C] dark:text-orange-400 text-xs font-semibold w-fit">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Daily Mindset Check-In</span>
                </div>

                {/* Title & Subtitle */}
                <h2
                  id="daily-mood-modal-title"
                  className="font-serif-luma text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white tracking-tight leading-tight"
                >
                  How are you feeling today?
                </h2>
                <p className="text-neutral-600 dark:text-neutral-400 text-xs sm:text-sm mt-1.5 leading-relaxed">
                  Select your current mindset to personalize your AI companion &amp; workspace.
                </p>

                {/* 6 Mood Options Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
                  {(Object.keys(MOOD_OPTIONS) as MoodKey[]).map((mKey) => {
                    const option = MOOD_OPTIONS[mKey];
                    const isSelected = selectedMood === mKey;
                    return (
                      <button
                        key={mKey}
                        id={`daily-mood-option-${mKey.toLowerCase()}`}
                        type="button"
                        onClick={() => handleSelectMood(mKey)}
                        className={`group relative flex flex-col items-center text-center p-3.5 sm:p-4 rounded-2xl border transition-all duration-150 cursor-pointer focus:outline-none select-none active:scale-95 ${option.bgGradient} ${
                          isSelected
                            ? `border-orange-500 ring-2 ${option.ringColor} shadow-md scale-[1.02]`
                            : `border-neutral-200/80 dark:border-neutral-700/80 ${option.hoverBorder} hover:shadow-sm hover:scale-[1.02]`
                        }`}
                      >
                        <span className="text-3xl sm:text-4xl mb-2 filter drop-shadow-xs transition-transform group-hover:scale-110">
                          {option.emoji}
                        </span>
                        <span className="text-xs font-bold text-neutral-800 dark:text-neutral-100 leading-snug">
                          {option.label}
                        </span>

                        {isSelected && (
                          <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-xs">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 flex items-center justify-center text-center text-[11px] text-neutral-400 dark:text-neutral-500">
                  <span>Rotates thought of the day automatically</span>
                </div>
              </motion.div>
            ) : (
              /* ========================================================= */
              /* STEP 2: DYNAMIC "THOUGHT OF THE DAY" REVEAL SCREEN        */
              /* ========================================================= */
              <motion.div
                key="step-2-thought-reveal"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col"
              >
                {/* Header Tag with Mood */}
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/40 border border-orange-200/80 dark:border-orange-800/60 text-[#EA580C] dark:text-orange-400 text-xs font-semibold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Thought of the Day</span>
                  </div>

                  {/* Selected Mood Chip */}
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${currentOption.badgeBg}`}>
                    <span>{currentOption.emoji}</span>
                    <span>{currentOption.label}</span>
                  </div>
                </div>

                {/* Subtitle */}
                <h3 className="font-serif-luma text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white tracking-tight leading-snug">
                  Your Daily Mindset Spark
                </h3>
                <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">
                  Tailored to fuel clarity, focus, and purposeful momentum.
                </p>

                {/* Prominent Quote Card */}
                <div className="relative my-6 p-6 sm:p-7 rounded-2xl bg-gradient-to-br from-[#FFF9F5] via-[#FFF3EB] to-[#FDE8D8] dark:from-neutral-800/90 dark:via-neutral-800/60 dark:to-neutral-800/40 border border-[#F5DAC6] dark:border-neutral-700/80 shadow-[0_4px_24px_rgba(234,88,12,0.06)]">
                  <Quote className="w-8 h-8 text-[#EA580C]/25 dark:text-orange-400/20 mb-2" />
                  <p
                    id="daily-mood-thought-quote"
                    className="font-serif-luma text-base sm:text-lg font-medium text-neutral-900 dark:text-neutral-100 leading-relaxed italic"
                  >
                    &ldquo;{todayThought}&rdquo;
                  </p>
                  <div className="mt-4 flex items-center justify-between text-[11px] text-[#C25E2E] dark:text-orange-300 font-medium">
                    <span>LUMA Daily Reflection</span>
                    <span className="font-script-luma text-sm font-semibold">Small Steps, Big Changes</span>
                  </div>
                </div>

                {/* Action Buttons: Enter Workspace */}
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <button
                    id="daily-mood-enter-workspace-btn"
                    type="button"
                    onClick={handleEnterWorkspace}
                    className="w-full sm:flex-1 py-3 px-5 rounded-xl bg-black hover:bg-neutral-800 active:bg-neutral-900 dark:bg-white dark:hover:bg-neutral-100 dark:active:bg-neutral-200 text-white dark:text-black font-semibold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer group"
                  >
                    <span>Enter Workspace</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-full sm:w-auto py-3 px-4 text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Change Mood
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
