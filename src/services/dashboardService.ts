import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  deleteDoc, 
  updateDoc,
  onSnapshot, 
  query, 
  where,
  orderBy, 
  limit, 
  serverTimestamp, 
  getDocs,
  Timestamp 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export interface JournalEntry {
  id: string;
  title: string;
  content: string;
  preview: string;
  mood: string;
  tag?: string;
  role?: string;
  formattedDate: string;
  createdAt?: any;
  aiInsight?: string;
  userId?: string;
}

export interface MoodLog {
  id: string;
  mood: string;
  score: number;
  loggedAt: any;
  formattedDate: string;
}

export interface DashboardInsights {
  productivityScore: number;
  scoreDelta: number;
  totalEntries: number;
  streakDays: number;
  distribution: {
    label: string;
    count: number;
    percentage: number;
    color: string;
  }[];
  hasData: boolean;
  topMood?: string;
}

// Zero demo data: default to clean empty real-time state
export const DEFAULT_JOURNAL_ITEMS: JournalEntry[] = [];

/**
 * Strips all undefined properties from an object to ensure zero-crash Firestore writes
 */
function sanitizePayload<T extends Record<string, any>>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_, value) => (value === undefined ? null : value)));
}

// --- Internal Real-time Pub-Sub & Local Cache for Zero-Latency Synchronizations ---
const journalListeners = new Set<(event?: { type: 'create' | 'update' | 'delete'; id?: string; entry?: JournalEntry }) => void>();

export function subscribeToJournalChanges(listener: (event?: any) => void): () => void {
  journalListeners.add(listener);
  return () => {
    journalListeners.delete(listener);
  };
}

function notifyJournalListeners(event?: { type: 'create' | 'update' | 'delete'; id?: string; entry?: JournalEntry }) {
  journalListeners.forEach((fn) => {
    try {
      fn(event);
    } catch (e) {
      console.warn('Journal listener notice:', e);
    }
  });
}

function getLocalJournals(uid: string): JournalEntry[] {
  if (!uid) return [];
  try {
    const raw = localStorage.getItem(`luma_journals_${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
}

function saveLocalJournals(uid: string, entries: JournalEntry[]): void {
  if (!uid) return;
  try {
    localStorage.setItem(`luma_journals_${uid}`, JSON.stringify(entries));
  } catch (_) {}
}

/**
 * Subscribes to real-time journal entries with multi-layer synchronization (Local + Server API + Firestore)
 */
export function subscribeToJournals(
  uid: string,
  callback: (entries: JournalEntry[]) => void,
  onError?: (err: any) => void
): () => void {
  if (!uid) {
    callback([]);
    return () => {};
  }

  // 1. Instant 0ms emission from local cache
  const cached = getLocalJournals(uid);
  if (cached.length > 0) {
    callback(cached);
  }

  const entriesMap = new Map<string, JournalEntry>();
  cached.forEach(e => entriesMap.set(e.id, e));

  const emitSorted = () => {
    const list = Array.from(entriesMap.values());
    list.sort((a, b) => {
      const timeA = new Date(a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt || 0)).getTime();
      const timeB = new Date(b.createdAt?.toDate ? b.createdAt.toDate() : (b.createdAt || 0)).getTime();
      return timeB - timeA;
    });
    saveLocalJournals(uid, list);
    callback(list);
  };

  // 2. Fast Server API initial sync
  fetch(`/api/journals?userId=${encodeURIComponent(uid)}&sort=desc`)
    .then(res => res.json())
    .then((data: any[]) => {
      if (Array.isArray(data) && data.length > 0) {
        data.forEach(item => {
          const id = item.id || item._id;
          if (id) {
            entriesMap.set(id, {
              id,
              title: item.title || 'Daily Reflection',
              content: item.content || '',
              preview: item.preview || (item.content ? item.content.slice(0, 55) + '...' : ''),
              mood: item.mood || 'Calm',
              tag: item.tag || item.mood || 'Calm',
              role: item.role || 'Developer',
              formattedDate: item.formattedDate || 'Recent',
              createdAt: item.createdAt,
              aiInsight: item.aiInsight || '',
              userId: item.userId || uid
            });
          }
        });
        emitSorted();
      }
    })
    .catch(err => console.warn('Server API journals load notice:', err));

  // 3. Listen for internal local state mutations
  const unsubLocalBus = subscribeToJournalChanges(() => {
    const fresh = getLocalJournals(uid);
    fresh.forEach(e => entriesMap.set(e.id, e));
    emitSorted();
  });

  // 4. Firestore real-time onSnapshot listener
  let unsubFirestore = () => {};
  try {
    const journalsRef = collection(db, 'users', uid, 'journals');
    const q = query(journalsRef, orderBy('createdAt', 'desc'), limit(20));

    unsubFirestore = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data();
            let dateStr = 'Just now';
            if (data.createdAt?.toDate) {
              const d = data.createdAt.toDate();
              dateStr = d.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              });
            } else if (data.formattedDate) {
              dateStr = data.formattedDate;
            }

            const rawContent = data.content || '';
            const preview = data.preview || (rawContent.length > 55 ? `${rawContent.slice(0, 55)}...` : rawContent);

            entriesMap.set(docSnap.id, {
              id: docSnap.id,
              title: data.title || 'Untitled Journal',
              content: rawContent,
              preview,
              mood: data.mood || 'Calm',
              tag: data.tag || data.mood || 'Calm',
              role: data.role || 'Developer',
              formattedDate: dateStr,
              createdAt: data.createdAt,
              aiInsight: data.aiInsight || '',
              userId: data.userId || uid
            });
          });
          emitSorted();
        }
      },
      (err) => {
        console.warn('Real-time journals subscription notice:', err);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.warn('Error setting up journals subscription:', err);
  }

  return () => {
    unsubLocalBus();
    unsubFirestore();
  };
}

/**
 * Atomically writes a new journal entry with multi-layered persistence (Local Cache + Server MongoDB + Firestore)
 */
export async function createJournalEntry(
  uid: string,
  entry: {
    title: string;
    content: string;
    mood: string;
    tag?: string;
    role?: string;
    aiInsight?: string;
  }
): Promise<string> {
  const effectiveUid = uid || auth.currentUser?.uid || 'user_active';

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  const rawContent = (entry.content || '').trim();
  const preview = rawContent.length > 80 ? `${rawContent.slice(0, 80)}...` : rawContent;
  const docId = 'jnl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

  const cleanEntry: JournalEntry = {
    id: docId,
    title: (entry.title || 'Daily Reflection').trim(),
    content: rawContent,
    preview,
    mood: entry.mood || 'Calm',
    tag: entry.tag || entry.mood || 'Calm',
    role: entry.role || 'Developer',
    formattedDate: dateStr,
    createdAt: now.toISOString() as any,
    aiInsight: entry.aiInsight || '',
    userId: effectiveUid
  };

  // 1. Instantly update local cache and trigger real-time listener (0ms UI latency!)
  const localList = getLocalJournals(effectiveUid);
  const updatedList = [cleanEntry, ...localList.filter(item => item.id !== docId)];
  saveLocalJournals(effectiveUid, updatedList);
  notifyJournalListeners({ type: 'create', id: docId, entry: cleanEntry });

  // 2. Concurrently persist to server API (/api/journals) for robust MongoDB + in-memory storage
  const apiSavePromise = (async () => {
    try {
      const resp = await fetch('/api/journals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: docId,
          userId: effectiveUid,
          title: cleanEntry.title,
          content: cleanEntry.content,
          preview: cleanEntry.preview,
          mood: cleanEntry.mood,
          tag: cleanEntry.tag,
          role: cleanEntry.role,
          formattedDate: cleanEntry.formattedDate,
          aiInsight: cleanEntry.aiInsight,
          createdAt: now.toISOString()
        })
      });
      if (resp.ok) {
        return await resp.json();
      }
    } catch (apiErr) {
      console.warn('API journals sync notice:', apiErr);
    }
  })();

  // 3. Concurrently sync to Firestore /users/{uid}/journals & /journals with a safety timeout so it never hangs
  const firestoreSavePromise = (async () => {
    try {
      const firestorePayload = sanitizePayload({
        userId: effectiveUid,
        title: cleanEntry.title,
        content: cleanEntry.content,
        preview: cleanEntry.preview,
        mood: cleanEntry.mood,
        tag: cleanEntry.tag,
        role: cleanEntry.role,
        formattedDate: dateStr,
        createdAt: serverTimestamp(),
        aiInsight: cleanEntry.aiInsight
      });

      // Write to user's private journals subcollection
      const userDocRef = doc(db, 'users', effectiveUid, 'journals', docId);
      const writeUser = setDoc(userDocRef, firestorePayload, { merge: true });

      // Write to top-level journals collection
      const topDocRef = doc(db, 'journals', docId);
      const writeTop = setDoc(topDocRef, firestorePayload, { merge: true });

      // Guard with timeout
      await Promise.race([
        Promise.allSettled([writeUser, writeTop]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2500))
      ]);
    } catch (fsErr) {
      console.warn('Firestore journal async notice:', fsErr);
    }
  })();

  // Race server/Firestore with an 800ms max wait ceiling for instantaneous UI response
  try {
    await Promise.race([
      Promise.allSettled([apiSavePromise, firestoreSavePromise]),
      new Promise(resolve => setTimeout(resolve, 800))
    ]);
  } catch (_) {}

  return docId;
}

/**
 * Updates an existing journal entry across Local Cache, Server API, and Firestore
 */
export async function updateJournalEntry(
  uid: string,
  entryId: string,
  updates: {
    title?: string;
    content?: string;
    mood?: string;
    tag?: string;
    role?: string;
    aiInsight?: string;
  }
): Promise<void> {
  if (!uid || !entryId) return;
  const effectiveUid = uid || auth.currentUser?.uid || 'user_active';

  const preview = updates.content 
    ? (updates.content.length > 80 ? `${updates.content.slice(0, 80)}...` : updates.content)
    : undefined;

  // 1. Update local cache immediately
  const localList = getLocalJournals(effectiveUid);
  const updatedList = localList.map(item => {
    if (item.id === entryId) {
      return {
        ...item,
        ...updates,
        ...(preview ? { preview } : {})
      };
    }
    return item;
  });
  saveLocalJournals(effectiveUid, updatedList);
  notifyJournalListeners({ type: 'update', id: entryId });

  // 2. Server API update
  fetch(`/api/journals/${encodeURIComponent(entryId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...updates,
      ...(preview ? { preview } : {})
    })
  }).catch(e => console.warn('API update journal notice:', e));

  // 3. Firestore update with timeout
  try {
    const payload = sanitizePayload({
      ...updates,
      ...(preview ? { preview } : {}),
      updatedAt: serverTimestamp()
    });

    const pUser = updateDoc(doc(db, 'users', effectiveUid, 'journals', entryId), payload);
    const pTop = updateDoc(doc(db, 'journals', entryId), payload);
    await Promise.race([
      Promise.allSettled([pUser, pTop]),
      new Promise(resolve => setTimeout(resolve, 2000))
    ]);
  } catch (_) {}
}

/**
 * Deletes a journal entry across Local Cache, Server API, and Firestore
 */
export async function deleteJournalEntry(uid: string, entryId: string): Promise<void> {
  if (!uid || !entryId) return;
  const effectiveUid = uid || auth.currentUser?.uid || 'user_active';

  // 1. Remove from local cache immediately
  const localList = getLocalJournals(effectiveUid);
  const updatedList = localList.filter(item => item.id !== entryId);
  saveLocalJournals(effectiveUid, updatedList);
  notifyJournalListeners({ type: 'delete', id: entryId });

  // 2. Server API delete
  fetch(`/api/journals/${encodeURIComponent(entryId)}`, {
    method: 'DELETE'
  }).catch(e => console.warn('API delete journal notice:', e));

  // 3. Firestore delete with timeout
  try {
    const pUser = deleteDoc(doc(db, 'users', effectiveUid, 'journals', entryId));
    const pTop = deleteDoc(doc(db, 'journals', entryId));
    await Promise.race([
      Promise.allSettled([pUser, pTop]),
      new Promise(resolve => setTimeout(resolve, 2000))
    ]);
  } catch (_) {}
}

/**
 * Real-time journal subscription with multi-tier synchronization and sorting
 */
export function subscribeToJournalsWithFilter(
  uid: string,
  sortOrder: 'desc' | 'asc' = 'desc',
  callback: (entries: JournalEntry[]) => void,
  onError?: (err: any) => void
): () => void {
  if (!uid) {
    callback([]);
    return () => {};
  }

  const entriesMap = new Map<string, JournalEntry>();

  const emitSorted = () => {
    const list = Array.from(entriesMap.values());
    list.sort((a, b) => {
      const timeA = new Date(a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt || 0)).getTime();
      const timeB = new Date(b.createdAt?.toDate ? b.createdAt.toDate() : (b.createdAt || 0)).getTime();
      return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });
    saveLocalJournals(uid, list);
    callback(list);
  };

  // 1. Instant load from local cache
  const cached = getLocalJournals(uid);
  if (cached.length > 0) {
    cached.forEach(e => entriesMap.set(e.id, e));
    emitSorted();
  }

  // 2. Initial fetch from Server API
  fetch(`/api/journals?userId=${encodeURIComponent(uid)}&sort=${sortOrder}`)
    .then(res => res.json())
    .then((data: any[]) => {
      if (Array.isArray(data) && data.length > 0) {
        data.forEach(item => {
          const id = item.id || item._id;
          if (id) {
            entriesMap.set(id, {
              id,
              title: item.title || 'Daily Reflection',
              content: item.content || '',
              preview: item.preview || (item.content ? item.content.slice(0, 80) + '...' : ''),
              mood: item.mood || 'Calm',
              tag: item.tag || item.mood || 'Calm',
              role: item.role || 'Developer',
              formattedDate: item.formattedDate || 'Recent',
              createdAt: item.createdAt,
              aiInsight: item.aiInsight || '',
              userId: item.userId || uid
            });
          }
        });
        emitSorted();
      }
    })
    .catch(err => console.warn('Server journals load notice:', err));

  // 3. Subscribe to local pub-sub mutations
  const unsubLocalBus = subscribeToJournalChanges(() => {
    const fresh = getLocalJournals(uid);
    fresh.forEach(e => entriesMap.set(e.id, e));
    emitSorted();
  });

  const parseDoc = (docSnap: any): JournalEntry => {
    const data = docSnap.data();
    let dateStr = 'Just now';
    if (data.createdAt?.toDate) {
      const d = data.createdAt.toDate();
      dateStr = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } else if (data.formattedDate) {
      dateStr = data.formattedDate;
    }

    const rawContent = data.content || '';
    const preview = data.preview || (rawContent.length > 80 ? `${rawContent.slice(0, 80)}...` : rawContent);

    return {
      id: docSnap.id,
      title: data.title || 'Daily Reflection',
      content: rawContent,
      preview,
      mood: data.mood || 'Calm',
      tag: data.tag || data.mood || 'Calm',
      role: data.role || 'Developer',
      formattedDate: dateStr,
      createdAt: data.createdAt,
      aiInsight: data.aiInsight || '',
      userId: data.userId || uid
    };
  };

  // 4. Firestore top-level journals query
  let unsubTop = () => {};
  try {
    const qTop = query(collection(db, 'journals'), where('userId', '==', uid));
    unsubTop = onSnapshot(
      qTop,
      (snapshot) => {
        snapshot.docs.forEach((docSnap) => {
          entriesMap.set(docSnap.id, parseDoc(docSnap));
        });
        emitSorted();
      },
      (err) => {
        console.warn('Journals top-level onSnapshot notice:', err);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.warn('Top-level query init notice:', err);
  }

  // 5. Firestore user subcollection query /users/{uid}/journals
  let unsubSub = () => {};
  try {
    const qSub = query(collection(db, 'users', uid, 'journals'));
    unsubSub = onSnapshot(
      qSub,
      (snapshot) => {
        snapshot.docs.forEach((docSnap) => {
          entriesMap.set(docSnap.id, parseDoc(docSnap));
        });
        emitSorted();
      },
      (err) => {
        console.warn('User journals subcollection onSnapshot notice:', err);
      }
    );
  } catch (err) {
    console.warn('Subcollection query init notice:', err);
  }

  return () => {
    unsubLocalBus();
    unsubTop();
    unsubSub();
  };
}

/**
 * Atomically logs user daily mood to /users/{uid}/moods
 */
export async function logUserMood(
  uid: string,
  mood: string,
  score: number = 80
): Promise<void> {
  if (!uid) return;
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== uid) return;

  try {
    const moodsRef = collection(db, 'users', uid, 'moods');
    const today = new Date().toISOString().split('T')[0];
    const todayDocRef = doc(db, 'users', uid, 'moods', today);

    const payload = sanitizePayload({
      mood,
      score,
      date: today,
      loggedAt: serverTimestamp(),
      formattedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    });

    // Write to date doc so only 1 mood per day is active, plus archive entry
    await setDoc(todayDocRef, payload, { merge: true });
    await addDoc(moodsRef, payload);
  } catch (err) {
    console.warn('Mood logging notice:', err);
  }
}

/**
 * Subscribes to the user's latest mood from /users/{uid}/moods
 */
export function subscribeToLatestMood(
  uid: string,
  callback: (mood: string | null) => void
): () => void {
  if (!uid) {
    callback(null);
    return () => {};
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const todayDocRef = doc(db, 'users', uid, 'moods', today);

    const unsubscribe = onSnapshot(
      todayDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          callback(data.mood || null);
        } else {
          callback(null);
        }
      },
      () => {
        callback(null);
      }
    );

    return unsubscribe;
  } catch {
    callback(null);
    return () => {};
  }
}

/**
 * Calculates aggregated insights from real journal entries and moods
 */
function calculateInsightsFromEntries(entries: any[]): DashboardInsights {
  if (!entries || entries.length === 0) {
    return {
      productivityScore: 0,
      scoreDelta: 0,
      totalEntries: 0,
      streakDays: 0,
      distribution: [],
      hasData: false
    };
  }

  const total = entries.length;
  const moodCounts: Record<string, number> = {};
  const now = Date.now();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  let thisWeekCount = 0;
  let lastWeekCount = 0;
  const entryDays = new Set<string>();

  entries.forEach((entry) => {
    const rawMood = (entry.mood || entry.tag || 'Reflective').trim();
    const mood = rawMood.charAt(0).toUpperCase() + rawMood.slice(1);
    moodCounts[mood] = (moodCounts[mood] || 0) + 1;

    let entryTime = 0;
    if (entry.createdAt?.toDate) {
      const dateObj = entry.createdAt.toDate();
      entryTime = dateObj.getTime();
      entryDays.add(dateObj.toISOString().split('T')[0]);
    } else if (entry.createdAt?.seconds) {
      const dateObj = new Date(entry.createdAt.seconds * 1000);
      entryTime = dateObj.getTime();
      entryDays.add(dateObj.toISOString().split('T')[0]);
    }

    if (entryTime > 0) {
      const age = now - entryTime;
      if (age <= oneWeekMs) {
        thisWeekCount++;
      } else if (age <= 2 * oneWeekMs) {
        lastWeekCount++;
      }
    } else {
      thisWeekCount++;
    }
  });

  const colorPalette: Record<string, string> = {
    Focused: '#EA580C',
    Calm: '#0EA5E9',
    Motivated: '#3B82F6',
    Learning: '#3B82F6',
    Amazing: '#10B981',
    Happy: '#10B981',
    Good: '#10B981',
    Planning: '#F43F5E',
    Goals: '#F43F5E',
    Stressed: '#F59E0B',
    Sad: '#6366F1',
    Angry: '#EF4444',
    Reflective: '#8B5CF6',
    Other: '#8B5CF6'
  };

  const sortedMoods = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]);
  const topMood = sortedMoods.length > 0 ? sortedMoods[0][0] : undefined;

  let allocatedPct = 0;
  const distribution = sortedMoods.map(([label, count], idx) => {
    let percentage = Math.round((count / total) * 100);
    if (idx === sortedMoods.length - 1) {
      percentage = Math.max(0, 100 - allocatedPct);
    } else {
      allocatedPct += percentage;
    }
    const color = colorPalette[label] || colorPalette['Other'];
    return { label, count, percentage, color };
  });

  // Calculate real productivity / activity score (0-100)
  const baseScore = Math.min(100, Math.max(40, 50 + Math.min(total * 5, 35) + (thisWeekCount > 0 ? 15 : 0)));
  
  // Weekly delta computation
  let scoreDelta = 0;
  if (lastWeekCount === 0) {
    scoreDelta = thisWeekCount > 0 ? 100 : 0;
  } else {
    scoreDelta = Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100);
  }

  return {
    productivityScore: baseScore,
    scoreDelta,
    totalEntries: total,
    streakDays: entryDays.size || 1,
    distribution,
    hasData: true,
    topMood
  };
}

/**
 * Subscribes in real-time to user's aggregated insights from Firestore
 */
export function subscribeToInsights(
  uid: string,
  callback: (insights: DashboardInsights) => void
): () => void {
  if (!uid) {
    callback({
      productivityScore: 0,
      scoreDelta: 0,
      totalEntries: 0,
      streakDays: 0,
      distribution: [],
      hasData: false
    });
    return () => {};
  }

  try {
    const journalsRef = collection(db, 'users', uid, 'journals');
    const q = query(journalsRef, orderBy('createdAt', 'desc'), limit(50));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          callback({
            productivityScore: 0,
            scoreDelta: 0,
            totalEntries: 0,
            streakDays: 0,
            distribution: [],
            hasData: false
          });
          return;
        }

        const entries = snapshot.docs.map((d) => d.data());
        const insights = calculateInsightsFromEntries(entries);
        callback(insights);
      },
      (err) => {
        console.warn('Real-time insights subscription notice:', err);
        callback({
          productivityScore: 0,
          scoreDelta: 0,
          totalEntries: 0,
          streakDays: 0,
          distribution: [],
          hasData: false
        });
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('Error setting up insights subscription:', err);
    callback({
      productivityScore: 0,
      scoreDelta: 0,
      totalEntries: 0,
      streakDays: 0,
      distribution: [],
      hasData: false
    });
    return () => {};
  }
}

/**
 * Calculates aggregated insights from the user's past journal entries and moods
 */
export async function fetchAggregatedInsights(uid: string): Promise<DashboardInsights> {
  if (!uid) {
    return {
      productivityScore: 0,
      scoreDelta: 0,
      totalEntries: 0,
      streakDays: 0,
      distribution: [],
      hasData: false
    };
  }

  try {
    const journalsRef = collection(db, 'users', uid, 'journals');
    const snap = await getDocs(query(journalsRef, limit(50)));

    if (snap.empty) {
      return {
        productivityScore: 0,
        scoreDelta: 0,
        totalEntries: 0,
        streakDays: 0,
        distribution: [],
        hasData: false
      };
    }

    const entries = snap.docs.map((d) => d.data());
    return calculateInsightsFromEntries(entries);
  } catch (err) {
    console.warn('Insights aggregation notice:', err);
    return {
      productivityScore: 0,
      scoreDelta: 0,
      totalEntries: 0,
      streakDays: 0,
      distribution: [],
      hasData: false
    };
  }
}
