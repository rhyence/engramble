import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { BookOpen, Check, Crown, Eye, Lock, Moon, Pencil, Settings, Sparkles, Sun, X } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { Category, StudySet, Term, UserProfile } from './types';
import {
  buildConnectionsTiles,
  arrangeRemainingConnectionsTiles,
  buildArrangeRound,
  buildBlackoutRound,
  completeTerms,
  connectionsPointsForCorrectGroup,
  generateRevealClues,
  getAllTerms,
  isArrangeEligible,
  isBlackoutEligible,
  isConnectionsEligible,
  isRevealEligible,
  isRevealGuessCorrect,
  makeShareSlug,
  MISTAKE_MAX,
  POINTS_BY_CLUE,
  REVEAL_WRONG_GUESS_PENALTY,
  revealPointsForCorrectGuess,
  type ConnectionTile,
  type ArrangeRound,
  type BlackoutRound,
  validateStudySetDraft,
} from './lib/game';
import { CATEGORY_COLORS } from './lib/sampleData';
import {
  deleteStudySet,
  ensureProfile,
  fetchAdminUsers,
  fetchDailyRecord,
  fetchFriendLeaderboard,
  fetchFriendships,
  fetchPublicStudySetBySlug,
  fetchPerformanceAnalytics,
  fetchSetAccuracy,
  fetchStudySets,
  fetchWeeklySnapshot,
  publishStudySet,
  queueAdminNotification,
  recordTermAttempts,
  resetPerformanceAnalytics,
  removeFriendship,
  saveDailyModeResult,
  saveStudySet,
  sendFriendRequest,
  sendQueuedNotificationsNow,
  updateFriendshipStatus,
  updateUsername,
  updateUserPlan,
  type AdminUserRow,
  type FriendLeaderboardEntry,
  type FriendshipView,
  type PerformanceAnalytics,
  type SetAccuracyItem,
  type TermAttemptInput,
  type WeeklySnapshot,
} from './lib/database';
import { loadProfile, loadStudySets, saveProfile, saveStudySets } from './lib/storage';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import { isPushSupported, removePushPermission, requestPushPermission } from './lib/notifications';
import { playClickSound, playCloseSound, playSuccessSound } from './lib/sound';

type GameMode = 'connections' | 'reveal' | 'blackout' | 'arrange';
type Tab = 'daily' | 'sets' | 'premium' | 'admin' | 'create' | 'account' | 'friends' | GameMode;
type PickerMode = GameMode;

interface SolvedGroup {
  catIdx: number;
  catName: string;
  color: string;
  terms: ConnectionTile[];
}

interface ConnectionsState {
  setId: string | null;
  tiles: ConnectionTile[];
  selected: string[];
  solved: SolvedGroup[];
  mistakes: number;
  score: number;
  feedback: string;
  wrongTerms: string[];
  isRevealed: boolean;
}

interface RevealRound extends Term {
  catName: string;
}

interface RevealState {
  setId: string | null;
  rounds: RevealRound[];
  currentRound: number;
  cluesShown: number;
  score: number;
  feedback: string;
  guess: string;
  wrongGuesses: number[];
}

interface BlackoutState {
  setId: string | null;
  rounds: BlackoutRound[];
  currentRound: number;
  score: number;
  guess: string;
  feedback: string;
  answered: boolean[];
  attempts: number[];
}

interface ArrangeState {
  setId: string | null;
  round: ArrangeRound | null;
  order: Array<Term & { id: string }>;
  attempts: number;
  definitionReveals: number;
  revealedDefinitions: string[];
  score: number;
  feedback: string;
  solved: boolean;
}

const emptyTerm = (): Term => ({ term: '', def: '' });
const FREE_SET_LIMIT = 3;
const FREE_TERM_LIMIT = 30;
const CLASSIFY_GROUP_COUNT = 4;
const REVEAL_ROUND_COUNT = 5;
const STORAGE_THEME_KEY = 'engramble:theme';
const STORAGE_INTENT_KEY = 'engramble:studyIntent';
const STORAGE_ONBOARDING_DONE_KEY = 'engramble:onboardingDone';
const STORAGE_STREAK_VISIBLE_KEY = 'engramble:streakVisible';
const STORAGE_DAILY_FOCUS_SET_IDS_KEY = 'engramble:dailyFocusSetIds';
const STORAGE_STREAK_SHIELD_KEY = 'engramble:streakShieldEnabled';
const STORAGE_GAME_SETTINGS_KEY = 'engramble:gameSettings';
const RESULT_SEEN_KEY_PREFIX = 'engramble.resultSeen';

type Theme = 'light' | 'dark';
type Plan = 'free' | 'paid';
type StudyIntent = 'warmup' | 'review' | 'deep-practice';
interface GameSettings {
  classifyGroups: number;
  revealRounds: number;
  blackoutRounds: number;
  blackoutBlanks: number;
  arrangeTerms: number;
}

const premiumFeatures = [
  {
    feature: 'Active study sets',
    free: `Up to ${FREE_SET_LIMIT}`,
    premium: 'Unlimited',
    highlight: true,
  },
  {
    feature: 'Terms per set',
    free: `Up to ${FREE_TERM_LIMIT}`,
    premium: 'Unlimited',
    highlight: true,
  },
  {
    feature: 'Game modes',
    free: 'Classify, Reveal, Blackout, Arrange',
    premium: 'Classify, Reveal, Blackout, Arrange',
  },
  {
    feature: 'Daily challenge',
    free: 'Included',
    premium: 'Daily Set Focus',
    highlight: true,
  },
  {
    feature: 'Game settings',
    free: 'Standard rounds',
    premium: 'Custom settings for all 4 modes',
    highlight: true,
  },
  {
    feature: 'Weekly growth snapshot',
    free: 'Included',
    premium: 'Expanded insights',
    highlight: true,
  },
  {
    feature: 'Result sharing',
    free: 'Basic card',
    premium: 'Basic card',
  },
  {
    feature: 'Performance analytics',
    free: 'Locked',
    premium: 'Accuracy, weak terms, trends',
    highlight: true,
  },
  {
    feature: 'Analytics reset',
    free: 'Locked',
    premium: 'Reset current-month analytics',
    highlight: true,
  },
  {
    feature: 'Play again',
    free: 'Locked after daily completion',
    premium: 'Extra plays with no daily points',
    highlight: true,
  },
  {
    feature: 'Set rotation',
    free: 'Standard',
    premium: 'Daily Set Focus',
    highlight: true,
  },
  {
    feature: 'Streak recovery',
    free: 'Locked',
    premium: 'Streak Shield',
    highlight: true,
  },
];

const emptyCategory = (index: number): Category => ({
  name: '',
  color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
  terms: [emptyTerm(), emptyTerm(), emptyTerm(), emptyTerm()],
});
const initialDraft = () => [emptyCategory(0), emptyCategory(1), emptyCategory(2), emptyCategory(3)];

export default function App() {
  const [sets, setSets] = useState<StudySet[]>(() => loadStudySets());
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile());
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [showSplash, setShowSplash] = useState(true);
  const [studyIntent, setStudyIntent] = useState<StudyIntent | null>(() => loadStudyIntent());
  const [showStreak, setShowStreak] = useState(() => loadStreakVisible());
  const [dailyFocusSetIds, setDailyFocusSetIds] = useState<string[]>(() => loadDailyFocusSetIds());
  const [streakShieldEnabled, setStreakShieldEnabled] = useState(() => loadStreakShieldEnabled());
  const [gameSettings, setGameSettings] = useState<GameSettings>(() => loadGameSettings());
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(Boolean(supabase));
  const [dataError, setDataError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('daily');
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [gameIntroMode, setGameIntroMode] = useState<PickerMode | null>(null);
  const [gameSettingsMode, setGameSettingsMode] = useState<PickerMode | null>(null);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftCategories, setDraftCategories] = useState<Category[]>(initialDraft);
  const [bulkPasteDrafts, setBulkPasteDrafts] = useState<Record<number, string>>({});
  const [saveAlert, setSaveAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSavingSet, setIsSavingSet] = useState(false);
  const [dailyCompleted, setDailyCompleted] = useState({ connections: false, reveal: false, blackout: false, arrange: false });
  const [dailyScore, setDailyScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const resultSoundPlayedRef = useRef(false);
  const [isSavingResultImage, setIsSavingResultImage] = useState(false);
  const [activeGameCountsForDaily, setActiveGameCountsForDaily] = useState(true);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [friendDraft, setFriendDraft] = useState('');
  const [friendships, setFriendships] = useState<FriendshipView[]>([]);
  const [leaderboard, setLeaderboard] = useState<FriendLeaderboardEntry[]>([]);
  const [analytics, setAnalytics] = useState<PerformanceAnalytics | null>(null);
  const [setAccuracy, setSetAccuracy] = useState<SetAccuracyItem[]>([]);
  const [weeklySnapshot, setWeeklySnapshot] = useState<WeeklySnapshot | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminMessage, setAdminMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [accountMessage, setAccountMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<string>(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
  const [quickReviewSetId, setQuickReviewSetId] = useState<string | null>(null);
  const [previewSetId, setPreviewSetId] = useState<string | null>(null);
  const [sharedSet, setSharedSet] = useState<StudySet | null>(null);
  const [shareImportMessage, setShareImportMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSharedSetLoading, setIsSharedSetLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !loadOnboardingDone());
  const [connections, setConnections] = useState<ConnectionsState>({
    setId: null,
    tiles: [],
    selected: [],
    solved: [],
    mistakes: 0,
    score: 0,
    feedback: '',
    wrongTerms: [],
    isRevealed: false,
  });
  const [reveal, setReveal] = useState<RevealState>({
    setId: null,
    rounds: [],
    currentRound: 0,
    cluesShown: 1,
    score: 0,
    feedback: '',
    guess: '',
    wrongGuesses: [],
  });
  const [blackout, setBlackout] = useState<BlackoutState>({
    setId: null,
    rounds: [],
    currentRound: 0,
    score: 0,
    guess: '',
    feedback: '',
    answered: [],
    attempts: [],
  });
  const [arrange, setArrange] = useState<ArrangeState>({
    setId: null,
    round: null,
    order: [],
    attempts: 0,
    definitionReveals: 0,
    revealedDefinitions: [],
    score: 0,
    feedback: '',
    solved: false,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 3600);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handlePointerUp(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const control = target?.closest('button, a, [role="button"]');
      if (!control) return;
      if (control instanceof HTMLButtonElement && control.disabled) return;
      if (control.getAttribute('aria-disabled') === 'true') return;
      if (isCloseSoundControl(control)) {
        playCloseSound();
      } else {
        playClickSound();
      }
    }

    document.addEventListener('pointerup', handlePointerUp, { capture: true });
    return () => document.removeEventListener('pointerup', handlePointerUp, { capture: true });
  }, []);

  useEffect(() => {
    if (!showResult) {
      resultSoundPlayedRef.current = false;
      return;
    }
    if (resultSoundPlayedRef.current) return;
    resultSoundPlayedRef.current = true;
    playSuccessSound();
  }, [showResult]);

  useEffect(() => {
    if (!authUserId) saveStudySets(sets);
  }, [authUserId, sets]);
  useEffect(() => {
    if (!authUserId) saveProfile(profile);
  }, [authUserId, profile]);
  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    async function loadSession() {
      try {
        const { data, error } = await supabase!.auth.getSession();
        if (error) throw error;
        const user = data.session?.user;
        if (!user) {
          if (!cancelled) setIsAuthLoading(false);
          return;
        }
        await hydrateSupabaseUser(user);
      } catch (error) {
        if (!cancelled) {
          setDataError(error instanceof Error ? error.message : 'Unable to load Supabase session.');
          setIsAuthLoading(false);
        }
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (!user) {
        setAuthUserId(null);
        setProfile(loadProfile());
        setSets(loadStudySets());
        setFriendships([]);
        setLeaderboard([]);
        setAnalytics(null);
        setSetAccuracy([]);
        setWeeklySnapshot(null);
        setAdminUsers([]);
        setIsAuthLoading(false);
        return;
      }
      void hydrateSupabaseUser(user);
    });

    void loadSession();

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (allDailyModesComplete(dailyCompleted) && !hasSeenResult(todayDateString())) {
      setShowResult(true);
    }
  }, [dailyCompleted]);
  useEffect(() => {
    setUsernameDraft(profile.username ?? '');
  }, [profile.username]);
  useEffect(() => {
    document.body.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_THEME_KEY, theme);
  }, [theme]);
  useEffect(() => {
    if (studyIntent) window.localStorage.setItem(STORAGE_INTENT_KEY, studyIntent);
  }, [studyIntent]);
  useEffect(() => {
    window.localStorage.setItem(STORAGE_STREAK_VISIBLE_KEY, showStreak ? 'true' : 'false');
  }, [showStreak]);
  useEffect(() => {
    window.localStorage.setItem(STORAGE_DAILY_FOCUS_SET_IDS_KEY, JSON.stringify(dailyFocusSetIds));
  }, [dailyFocusSetIds]);
  useEffect(() => {
    window.localStorage.setItem(STORAGE_STREAK_SHIELD_KEY, streakShieldEnabled ? 'true' : 'false');
  }, [streakShieldEnabled]);
  useEffect(() => {
    window.localStorage.setItem(STORAGE_GAME_SETTINGS_KEY, JSON.stringify(gameSettings));
  }, [gameSettings]);
  useEffect(() => {
    setDailyFocusSetIds((current) => current.filter((setId) => sets.some((set) => set.id === setId)));
  }, [sets]);
  useEffect(() => {
    if (authUserId && profile.isAdmin) {
      void loadAdminUsers('');
    }
  }, [authUserId, profile.isAdmin]);
  useEffect(() => {
    if (authUserId && profile.plan === 'paid') {
      void refreshAnalytics();
    } else {
      setAnalytics(null);
    }
  }, [authUserId, profile.plan]);
  useEffect(() => {
    if (authUserId) {
      void refreshSetAccuracy();
    } else {
      setSetAccuracy([]);
    }
  }, [authUserId]);
  useEffect(() => {
    const slug = getSharedSetSlugFromUrl();
    if (!slug || !supabase) return;

    let cancelled = false;
    setIsSharedSetLoading(true);
    setShareImportMessage(null);
    void fetchPublicStudySetBySlug(slug)
      .then((set) => {
        if (cancelled) return;
        if (set) {
          setSharedSet(set);
        } else {
          setShareImportMessage({ type: 'error', message: 'That shared set could not be found.' });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setShareImportMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unable to load this shared set.' });
        }
      })
      .finally(() => {
        if (!cancelled) setIsSharedSetLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const isPaid = profile.plan === 'paid';
  const classifyGroupCount = isPaid ? gameSettings.classifyGroups : CLASSIFY_GROUP_COUNT;
  const revealRoundCount = isPaid ? gameSettings.revealRounds : REVEAL_ROUND_COUNT;
  const blackoutRoundCount = isPaid ? gameSettings.blackoutRounds : 5;
  const blackoutBlankCount = isPaid ? gameSettings.blackoutBlanks : 2;
  const arrangeTermCount = isPaid ? gameSettings.arrangeTerms : 6;
  const connectionEligibleSets = useMemo(() => sets.filter((set) => isConnectionsEligible(set, classifyGroupCount)), [classifyGroupCount, sets]);
  const revealEligibleSets = useMemo(() => sets.filter(isRevealEligible), [sets]);
  const blackoutEligibleSets = useMemo(() => sets.filter(isBlackoutEligible), [sets]);
  const arrangeEligibleSets = useMemo(() => sets.filter(isArrangeEligible), [sets]);
  const focusedSetIds = useMemo(() => new Set(dailyFocusSetIds), [dailyFocusSetIds]);
  const focusedConnectionEligibleSets = useMemo(
    () => (isPaid && focusedSetIds.size ? connectionEligibleSets.filter((set) => focusedSetIds.has(set.id)) : connectionEligibleSets),
    [connectionEligibleSets, focusedSetIds, isPaid],
  );
  const focusedRevealEligibleSets = useMemo(
    () => (isPaid && focusedSetIds.size ? revealEligibleSets.filter((set) => focusedSetIds.has(set.id)) : revealEligibleSets),
    [revealEligibleSets, focusedSetIds, isPaid],
  );
  const focusedBlackoutEligibleSets = useMemo(
    () => (isPaid && focusedSetIds.size ? blackoutEligibleSets.filter((set) => focusedSetIds.has(set.id)) : blackoutEligibleSets),
    [blackoutEligibleSets, focusedSetIds, isPaid],
  );
  const focusedArrangeEligibleSets = useMemo(
    () => (isPaid && focusedSetIds.size ? arrangeEligibleSets.filter((set) => focusedSetIds.has(set.id)) : arrangeEligibleSets),
    [arrangeEligibleSets, focusedSetIds, isPaid],
  );
  const activeReviewSet = useMemo(
    () => {
      const weakestSet = setAccuracy
        .map((item) => sets.find((set) => set.id === item.setId) ?? null)
        .find((set): set is StudySet => Boolean(set));
      return weakestSet ?? focusedConnectionEligibleSets[0] ?? focusedRevealEligibleSets[0] ?? sets[0] ?? null;
    },
    [focusedConnectionEligibleSets, focusedRevealEligibleSets, setAccuracy, sets],
  );
  const quickReviewSet = useMemo(() => sets.find((set) => set.id === quickReviewSetId) ?? null, [quickReviewSetId, sets]);
  const previewSet = useMemo(() => sets.find((set) => set.id === previewSetId) ?? null, [previewSetId, sets]);
  const remainingConnectionTiles = useMemo(
    () => arrangeRemainingConnectionsTiles(connections.tiles, connections.solved.map((group) => group.catIdx)),
    [connections.tiles, connections.solved],
  );
  const totalTerms = useMemo(() => sets.reduce((sum, set) => sum + countTerms(set), 0), [sets]);
  const navItems = useMemo(() => {
    const items: Array<'daily' | 'sets' | 'friends' | 'premium' | 'admin' | 'account'> = ['daily', 'sets'];
    if (profile.email) items.push('friends');
    if (!isPaid) items.push('premium');
    if (profile.isAdmin) items.push('admin');
    items.push('account');
    return items;
  }, [isPaid, profile.email, profile.isAdmin]);
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  function navigate(nextTab: Tab) {
    if (nextTab === 'create' && editingSetId === null && !draftName) {
      setDraftCategories((current) => (current.length ? current : initialDraft()));
    }
    setTab(nextTab);
  }

  function openGameIntro(mode: PickerMode) {
    if (dailyCompleted[mode] && !isPaid) return;
    setGameIntroMode(mode);
  }

  function openPicker(mode: PickerMode) {
    setGameIntroMode(null);
    if (dailyCompleted[mode] && !isPaid) return;
    const eligible = eligibleSetsForMode(mode);
    if (eligible.length === 0) {
      const hasFocusedSets = isPaid && dailyFocusSetIds.length > 0;
      setDataError(
        hasFocusedSets
          ? `None of your focused sets can run ${modeLabel(mode)} yet. Add more terms or clear Daily Set Focus.`
          : eligibilityMessage(mode, classifyGroupCount),
      );
      return;
    }
    if (eligible.length === 1) {
      launchGame(mode, eligible[0]);
      return;
    }
    setPickerMode(mode);
  }

  function eligibleSetsForMode(mode: PickerMode) {
    if (mode === 'connections') return focusedConnectionEligibleSets;
    if (mode === 'reveal') return focusedRevealEligibleSets;
    if (mode === 'blackout') return focusedBlackoutEligibleSets;
    return focusedArrangeEligibleSets;
  }

  function launchGame(mode: PickerMode, set: StudySet) {
    setPickerMode(null);
    setActiveGameCountsForDaily(!dailyCompleted[mode]);
    if (mode === 'connections') {
      setConnections({
        setId: set.id,
        tiles: buildConnectionsTiles(set, classifyGroupCount),
        selected: [],
        solved: [],
        mistakes: 0,
        score: 0,
        feedback: '',
        wrongTerms: [],
        isRevealed: false,
      });
      setTab('connections');
      return;
    }

    if (mode === 'reveal') {
      const rounds = getAllTerms(set).sort(() => Math.random() - 0.5).slice(0, revealRoundCount);
      setReveal({
        setId: set.id,
        rounds,
        currentRound: 0,
        cluesShown: 1,
        score: 0,
        feedback: '',
        guess: '',
        wrongGuesses: rounds.map(() => 0),
      });
      setTab('reveal');
      return;
    }
    if (mode === 'blackout') {
      const rounds = getAllTerms(set)
        .map((term) => buildBlackoutRound(term, blackoutBlankCount))
        .filter((round): round is BlackoutRound => Boolean(round))
        .sort(() => Math.random() - 0.5)
        .slice(0, blackoutRoundCount);
      setBlackout({
        setId: set.id,
        rounds,
        currentRound: 0,
        score: 0,
        guess: '',
        feedback: '',
        answered: rounds.map(() => false),
        attempts: rounds.map(() => 0),
      });
      setTab('blackout');
      return;
    }

    const arrangeRound = buildArrangeRound(set, arrangeTermCount);
    if (!arrangeRound) {
      setDataError('Arrange needs one category with at least 3 complete terms.');
      return;
    }
    setArrange({
      setId: set.id,
      round: arrangeRound,
      order: arrangeRound.shuffledTerms,
      attempts: 0,
      definitionReveals: 0,
      revealedDefinitions: [],
      score: 0,
      feedback: '',
      solved: false,
    });
    setTab('arrange');
  }

  function finishMode(mode: PickerMode, score: number, mistakes = connections.mistakes) {
    if (!activeGameCountsForDaily) {
      setTab('daily');
      return;
    }
    const fallbackCompleted = { ...dailyCompleted, [mode]: true };
    const fallbackScore = dailyScore + score;
    setDailyCompleted(fallbackCompleted);
    setDailyScore(fallbackScore);
    if (mode === 'connections') {
      setConnections((current) => ({ ...current, mistakes }));
    }
    if (mode === 'reveal' || mode === 'blackout' || mode === 'arrange') {
      setProfile((current) => ({ ...current, daysPlayed: current.daysPlayed + 1 }));
    }
    void persistDailyResult(mode, score, mistakes);
    setTab('daily');
  }

  function toggleTile(tileId: string) {
    setConnections((current) => {
      if (current.isRevealed) return current;
      if (current.selected.includes(tileId)) {
        return { ...current, selected: current.selected.filter((selected) => selected !== tileId) };
      }
      if (current.selected.length >= 4) return current;
      return { ...current, selected: [...current.selected, tileId] };
    });
  }

  function submitConnection() {
    if (connections.isRevealed || connections.selected.length !== 4) return;
    const selectedTiles = connections.tiles.filter((tile) => connections.selected.includes(tile.id));
    const catIdx = selectedTiles[0].catIdx;
    const allSame = selectedTiles.every((tile) => tile.catIdx === catIdx);
    const activeGroupCount = new Set(connections.tiles.map((tile) => tile.catIdx)).size || CLASSIFY_GROUP_COUNT;

    if (allSame) {
      void recordAttempts(selectedTiles.map((tile) => ({
        setId: connections.setId ?? undefined,
        categoryName: tile.catName,
        term: tile.term,
        gameMode: 'connections',
        correct: true,
      })));
      const points = connectionsPointsForCorrectGroup(connections.mistakes);
      const nextSolved = [
        ...connections.solved,
        {
          catIdx,
          catName: selectedTiles[0].catName,
          color: selectedTiles[0].color,
          terms: selectedTiles,
        },
      ];
      const nextScore = connections.score + points;
      setConnections((current) => ({
        ...current,
        solved: nextSolved,
        selected: [],
        score: nextScore,
        feedback: `Correct! +${points} points`,
      }));
      if (nextSolved.length === activeGroupCount) {
        window.setTimeout(() => finishMode('connections', nextScore), 700);
      }
      return;
    }

    const nextMistakes = connections.mistakes + 1;
    void recordAttempts(selectedTiles.map((tile) => ({
      setId: connections.setId ?? undefined,
      categoryName: tile.catName,
      term: tile.term,
      gameMode: 'connections',
      correct: false,
    })));
    setConnections((current) => ({
      ...current,
      mistakes: nextMistakes,
      feedback: nextMistakes < MISTAKE_MAX ? 'Not quite - try again!' : 'Out of guesses. Revealing answers...',
      wrongTerms: [...current.selected],
    }));

    window.setTimeout(() => {
      setConnections((current) => {
        if (nextMistakes < MISTAKE_MAX) {
          return { ...current, selected: [], wrongTerms: [] };
        }
        const currentGroupCount = new Set(current.tiles.map((tile) => tile.catIdx)).size || CLASSIFY_GROUP_COUNT;
        const unsolved = Array.from({ length: currentGroupCount }, (_, idx) => idx).filter((idx) => !current.solved.some((group) => group.catIdx === idx));
        const revealed = unsolved.map((idx) => {
          const terms = current.tiles.filter((tile) => tile.catIdx === idx);
          return { catIdx: idx, catName: terms[0].catName, color: terms[0].color, terms };
        });
        return {
          ...current,
          solved: [...current.solved, ...revealed],
          selected: [],
          wrongTerms: [],
          isRevealed: true,
          feedback: 'Out of attempts. Review the correct groups, then continue.',
        };
      });
    }, 500);
  }

  function continueFailedConnections() {
    finishMode('connections', connections.score, connections.mistakes);
  }

  function currentRevealRound() {
    return reveal.rounds[reveal.currentRound];
  }

  function submitRevealGuess() {
    const round = currentRevealRound();
    if (!round || !reveal.guess.trim()) return;
    if (!isRevealGuessCorrect(reveal.guess, round.term)) {
      void recordAttempts([{
        setId: reveal.setId ?? undefined,
        categoryName: round.catName,
        term: round.term,
        gameMode: 'reveal',
        correct: false,
      }]);
      setReveal((current) => ({
        ...current,
        feedback: `Not quite. -${REVEAL_WRONG_GUESS_PENALTY} pts if you solve this round.`,
        guess: '',
        wrongGuesses: current.wrongGuesses.map((count, index) => (index === current.currentRound ? count + 1 : count)),
      }));
      return;
    }

    void recordAttempts([{
      setId: reveal.setId ?? undefined,
      categoryName: round.catName,
      term: round.term,
      gameMode: 'reveal',
      correct: true,
    }]);
    const wrongGuesses = reveal.wrongGuesses[reveal.currentRound] ?? 0;
    const points = revealPointsForCorrectGuess(reveal.cluesShown, wrongGuesses);
    const nextScore = reveal.score + points;
    setReveal((current) => ({ ...current, score: nextScore, feedback: `Correct! +${points} points` }));

    window.setTimeout(() => {
      const nextRound = reveal.currentRound + 1;
      if (nextRound >= reveal.rounds.length) {
        finishMode('reveal', nextScore);
      } else {
        setReveal((current) => ({ ...current, currentRound: nextRound, cluesShown: 1, feedback: '', guess: '' }));
      }
    }, 800);
  }

  function giveUpRevealRound() {
    const round = currentRevealRound();
    if (!round || reveal.cluesShown < 4) return;
    void recordAttempts([{
      setId: reveal.setId ?? undefined,
      categoryName: round.catName,
      term: round.term,
      gameMode: 'reveal',
      correct: false,
    }]);
    setReveal((current) => ({ ...current, feedback: `Answer: ${round.term}. No points for this round.`, guess: '' }));
    window.setTimeout(() => {
      const nextRound = reveal.currentRound + 1;
      if (nextRound >= reveal.rounds.length) {
        finishMode('reveal', reveal.score);
      } else {
        setReveal((current) => ({ ...current, currentRound: nextRound, cluesShown: 1, feedback: '', guess: '' }));
      }
    }, 900);
  }

  function revealNextClue() {
    setReveal((current) => {
      if (current.cluesShown >= 4) return { ...current, feedback: 'All clues shown - take your best guess!' };
      return { ...current, cluesShown: current.cluesShown + 1, feedback: '' };
    });
  }

  function submitBlackoutGuess() {
    const round = blackout.rounds[blackout.currentRound];
    if (!round || !blackout.guess.trim() || blackout.answered[blackout.currentRound]) return;
    const correct = isBlackoutGuessCorrect(blackout.guess, round.answers);
    const currentAttempts = blackout.attempts[blackout.currentRound] ?? 0;
    const nextAttempts = currentAttempts + 1;
    void recordAttempts([{
      setId: blackout.setId ?? undefined,
      categoryName: round.catName,
      term: round.term,
      gameMode: 'blackout',
      correct,
    }]);
    if (!correct && nextAttempts < 3) {
      setBlackout((current) => ({
        ...current,
        guess: '',
        feedback: `Not quite. ${3 - nextAttempts} ${3 - nextAttempts === 1 ? 'try' : 'tries'} left.`,
        attempts: current.attempts.map((count, index) => (index === current.currentRound ? nextAttempts : count)),
      }));
      return;
    }
    const roundPoints = correct ? Math.max(30, 100 - currentAttempts * 30) : 0;
    const nextScore = blackout.score + roundPoints;
    setBlackout((current) => ({
      ...current,
      score: nextScore,
      feedback: correct ? `Correct. +${roundPoints} points` : `Answer: ${round.answer}`,
      guess: '',
      attempts: current.attempts.map((count, index) => (index === current.currentRound ? nextAttempts : count)),
      answered: current.answered.map((value, index) => (index === current.currentRound ? true : value)),
    }));
    window.setTimeout(() => {
      const nextRound = blackout.currentRound + 1;
      if (nextRound >= blackout.rounds.length) {
        finishMode('blackout', nextScore);
      } else {
        setBlackout((current) => ({ ...current, currentRound: nextRound, guess: '', feedback: '' }));
      }
    }, 800);
  }

  function giveUpBlackoutRound() {
    const round = blackout.rounds[blackout.currentRound];
    if (!round || blackout.answered[blackout.currentRound]) return;
    void recordAttempts([{
      setId: blackout.setId ?? undefined,
      categoryName: round.catName,
      term: round.term,
      gameMode: 'blackout',
      correct: false,
    }]);
    setBlackout((current) => ({
      ...current,
      guess: '',
      feedback: `Answer: ${round.answer}`,
      answered: current.answered.map((value, index) => (index === current.currentRound ? true : value)),
    }));
    window.setTimeout(() => {
      const nextRound = blackout.currentRound + 1;
      if (nextRound >= blackout.rounds.length) {
        finishMode('blackout', blackout.score);
      } else {
        setBlackout((current) => ({ ...current, currentRound: nextRound, guess: '', feedback: '' }));
      }
    }, 800);
  }

  function moveArrangeTerm(index: number, direction: -1 | 1) {
    setArrange((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.order.length || current.solved) return current;
      const nextOrder = [...current.order];
      const [item] = nextOrder.splice(index, 1);
      nextOrder.splice(nextIndex, 0, item);
      return { ...current, order: nextOrder };
    });
  }

  function reorderArrangeTerm(fromIndex: number, toIndex: number) {
    setArrange((current) => {
      if (current.solved || fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= current.order.length || toIndex >= current.order.length) return current;
      const nextOrder = [...current.order];
      const [item] = nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, item);
      return { ...current, order: nextOrder };
    });
  }

  function revealArrangeDefinition(termId: string) {
    setArrange((current) => {
      if (current.solved || current.revealedDefinitions.includes(termId)) return current;
      return {
        ...current,
        definitionReveals: current.definitionReveals + 1,
        revealedDefinitions: [...current.revealedDefinitions, termId],
        feedback: 'Definition shown. Points reduced for this round.',
      };
    });
  }

  function submitArrange() {
    if (!arrange.round || arrange.solved) return;
    const correctCount = arrange.order.filter((term, index) => normalizeAnswer(term.term) === normalizeAnswer(arrange.round!.correctTerms[index]?.term ?? '')).length;
    const solved = correctCount === arrange.round.correctTerms.length;
    const nextAttempts = arrange.attempts + 1;
    const score = solved ? Math.max(20, 120 - arrange.attempts * 30 - arrange.definitionReveals * 15) : 0;
    void recordAttempts(arrange.round.correctTerms.map((term, index) => ({
      setId: arrange.setId ?? undefined,
      categoryName: arrange.round!.categoryName,
      term: term.term,
      gameMode: 'arrange',
      correct: normalizeAnswer(arrange.order[index]?.term ?? '') === normalizeAnswer(term.term),
    })));
    if (solved || nextAttempts >= 3) {
      setArrange((current) => ({
        ...current,
        attempts: nextAttempts,
        score,
        solved: true,
        order: solved ? current.order : current.round?.correctTerms.map((term, index) => ({ ...term, id: `answer:${index}:${term.term}` })) ?? current.order,
        feedback: solved ? `Sequence solved. +${score} points` : 'Sequence revealed. No points this round.',
      }));
      window.setTimeout(() => finishMode('arrange', score), 950);
      return;
    }
    setArrange((current) => ({ ...current, attempts: nextAttempts, feedback: `${correctCount}/${current.order.length} in the right position. Try again.` }));
  }

  function editSet(set: StudySet) {
    setEditingSetId(set.id);
    setDraftName(set.name);
    setDraftCategories(set.categories.map((category) => ({ ...category, terms: category.terms.map((term) => ({ ...term })) })));
    setBulkPasteDrafts({});
    setTab('create');
  }

  function resetCreate() {
    setEditingSetId(null);
    setDraftName('');
    setDraftCategories(initialDraft());
    setBulkPasteDrafts({});
    setSaveAlert(null);
  }

  async function saveSet() {
    if (isSavingSet) return;
    const validation = validateStudySetDraft(draftName, draftCategories);
    if (!validation.ok) {
      setSaveAlert({ type: 'error', message: validation.message ?? 'Please check your set.' });
      return;
    }

    const draftTermCount = draftCategories.reduce((sum, category) => sum + completeTerms(category).length, 0);
    if (!isPaid && !editingSetId && sets.length >= FREE_SET_LIMIT) {
      setSaveAlert({ type: 'error', message: `Free accounts can keep up to ${FREE_SET_LIMIT} active study sets. Upgrade to add more.` });
      return;
    }
    if (!isPaid && draftTermCount > FREE_TERM_LIMIT) {
      setSaveAlert({ type: 'error', message: `Free study sets can have up to ${FREE_TERM_LIMIT} terms. Upgrade for unlimited terms.` });
      return;
    }

    const cleaned = draftCategories.map((category) => ({
      ...category,
      name: category.name.trim(),
      sequenceEnabled: category.sequenceEnabled ?? false,
      terms: completeTerms(category).map((term) => ({ term: term.term.trim(), def: term.def.trim() })),
    }));

    const currentSet = editingSetId ? sets.find((set) => set.id === editingSetId) : null;
    const nextSet: StudySet = {
      id: editingSetId ?? crypto.randomUUID(),
      ownerId: authUserId ?? profile.uid,
      name: draftName.trim(),
      categories: cleaned,
      createdAt: currentSet?.createdAt ?? new Date().toISOString(),
      isPublic: currentSet?.isPublic ?? false,
      shareSlug: currentSet?.shareSlug,
    };

    setIsSavingSet(true);
    setSaveAlert({ type: 'success', message: editingSetId ? 'Saving changes...' : 'Saving your set...' });
    try {
      const savedSet = authUserId ? await saveStudySet(authUserId, nextSet) : nextSet;
      setSets((current) => {
        const exists = current.some((set) => set.id === savedSet.id);
        return exists ? current.map((set) => (set.id === savedSet.id ? savedSet : set)) : [...current, savedSet];
      });
      setSaveAlert({ type: 'success', message: editingSetId ? 'Set updated!' : 'Set saved!' });
    } catch (error) {
      setSaveAlert({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save this set.' });
      return;
    } finally {
      setIsSavingSet(false);
    }

    window.setTimeout(() => {
      resetCreate();
      setTab('sets');
    }, 700);
  }

  async function shareSet(set: StudySet) {
    if (!authUserId) {
      setSaveAlert({ type: 'error', message: 'Sign in before sharing a set so the link can be published.' });
      return;
    }
    const slug = set.shareSlug ?? makeShareSlug();
    try {
      await publishStudySet(set.id, slug);
    } catch (error) {
      setSaveAlert({ type: 'error', message: error instanceof Error ? error.message : 'Unable to share this set.' });
      return;
    }
    setSets((current) => current.map((item) => (item.id === set.id ? { ...item, isPublic: true, shareSlug: slug } : item)));
    await navigator.clipboard?.writeText(`${window.location.origin}/set/${slug}`);
    setSaveAlert({ type: 'success', message: 'Link copied!' });
  }

  async function signInWithGoogle() {
    if (supabase) {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      return;
    }
    setProfile((current) => ({ ...current, email: 'local@engramble.app' }));
  }

  async function signOut() {
    if (supabase && authUserId) {
      await supabase.auth.signOut();
      return;
    }
    setProfile((current) => ({ ...current, email: '' }));
  }

  async function hydrateSupabaseUser(user: User) {
    setIsAuthLoading(true);
    setDataError(null);
    const nextProfile = await ensureProfile(user);
    const nextSets = await fetchStudySets(user.id);
    const nextFriendships = await fetchFriendships(user.id);
    const todayRecord = await fetchDailyRecord(user.id, todayDateString());
    const nextLeaderboard = await fetchFriendLeaderboard(user.id, todayDateString());
    const nextAnalytics = nextProfile.plan === 'paid' ? await fetchPerformanceAnalytics(user.id, ...currentMonthRange()) : null;
    const nextSetAccuracy = await fetchSetAccuracy(user.id);
    const nextWeeklySnapshot = await fetchWeeklySnapshot(user.id, ...currentWeekRange());
    setAuthUserId(user.id);
    setProfile(nextProfile);
    setSets(nextSets);
    setFriendships(nextFriendships);
    setDailyCompleted({
      connections: todayRecord?.connectionsCompleted ?? false,
      reveal: todayRecord?.revealCompleted ?? false,
      blackout: todayRecord?.blackoutCompleted ?? false,
      arrange: todayRecord?.arrangeCompleted ?? false,
    });
    setDailyScore(todayRecord?.totalScore ?? 0);
    setLeaderboard(nextLeaderboard);
    setAnalytics(nextAnalytics);
    setSetAccuracy(nextSetAccuracy);
    setWeeklySnapshot(nextWeeklySnapshot);
    setIsAuthLoading(false);
  }

  const resultOwner = profile.username ? `@${profile.username}` : profile.email ?? 'Guest';
  const resultSummary = buildResultSummary(connections.mistakes, reveal.score, blackout.score, arrange.score, dailyCompleted, classifyGroupCount);
  const resultText = buildResultText(today, resultOwner, dailyScore, resultSummary);

  return (
    <>
      {showSplash && (
        <div className="splash-screen" aria-label="Engramble opening animation">
          <div className="splash-brand" role="img" aria-label="Engramble - Study smarter, one game at a time.">
            <div className="splash-logo-wrap">
              <img className="splash-logo-img" src="/engramble-splash.jpg" alt="Engramble - Study smarter, one game at a time." />
            </div>
          </div>
        </div>
      )}
      <div className="app-shell">
        <header>
        <button className="logo" onClick={() => navigate('daily')} type="button">
          Engram<span>ble</span>
        </button>
        <div className="header-actions">
          <button
            className="icon-btn"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            type="button"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          {showStreak && <div className="streak-badge"><Sparkles size={13} /><span className="streak-text">{profile.streak} day streak</span></div>}
        </div>
        </header>

        <nav className={`nav-tabs ${navItems.length === 4 ? 'has-four' : ''} ${navItems.length === 5 ? 'has-five' : ''} ${navItems.length === 6 ? 'has-six' : ''}`}>
          {navItems.map((item) => (
            <button key={item} className={`tab-btn ${tab === item ? 'active' : ''}`} onClick={() => navigate(item)}>
              {item === 'sets' ? 'My Sets' : item}
            </button>
          ))}
        </nav>

        <div className="app-scroll">
        {tab === 'daily' && (
        <main className="screen active">
          <div className="daily-header">
            <div>
              <h2>Daily Challenge</h2>
              <div className="subtitle">Four games. One shot. Every day.</div>
            </div>
            <div className="date-pill">{today}</div>
          </div>

          {isAuthLoading ? (
            <div className="empty-state">
              <Loader size="lg" />
              <p>Loading your sets...</p>
            </div>
          ) : connectionEligibleSets.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><BookOpen size={30} /></div>
              <p>{sets.length === 0 ? `Create a set with ${classifyGroupCount} categories and 4 terms each to unlock the daily challenge.` : `Expand one of your sets to ${classifyGroupCount} categories with 4 terms each to unlock the daily challenge.`}</p>
              <br />
              <button className="btn primary" onClick={() => (sets.length === 0 ? navigate('create') : navigate('sets'))}>{sets.length === 0 ? 'Create a Set' : 'View My Sets'}</button>
            </div>
          ) : (
            <>
              <WeeklySnapshotPanel snapshot={weeklySnapshot} isSignedIn={Boolean(profile.email)} />
              {activeReviewSet && (
                <button className="review-primer-btn" type="button" onClick={() => setQuickReviewSetId(activeReviewSet.id)}>
                  <BookOpen size={18} />
                  <span>
                    <strong>Refresh before you play</strong>
                    <small>{primerLabel(activeReviewSet, setAccuracy)}</small>
                  </span>
                </button>
              )}
              <div className="mode-cards">
                <HomeModeCard
                  mode="connections"
                  completed={dailyCompleted.connections}
                  replayable={dailyCompleted.connections && isPaid}
                  description={dailyCompleted.connections ? (isPaid ? 'Play again - no daily points' : 'Completed today') : `Group ${classifyGroupCount * 4} terms into ${classifyGroupCount} categories`}
                  onStart={() => openGameIntro('connections')}
                  onSettings={() => setGameSettingsMode('connections')}
                />
                <HomeModeCard
                  mode="reveal"
                  completed={dailyCompleted.reveal}
                  replayable={dailyCompleted.reveal && isPaid}
                  description={dailyCompleted.reveal ? (isPaid ? 'Play again - no daily points' : 'Completed today') : 'Guess the term from progressive clues'}
                  onStart={() => openGameIntro('reveal')}
                  onSettings={() => setGameSettingsMode('reveal')}
                />
                <HomeModeCard
                  mode="blackout"
                  completed={dailyCompleted.blackout}
                  replayable={dailyCompleted.blackout && isPaid}
                  description={dailyCompleted.blackout ? (isPaid ? 'Play again - no daily points' : 'Completed today') : 'Fill missing terms from definitions'}
                  onStart={() => openGameIntro('blackout')}
                  onSettings={() => setGameSettingsMode('blackout')}
                />
                <HomeModeCard
                  mode="arrange"
                  completed={dailyCompleted.arrange}
                  replayable={dailyCompleted.arrange && isPaid}
                  description={dailyCompleted.arrange ? (isPaid ? 'Play again - no daily points' : 'Completed today') : 'Put terms in the correct order'}
                  onStart={() => openGameIntro('arrange')}
                  onSettings={() => setGameSettingsMode('arrange')}
                />
              </div>
              <div className="section-label">Today&apos;s progress</div>
              <div className="score-row">
                <ScoreBox value={dailyScore} label="Points" />
                <ScoreBox value={dailyCompleted.connections ? 'Done' : 'Open'} label="Classify" />
                <ScoreBox value={dailyCompleted.reveal ? 'Done' : 'Open'} label="Reveal" />
                <ScoreBox value={dailyCompleted.blackout ? 'Done' : 'Open'} label="Blackout" />
                <ScoreBox value={dailyCompleted.arrange ? 'Done' : 'Open'} label="Arrange" />
              </div>
              {profile.email && (
                <LeaderboardSection
                  entries={leaderboard}
                  currentUserId={authUserId}
                />
              )}
            </>
          )}
          {dataError && <div className="alert error">{dataError}</div>}
        </main>
      )}

      {tab === 'sets' && (
        <main className="screen active">
          <div className="sets-heading">
            <div>
              <h2>My Study Sets</h2>
              <div className="subtitle">
                {isPaid ? 'Unlimited saved collections of terms and definitions.' : `${sets.length} / ${FREE_SET_LIMIT} free study sets used.`}
              </div>
            </div>
            <button
              className="circle-add-btn"
              onClick={() => {
                if (!isPaid && sets.length >= FREE_SET_LIMIT) {
                  setSaveAlert({ type: 'error', message: `Free accounts can keep up to ${FREE_SET_LIMIT} active study sets. Upgrade from Account to add more.` });
                  return;
                }
                resetCreate();
                navigate('create');
              }}
              aria-label="Create a new study set"
            >
              +
            </button>
          </div>
          <SetsGuide classifyGroupCount={classifyGroupCount} />
          {saveAlert && <div className={`alert ${saveAlert.type}`}>{saveAlert.message}</div>}
          <div className="sets-grid">
            {sets.map((set) => (
              <article className="set-card" key={set.id}>
                <div className="set-card-title">{set.name}</div>
                <div className="set-card-meta">
                  <span>{set.categories.length} categories</span>
                  <span>{countTerms(set)} terms</span>
                  {set.categories.map((category) => (
                    <span key={category.name}><span className="cat-pip" style={{ background: category.color }} />{category.name}</span>
                  ))}
                </div>
                <div className="card-actions">
                  <button className="btn sm" onClick={() => setPreviewSetId(set.id)}>
                    <Eye size={13} />
                    Preview
                  </button>
                  <button className="btn sm" onClick={() => editSet(set)}>Edit</button>
                  <button className="btn sm" onClick={() => shareSet(set)}>Share</button>
                  <button className="btn sm danger" onClick={() => void removeSet(set.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </main>
      )}

      {tab === 'create' && (
        <main className="screen active">
          <div className="game-heading">
            <button className="btn sm" onClick={() => { resetCreate(); setTab('sets'); }}>Back</button>
            <h2>{editingSetId ? 'Edit Set' : 'New Study Set'}</h2>
          </div>
          <div className="subtitle">
            Add terms and group them into categories. {!isPaid && `${draftCategories.reduce((sum, category) => sum + completeTerms(category).length, 0)} / ${FREE_TERM_LIMIT} terms used on this set.`}
          </div>
          {saveAlert && <div className={`alert ${saveAlert.type}`}>{saveAlert.message}</div>}
          {isSavingSet && <div className="saving-strip"><Loader size="sm" />Saving set...</div>}
          <div className="field">
            <label>Set Name</label>
            <input disabled={isSavingSet} value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="e.g. Cell Biology - Unit 2" />
          </div>
          {draftCategories.map((category, categoryIndex) => (
            <section className="category-card" key={`${category.color}-${categoryIndex}`}>
              <div className="category-header">
                <div className="category-color-dot" style={{ background: category.color }} />
                <input
                  className="category-name-input"
                  placeholder="Category name..."
                  disabled={isSavingSet}
                  value={category.name}
                  onChange={(event) => updateCategory(categoryIndex, { name: event.target.value })}
                />
                <button className="btn sm danger" disabled={isSavingSet} onClick={() => setDraftCategories((current) => current.filter((_, idx) => idx !== categoryIndex))}>Remove</button>
              </div>
              <div className="color-swatch-row" aria-label="Category color">
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color}
                    className={`color-swatch ${category.color === color ? 'active' : ''}`}
                    type="button"
                    disabled={isSavingSet}
                    style={{ background: color }}
                    onClick={() => updateCategory(categoryIndex, { color })}
                    aria-label={`Use color ${color}`}
                    title={color}
                  />
                ))}
              </div>
              <label className="sequence-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(category.sequenceEnabled)}
                  disabled={isSavingSet}
                  onChange={(event) => updateCategory(categoryIndex, { sequenceEnabled: event.target.checked })}
                />
                <span>Natural order for Arrange</span>
              </label>
              <div className="terms-list">
                <details className="bulk-paste-box">
                  <summary>Bulk paste terms</summary>
                  <div className="bulk-paste-body">
                    <textarea
                      disabled={isSavingSet}
                      value={bulkPasteDrafts[categoryIndex] ?? ''}
                      onChange={(event) => setBulkPasteDrafts((current) => ({ ...current, [categoryIndex]: event.target.value }))}
                      placeholder={'Term 1 - Definition 1\nTerm 2 - Definition 2\nTerm 3 - Definition 3'}
                    />
                    <div className="bulk-paste-actions">
                      <span>One term per line. Use a dash, colon, or tab between term and definition.</span>
                      <button className="btn sm" disabled={isSavingSet} onClick={() => importBulkTerms(categoryIndex)}>Import Lines</button>
                    </div>
                  </div>
                </details>
                <div className={`term-label-row ${category.sequenceEnabled ? 'ordered' : ''}`}>
                  {category.sequenceEnabled && <label>Order</label>}
                  <label>Term</label>
                  <label>Definition</label>
                  <span />
                </div>
                {category.terms.map((term, termIndex) => (
                  <div className={`term-row ${category.sequenceEnabled ? 'ordered' : ''}`} key={termIndex}>
                    {category.sequenceEnabled && <span className="term-order-badge">{termIndex + 1}</span>}
                    <label className="term-field">
                      <span>Term</span>
                      <input disabled={isSavingSet} value={term.term} placeholder="Term" onChange={(event) => updateTerm(categoryIndex, termIndex, { term: event.target.value })} />
                    </label>
                    <label className="term-field">
                      <span>Definition</span>
                      <input disabled={isSavingSet} value={term.def} placeholder="Definition or clue..." onChange={(event) => updateTerm(categoryIndex, termIndex, { def: event.target.value })} />
                    </label>
                    <button className="rm-btn" disabled={isSavingSet} onClick={() => removeTerm(categoryIndex, termIndex)}>x</button>
                  </div>
                ))}
                <button className="add-term-btn" disabled={isSavingSet} onClick={() => updateCategory(categoryIndex, { terms: [...category.terms, emptyTerm()] })}>+ Add term</button>
              </div>
            </section>
          ))}
          <div className="form-actions">
            <button className="btn" disabled={isSavingSet} onClick={() => setDraftCategories((current) => [...current, emptyCategory(current.length)])}>+ Add Category</button>
            <button className="btn primary" disabled={isSavingSet} onClick={saveSet}>{isSavingSet ? <><Loader size="xs" />Saving...</> : 'Save Set'}</button>
            {editingSetId && <button className="btn" disabled={isSavingSet} onClick={() => { resetCreate(); setTab('sets'); }}>Cancel</button>}
          </div>
        </main>
      )}

      {tab === 'connections' && (
        <main className="screen active">
          <div className="game-heading">
            <button className="btn sm" onClick={() => navigate('daily')}>Back</button>
            <h2>Classify</h2>
          </div>
          <div className="subtitle">Select four related terms, then submit.</div>
          <div id="solvedRows">
            {connections.solved.map((group) => (
              <div className="solved-row" key={group.catIdx} style={{ background: group.color }}>
                <div>
                  <div className="solved-row-title">{group.catName}</div>
                  <div className="solved-row-terms">{group.terms.map((term) => term.term).join(' / ')}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="connections-grid">
            {remainingConnectionTiles.map((tile, index) => (
                <button
                  key={tile.id}
                  className={`conn-tile ${connections.selected.includes(tile.id) ? 'selected' : ''} ${connections.wrongTerms.includes(tile.id) ? 'wrong' : ''}`}
                  style={{
                    gridColumn: (index % 4) + 1,
                    gridRow: Math.floor(index / 4) + 1,
                  }}
                  onClick={() => toggleTile(tile.id)}
                >
                  {tile.term}
                </button>
              ))}
          </div>
          <div className="mistakes-display">
            <span>Mistakes remaining:</span>
            {[1, 2, 3, 4].map((idx) => <span key={idx} className={`mistake-dot ${idx <= connections.mistakes ? 'used' : ''}`} />)}
          </div>
          <div className="conn-actions">
            {connections.isRevealed ? (
              <button className="btn sm primary" onClick={continueFailedConnections}>Continue</button>
            ) : (
              <>
                <button className="btn sm" onClick={() => setConnections((current) => ({ ...current, selected: [] }))}>Deselect All</button>
                <button className="btn sm primary" disabled={connections.selected.length !== 4} onClick={submitConnection}>Submit</button>
              </>
            )}
          </div>
          <div className="feedback">{connections.feedback}</div>
        </main>
      )}

      {tab === 'reveal' && (
        <RevealScreen
          reveal={reveal}
          onBack={() => navigate('daily')}
          onGuessChange={(guess) => setReveal((current) => ({ ...current, guess }))}
          onSubmit={submitRevealGuess}
          onNextClue={revealNextClue}
          onGiveUp={giveUpRevealRound}
        />
      )}

      {tab === 'blackout' && (
        <BlackoutScreen
          blackout={blackout}
          onBack={() => navigate('daily')}
          onGuessChange={(guess) => setBlackout((current) => ({ ...current, guess }))}
          onSubmit={submitBlackoutGuess}
          onGiveUp={giveUpBlackoutRound}
        />
      )}

      {tab === 'arrange' && (
        <ArrangeScreen
          arrange={arrange}
          onBack={() => navigate('daily')}
          onReorder={reorderArrangeTerm}
          onRevealDefinition={revealArrangeDefinition}
          onSubmit={submitArrange}
        />
      )}

      {tab === 'account' && (
        <main className="screen active">
          <div className="account-title-block">
            <h2>Account</h2>
            {profile.email && (
              <div className="account-identity">
                {isEditingUsername ? (
                  <div className="inline-username-editor">
                    <input value={usernameDraft} onChange={(event) => setUsernameDraft(event.target.value)} placeholder="username" />
                    <button className="icon-btn mini" type="button" onClick={() => void saveUsername()} aria-label="Save username" title="Save username">
                      <Check size={14} />
                    </button>
                    <button
                      className="icon-btn mini"
                      type="button"
                      onClick={() => {
                        setUsernameDraft(profile.username ?? '');
                        setIsEditingUsername(false);
                      }}
                      aria-label="Cancel username edit"
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="account-username-row">
                    <span className="account-username">{profile.username ? `@${profile.username}` : 'Add username'}</span>
                    <button className="icon-btn mini" type="button" onClick={() => setIsEditingUsername(true)} aria-label="Edit username" title="Edit username">
                      <Pencil size={13} />
                    </button>
                  </div>
                )}
                <div className="account-email">{profile.email}</div>
              </div>
            )}
          </div>
          {!profile.email && <div className="subtitle">{isAuthLoading ? 'Checking session...' : 'Save your sets and progress across devices.'}</div>}
          {profile.email ? (
            <>
              <div className="score-row">
                <ScoreBox value={isPaid ? sets.length : `${sets.length}/${FREE_SET_LIMIT}`} label="Study Sets" />
                <ScoreBox value={profile.daysPlayed} label="Days Played" />
                <ScoreBox value={weeklySnapshot?.termsStrengthened ?? 0} label="Terms This Week" />
              </div>
              {isPaid && (
                <AnalyticsPanel analytics={analytics} onRefresh={() => void refreshAnalytics()} onReset={() => void resetAnalytics()} />
              )}
              <section className="account-panel tier-panel">
                <div className="tier-heading">
                  <div>
                    <div className="section-label">Plan</div>
                    <h3>{isPaid ? 'Paid Tier' : 'Free Tier'}</h3>
                  </div>
                  <span className="tier-badge">{isPaid ? 'Unlimited' : 'Daily habit engine'}</span>
                </div>
                <div className="tier-usage">
                  <PlanMeter label="Study sets" value={sets.length} max={FREE_SET_LIMIT} unlimited={isPaid} />
                  <PlanMeter label="Terms saved" value={totalTerms} max={FREE_TERM_LIMIT * FREE_SET_LIMIT} unlimited={isPaid} />
                </div>
                <div className="tier-grid">
                  <FeatureItem active label="All four game modes" />
                  <FeatureItem active label="Weekly growth snapshot" />
                  <FeatureItem active label="Shareable result card" />
                  <FeatureItem active={isPaid} label="Unlimited sets and terms" />
                  <FeatureItem active={isPaid} label="Performance analytics" />
                  <FeatureItem active={isPaid} label="Daily Set Focus" />
                  <FeatureItem active={isPaid} label="Custom settings for all four games" />
                  <FeatureItem active={isPaid} label="Streak Shield" />
                </div>
                {!isPaid && (
                  <button className="btn primary full upgrade-btn" type="button" onClick={() => navigate('premium')}>
                    <Crown size={15} />
                    Compare premium
                  </button>
                )}
              </section>
              <section className="account-panel">
                <div className="section-label">Preferences</div>
                <label className="toggle-row">
                  <input type="checkbox" checked={showStreak} onChange={(event) => setShowStreak(event.target.checked)} />
                  <span>
                    <strong>Show streaks</strong>
                    <small>Keep streaks visible if they help you. Leave this off for a lower-pressure home screen.</small>
                  </span>
                </label>
                {showStreak && <div className="hint">Current streak: {profile.streak} days</div>}
                {isPaid && (
                  <>
                    <div className="preference-divider" />
                    <DailySetFocusPanel
                      sets={sets}
                      selectedIds={dailyFocusSetIds}
                      onToggle={toggleDailyFocusSet}
                      onClear={() => setDailyFocusSetIds([])}
                    />
                    <div className="preference-divider" />
                    <GameSettingsPanel
                      settings={gameSettings}
                      onChange={(patch) => setGameSettings((current) => ({ ...current, ...patch }))}
                    />
                    <div className="preference-divider" />
                    <label className="toggle-row">
                      <input type="checkbox" checked={streakShieldEnabled} onChange={(event) => setStreakShieldEnabled(event.target.checked)} />
                      <span>
                        <strong>Streak Shield</strong>
                        <small>Protect one missed daily challenge per week when streaks are enabled.</small>
                      </span>
                    </label>
                    <div className="shield-status">
                      <span>{streakShieldEnabled ? '1 shield ready this week' : 'Shield off'}</span>
                    </div>
                  </>
                )}
              </section>
              <section className="account-panel">
                <div className="section-label">Reminders</div>
                <p className="hint">
                  iPhone and iPad notifications require iOS 16.4+ and opening Engramble from the Home Screen app icon.
                </p>
                <div className="account-row">
                  <button className="btn primary" disabled={!isPushSupported()} onClick={() => void enableNotifications()}>
                    Enable Reminders
                  </button>
                  <button className="btn" disabled={!isPushSupported()} onClick={() => void disableNotifications()}>
                    Disable
                  </button>
                </div>
                <div className="hint">Status: {notificationStatus}</div>
              </section>
              {accountMessage && <div className={`alert ${accountMessage.type}`}>{accountMessage.message}</div>}
              <button className="btn danger" onClick={() => void signOut()}>Sign Out</button>
            </>
          ) : (
            <div className="login-wrap">
              <div className="login-header"><h2>Engramble</h2><p>{hasSupabaseConfig ? 'Supabase Auth is configured.' : 'Local mode until Supabase keys are added.'}</p></div>
              <div className="login-body">
              <button className="btn primary full" onClick={signInWithGoogle} disabled={isAuthLoading}>Continue with Google</button>
              </div>
            </div>
          )}
          {dataError && <div className="alert error">{dataError}</div>}
        </main>
      )}

      {tab === 'friends' && (
        <main className="screen active">
          <div className="daily-header">
            <div>
              <h2>Friends</h2>
              <div className="subtitle">Add classmates and compare today&apos;s daily score.</div>
            </div>
          </div>
          {profile.email ? (
            <>
              <section className="account-panel">
                <div className="section-label">Add Friend</div>
                <div className="account-row">
                  <input value={friendDraft} onChange={(event) => setFriendDraft(event.target.value)} placeholder="friend username" />
                  <button className="btn primary" onClick={() => void addFriend()}>Add Friend</button>
                </div>
                <div className="friends-list">
                  {friendships.length === 0 ? (
                    <div className="empty-line">No friends yet.</div>
                  ) : friendships.map((friendship) => (
                    <div className="friend-row" key={friendship.id}>
                      <div>
                        <div className="friend-name">{friendship.friend.username ?? friendship.friend.email}</div>
                        <div className="friend-meta">{friendship.status}{friendship.status === 'pending' ? ` / ${friendship.direction}` : ''}</div>
                      </div>
                      <div className="friend-actions">
                        {friendship.status === 'pending' && friendship.direction === 'incoming' && (
                          <button className="btn sm primary" onClick={() => void respondToFriend(friendship.id, 'accepted')}>Accept</button>
                        )}
                        <button className="btn sm danger" onClick={() => void removeFriend(friendship.id)}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <LeaderboardSection entries={leaderboard} currentUserId={authUserId} />
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-icon"><Lock size={30} /></div>
              <p>Sign in to add friends and compare scores.</p>
              <br />
              <button className="btn primary" onClick={() => navigate('account')}>Go to Account</button>
            </div>
          )}
          {accountMessage && <div className={`alert ${accountMessage.type}`}>{accountMessage.message}</div>}
        </main>
      )}

      {tab === 'premium' && !isPaid && (
        <PremiumScreen
          setsCount={sets.length}
          totalTerms={totalTerms}
          onBack={() => navigate('account')}
        />
      )}

      {tab === 'admin' && profile.isAdmin && (
        <AdminScreen
          users={adminUsers}
          search={adminSearch}
          message={adminMessage}
          isLoading={isAdminLoading}
          currentUserId={authUserId}
          onQueueNotification={queueNotificationTest}
          onSendQueuedNotifications={sendQueuedNotificationTests}
          onSearchChange={setAdminSearch}
          onSearch={() => void loadAdminUsers(adminSearch)}
          onRefresh={() => void loadAdminUsers(adminSearch)}
          onPlanChange={(userId, nextPlan) => void changeUserPlan(userId, nextPlan)}
        />
      )}
        </div>
      </div>

      {pickerMode && (
        <SetPicker
          mode={pickerMode}
          sets={pickerMode === 'connections' ? focusedConnectionEligibleSets : focusedRevealEligibleSets}
          onClose={() => setPickerMode(null)}
          onPick={(set) => launchGame(pickerMode, set)}
        />
      )}

      {gameIntroMode && (
        <GameIntroModal
          mode={gameIntroMode}
          classifyGroupCount={classifyGroupCount}
          onClose={() => setGameIntroMode(null)}
          onStart={() => openPicker(gameIntroMode)}
        />
      )}

      {quickReviewSet && (
        <SetReferenceModal
          title="Refresh before you play"
          subtitle={quickReviewSet.name}
          set={quickReviewSet}
          onClose={() => setQuickReviewSetId(null)}
        />
      )}

      {previewSet && (
        <SetReferenceModal
          title="Preview your set"
          subtitle={previewSet.name}
          set={previewSet}
          onClose={() => setPreviewSetId(null)}
        />
      )}

      {(sharedSet || isSharedSetLoading || shareImportMessage) && (
        <SharedSetModal
          set={sharedSet}
          isLoading={isSharedSetLoading}
          message={shareImportMessage}
          onClose={() => {
            setSharedSet(null);
            setShareImportMessage(null);
            clearSharedSetUrl();
          }}
          onImport={() => void importSharedSet()}
        />
      )}

      {showOnboarding && (
        <OnboardingModal
          onChoose={(intent) => {
            saveOnboardingChoice(intent);
            setStudyIntent(intent);
            setShowOnboarding(false);
          }}
        />
      )}
      {gameSettingsMode && (
        <GameSettingsModal
          mode={gameSettingsMode}
          isPaid={isPaid}
          settings={gameSettings}
          onChange={(patch) => setGameSettings((current) => ({ ...current, ...patch }))}
          onClose={() => setGameSettingsMode(null)}
          onUpgrade={() => {
            setGameSettingsMode(null);
            navigate('premium');
          }}
        />
      )}

      {showResult && (
        <div className="result-overlay show">
          <div className="result-modal">
            <div className="result-confetti" aria-hidden="true">
              {Array.from({ length: 14 }).map((_, index) => <span key={index} />)}
            </div>
            <div className="result-kicker">{dailyScore >= 400 ? 'Trophy' : dailyScore >= 200 ? 'Star' : 'Complete'}</div>
            <div className="result-title">{dailyScore >= 400 ? 'Perfect!' : dailyScore >= 200 ? 'Great Job!' : 'Complete!'}</div>
            <div className="result-sub">{resultOwner} - {today}</div>
            <div className="result-sub">Score: {dailyScore} points</div>
            <div className="result-achievement-grid" aria-label="Result summary">
              <ResultAchievement label="Classify" filled={resultSummary.classifyFilled} total={resultSummary.classifyTotal} tone="classify" caption={resultSummary.classify} />
              <ResultAchievement label="Reveal" filled={resultSummary.revealFilled} total={resultSummary.revealTotal} tone="reveal" caption={resultSummary.reveal} shape="diamond" />
              <ResultAchievement label="Blackout" filled={resultSummary.blackoutFilled} total={resultSummary.blackoutTotal} tone="blackout" caption={resultSummary.blackout} />
              <ResultAchievement label="Arrange" filled={resultSummary.arrangeFilled} total={resultSummary.arrangeTotal} tone="arrange" caption={resultSummary.arrange} shape="diamond" />
            </div>
            <div className="result-share-text">{resultText}</div>
            <div className="result-actions">
              <button className="btn primary" disabled={isSavingResultImage} onClick={() => void saveResultImage()}>
                {isSavingResultImage ? <><Loader size="xs" />Saving...</> : 'Save JPG'}
              </button>
              <button className="btn" onClick={() => closeResultModal()}>Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  function updateCategory(index: number, patch: Partial<Category>) {
    setDraftCategories((current) => current.map((category, idx) => (idx === index ? { ...category, ...patch } : category)));
  }

  function updateTerm(categoryIndex: number, termIndex: number, patch: Partial<Term>) {
    setDraftCategories((current) =>
      current.map((category, idx) =>
        idx === categoryIndex
          ? { ...category, terms: category.terms.map((term, termIdx) => (termIdx === termIndex ? { ...term, ...patch } : term)) }
          : category,
      ),
    );
  }

  function importBulkTerms(categoryIndex: number) {
    const parsed = parseBulkTerms(bulkPasteDrafts[categoryIndex] ?? '');
    if (parsed.length === 0) {
      setSaveAlert({ type: 'error', message: 'Paste lines like "Term - Definition" before importing.' });
      return;
    }

    setDraftCategories((current) =>
      current.map((category, idx) => {
        if (idx !== categoryIndex) return category;
        const nextTerms = [...completeTerms(category), ...parsed];
        while (nextTerms.length < 4) nextTerms.push(emptyTerm());
        return { ...category, terms: nextTerms };
      }),
    );
    setBulkPasteDrafts((current) => ({ ...current, [categoryIndex]: '' }));
    setSaveAlert({ type: 'success', message: `Imported ${parsed.length} term${parsed.length === 1 ? '' : 's'} into this category.` });
  }

  function removeTerm(categoryIndex: number, termIndex: number) {
    setDraftCategories((current) =>
      current.map((category, idx) =>
        idx === categoryIndex ? { ...category, terms: category.terms.filter((_, termIdx) => termIdx !== termIndex) } : category,
      ),
    );
  }

  async function removeSet(setId: string) {
    if (authUserId) {
      try {
        await deleteStudySet(setId);
      } catch (error) {
        setSaveAlert({ type: 'error', message: error instanceof Error ? error.message : 'Unable to delete this set.' });
        return;
      }
    }
    setSets((current) => current.filter((item) => item.id !== setId));
  }

  async function refreshSocial() {
    if (!authUserId) return;
    setFriendships(await fetchFriendships(authUserId));
    setLeaderboard(await fetchFriendLeaderboard(authUserId, todayDateString()));
  }

  async function persistDailyResult(mode: PickerMode, score: number, mistakes: number) {
    if (!authUserId) return;
    try {
      const record = await saveDailyModeResult(
        authUserId,
        todayDateString(),
        mode,
        score,
        mistakes,
        mode === 'connections' ? connections.setId : mode === 'reveal' ? reveal.setId : mode === 'blackout' ? blackout.setId : arrange.setId,
      );
      setDailyCompleted({
        connections: record.connectionsCompleted,
        reveal: record.revealCompleted,
        blackout: record.blackoutCompleted,
        arrange: record.arrangeCompleted,
      });
      setDailyScore(record.totalScore);
      setLeaderboard(await fetchFriendLeaderboard(authUserId, todayDateString()));
      await refreshWeeklySnapshot();
      await refreshSetAccuracy();
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to save today\'s score.');
    }
  }

  async function refreshWeeklySnapshot() {
    if (!authUserId) return;
    try {
      setWeeklySnapshot(await fetchWeeklySnapshot(authUserId, ...currentWeekRange()));
    } catch (error) {
      console.warn('[Weekly Snapshot] Unable to load:', error);
    }
  }

  async function refreshSetAccuracy() {
    if (!authUserId) return;
    try {
      setSetAccuracy(await fetchSetAccuracy(authUserId));
    } catch (error) {
      console.warn('[Set Accuracy] Unable to load:', error);
    }
  }

  async function refreshAnalytics() {
    if (!authUserId || profile.plan !== 'paid') return;
    try {
      setAnalytics(await fetchPerformanceAnalytics(authUserId, ...currentMonthRange()));
    } catch (error) {
      setAccountMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unable to load analytics.' });
    }
  }

  async function resetAnalytics() {
    if (!authUserId || profile.plan !== 'paid') return;
    const confirmed = window.confirm('Reset performance analytics for this month? Previous months stay saved.');
    if (!confirmed) return;
    try {
      await resetPerformanceAnalytics(authUserId, ...currentMonthRange());
      setAnalytics(await fetchPerformanceAnalytics(authUserId, ...currentMonthRange()));
      await refreshWeeklySnapshot();
      await refreshSetAccuracy();
      setAccountMessage({ type: 'success', message: 'This month\'s analytics were reset.' });
    } catch (error) {
      setAccountMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unable to reset analytics.' });
    }
  }

  async function recordAttempts(attempts: TermAttemptInput[]) {
    if (!authUserId || !attempts.length) return;
    try {
      await recordTermAttempts(authUserId, attempts);
      if (profile.plan === 'paid') {
        setAnalytics(await fetchPerformanceAnalytics(authUserId, ...currentMonthRange()));
      }
      await refreshWeeklySnapshot();
      await refreshSetAccuracy();
    } catch (error) {
      console.warn('[Analytics] Unable to record attempts:', error);
    }
  }

  async function saveUsername() {
    if (!authUserId) return;
    try {
      const nextProfile = await updateUsername(authUserId, usernameDraft);
      setProfile(nextProfile);
      setIsEditingUsername(false);
      setAccountMessage({ type: 'success', message: 'Username saved.' });
      await refreshSocial();
    } catch (error) {
      setAccountMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save username.' });
    }
  }

  async function addFriend() {
    if (!authUserId) return;
    try {
      await sendFriendRequest(authUserId, friendDraft);
      setFriendDraft('');
      setAccountMessage({ type: 'success', message: 'Friend request sent.' });
      await refreshSocial();
    } catch (error) {
      setAccountMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unable to add friend.' });
    }
  }

  async function respondToFriend(friendshipId: string, status: 'accepted' | 'blocked') {
    try {
      await updateFriendshipStatus(friendshipId, status);
      await refreshSocial();
    } catch (error) {
      setAccountMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unable to update friend request.' });
    }
  }

  async function removeFriend(friendshipId: string) {
    try {
      await removeFriendship(friendshipId);
      await refreshSocial();
    } catch (error) {
      setAccountMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unable to remove friend.' });
    }
  }

  async function enableNotifications() {
    if (!authUserId) return;
    try {
      const status = await requestPushPermission(authUserId);
      setNotificationStatus(status);
      setAccountMessage(status === 'granted'
        ? { type: 'success', message: 'Reminders enabled.' }
        : {
            type: 'error',
            message: status === 'unsupported'
              ? 'Push notifications are not supported here.'
              : status === 'missing-key' || status === 'invalid-key'
                ? 'Notification keys are not configured correctly yet.'
                : 'Notification permission was not granted.',
          });
    } catch (error) {
      setAccountMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unable to enable reminders.' });
    }
  }

  async function disableNotifications() {
    if (!authUserId) return;
    try {
      await removePushPermission(authUserId);
      setNotificationStatus('disabled');
      setAccountMessage({ type: 'success', message: 'Reminders disabled.' });
    } catch (error) {
      setAccountMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unable to disable reminders.' });
    }
  }

  async function loadAdminUsers(search: string) {
    if (!authUserId || !profile.isAdmin) return;
    setIsAdminLoading(true);
    setAdminMessage(null);
    try {
      setAdminUsers(await fetchAdminUsers(search));
    } catch (error) {
      setAdminMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unable to load users.' });
    } finally {
      setIsAdminLoading(false);
    }
  }

  async function changeUserPlan(userId: string, nextPlan: Plan) {
    if (!authUserId || !profile.isAdmin) return;
    setAdminMessage(null);
    try {
      await updateUserPlan(userId, nextPlan);
      setAdminUsers((current) => current.map((user) => (user.id === userId ? { ...user, plan: nextPlan } : user)));
      if (userId === authUserId) {
        setProfile((current) => ({ ...current, plan: nextPlan }));
      }
      setAdminMessage({ type: 'success', message: 'User tier updated.' });
    } catch (error) {
      setAdminMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unable to update tier.' });
    }
  }

  async function queueNotificationTest(title: string, body: string, url: string) {
    if (!authUserId || !profile.isAdmin) {
      throw new Error('Only admins can queue notification tests.');
    }
    if (!title.trim() || !body.trim()) {
      throw new Error('Notification title and description are required.');
    }
    await queueAdminNotification(title, body, 'all', url);
    setAdminMessage({ type: 'success', message: 'Test notification queued.' });
  }

  async function sendQueuedNotificationTests() {
    if (!authUserId || !profile.isAdmin) {
      throw new Error('Only admins can send queued notifications.');
    }
    const result = await sendQueuedNotificationsNow();
    setAdminMessage({ type: 'success', message: `Notification sender ran: ${result.pushed} pushed, ${result.failed} failed.` });
    return result;
  }

  function toggleDailyFocusSet(setId: string) {
    setDailyFocusSetIds((current) =>
      current.includes(setId) ? current.filter((id) => id !== setId) : [...current, setId],
    );
  }

  async function importSharedSet() {
    if (!sharedSet) return;
    if (!isPaid && !sets.some((set) => set.id === sharedSet.id) && sets.length >= FREE_SET_LIMIT) {
      setShareImportMessage({ type: 'error', message: `Free accounts can keep up to ${FREE_SET_LIMIT} active study sets.` });
      return;
    }
    if (!isPaid && countTerms(sharedSet) > FREE_TERM_LIMIT) {
      setShareImportMessage({ type: 'error', message: `Free accounts can import sets with up to ${FREE_TERM_LIMIT} terms.` });
      return;
    }

    const clone: StudySet = {
      id: crypto.randomUUID(),
      ownerId: authUserId ?? profile.uid,
      name: sharedSet.name,
      categories: sharedSet.categories.map((category) => ({
        name: category.name,
        color: category.color,
        sequenceEnabled: category.sequenceEnabled ?? false,
        terms: category.terms.map((term) => ({ ...term })),
      })),
      createdAt: new Date().toISOString(),
      isPublic: false,
      shareSlug: undefined,
    };

    try {
      const savedSet = authUserId ? await saveStudySet(authUserId, clone) : clone;
      setSets((current) => [...current, savedSet]);
      setSharedSet(null);
      setShareImportMessage({ type: 'success', message: 'Shared set added to My Sets.' });
      clearSharedSetUrl();
      setTab('sets');
    } catch (error) {
      setShareImportMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unable to add this set.' });
    }
  }

  function closeResultModal() {
    markResultSeen(todayDateString());
    setShowResult(false);
  }

  async function saveResultImage() {
    if (isSavingResultImage) return;
    setIsSavingResultImage(true);
    try {
      await downloadResultPng({
        date: today,
        username: resultOwner,
        score: dailyScore,
        connectionsDone: dailyCompleted.connections,
        revealDone: dailyCompleted.reveal,
        blackoutDone: dailyCompleted.blackout,
        arrangeDone: dailyCompleted.arrange,
        connectionsMistakes: connections.mistakes,
        revealScore: reveal.score,
        blackoutScore: blackout.score,
        arrangeScore: arrange.score,
        connectionGroupCount: classifyGroupCount,
        revealRoundCount,
      });
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to save result image.');
    } finally {
      setIsSavingResultImage(false);
    }
  }
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function allDailyModesComplete(completed: { connections: boolean; reveal: boolean; blackout: boolean; arrange: boolean }) {
  return completed.connections && completed.reveal && completed.blackout && completed.arrange;
}

function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, ' ');
}

function isBlackoutGuessCorrect(guess: string, answers: string[]) {
  const guessed = guess
    .split(',')
    .map((item) => normalizeAnswer(item))
    .filter(Boolean)
    .sort();
  const expected = answers.map((item) => normalizeAnswer(item)).filter(Boolean).sort();
  return guessed.length === expected.length && expected.every((answer, index) => guessed[index] === answer);
}

function getSharedSetSlugFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/set\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function clearSharedSetUrl() {
  if (typeof window === 'undefined') return;
  if (getSharedSetSlugFromUrl()) {
    window.history.replaceState({}, '', '/');
  }
}

function hasSeenResult(date: string) {
  const key = `${RESULT_SEEN_KEY_PREFIX}:${date}`;
  return window.localStorage.getItem(key) === 'true' || window.sessionStorage.getItem(key) === 'true';
}

function markResultSeen(date: string) {
  window.localStorage.setItem(`${RESULT_SEEN_KEY_PREFIX}:${date}`, 'true');
}

function isCloseSoundControl(control: Element) {
  const label = `${control.textContent ?? ''} ${control.getAttribute('aria-label') ?? ''} ${control.getAttribute('title') ?? ''}`.trim().toLowerCase();
  return (
    control.classList.contains('picker-close') ||
    control.classList.contains('rm-btn') ||
    label === 'x' ||
    label.includes('close') ||
    label.includes('remove') ||
    label.includes('done')
  );
}

async function downloadResultPng(result: {
  date: string;
  username: string;
  score: number;
  connectionsDone: boolean;
  revealDone: boolean;
  blackoutDone: boolean;
  arrangeDone: boolean;
  connectionsMistakes: number;
  revealScore: number;
  blackoutScore: number;
  arrangeScore: number;
  connectionGroupCount: number;
  revealRoundCount: number;
}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export is not supported on this device.');

  ctx.fillStyle = '#f5f0e8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#191612';
  ctx.lineWidth = 10;
  ctx.strokeRect(44, 44, canvas.width - 88, canvas.height - 88);
  drawCanvasConfetti(ctx);

  ctx.fillStyle = '#191612';
  ctx.font = '900 94px Georgia, serif';
  ctx.fillText('Engram', 96, 170);
  ctx.fillStyle = '#c84b2f';
  ctx.fillText('ble', 480, 170);

  ctx.fillStyle = '#8a7f70';
  ctx.font = '30px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(result.username, 96, 238);
  ctx.fillText(result.date, 96, 286);

  ctx.fillStyle = '#191612';
  ctx.font = '900 120px Georgia, serif';
  ctx.fillText(`${result.score}`, 96, 450);
  ctx.font = '32px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('points', 98, 502);

  drawResultLine(ctx, 96, 650, 'Classify', result.connectionsDone ? result.connectionGroupCount - Math.min(result.connectionsMistakes, result.connectionGroupCount) : 0, result.connectionGroupCount, '#2d6a4f', 'square');
  drawResultLine(ctx, 96, 800, 'Reveal', result.revealDone ? revealStrengthMarks(result.revealScore) : 0, 3, '#1a4a8a', 'diamond');
  drawResultLine(ctx, 96, 950, 'Blackout', result.blackoutDone ? Math.min(3, Math.max(1, Math.ceil(result.blackoutScore / 100))) : 0, 3, '#c84b2f', 'square');
  drawResultLine(ctx, 96, 1100, 'Arrange', result.arrangeDone ? (result.arrangeScore >= 100 ? 3 : result.arrangeScore > 0 ? 2 : 1) : 0, 3, '#d4a843', 'diamond');

  ctx.fillStyle = '#8a7f70';
  ctx.font = '30px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('engramble.app', 96, 1260);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('Unable to create result image.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `engramble-result-${todayDateString()}.jpg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function drawCanvasConfetti(CanvasContext: CanvasRenderingContext2D) {
  const pieces = [
    [170, 330, '#c84b2f', -0.35],
    [278, 250, '#d4a843', 0.22],
    [438, 318, '#2d6a4f', 0.48],
    [706, 252, '#1a4a8a', -0.28],
    [842, 344, '#c84b2f', 0.34],
    [912, 548, '#d4a843', -0.18],
    [214, 548, '#1a4a8a', 0.14],
    [802, 700, '#2d6a4f', -0.44],
  ] as const;
  for (const [x, y, color, rotation] of pieces) {
    CanvasContext.save();
    CanvasContext.translate(x, y);
    CanvasContext.rotate(rotation);
    CanvasContext.fillStyle = color;
    CanvasContext.fillRect(-10, -18, 20, 36);
    CanvasContext.restore();
  }
}

function drawResultLine(CanvasContext: CanvasRenderingContext2D, x: number, y: number, label: string, filled: number, total: number, color: string, shape: 'square' | 'diamond') {
  CanvasContext.fillStyle = '#191612';
  CanvasContext.font = '700 44px ui-monospace, SFMono-Regular, Menlo, monospace';
  CanvasContext.fillText(`${label}:`, x, y);
  CanvasContext.fillStyle = '#8a7f70';
  CanvasContext.font = '28px ui-monospace, SFMono-Regular, Menlo, monospace';
  CanvasContext.fillText(`${filled}/${total}`, x, y + 44);
  const boxSize = total > 6 ? 42 : 58;
  const gap = total > 6 ? 22 : 34;
  const startX = x + 320;
  for (let idx = 0; idx < total; idx += 1) {
    CanvasContext.fillStyle = idx < filled ? color : '#ded6c9';
    const markX = startX + idx * (boxSize + gap);
    if (shape === 'diamond') {
      CanvasContext.save();
      CanvasContext.translate(markX + boxSize / 2, y - 42 + boxSize / 2);
      CanvasContext.rotate(Math.PI / 4);
      CanvasContext.fillRect(-boxSize / 2, -boxSize / 2, boxSize, boxSize);
      CanvasContext.restore();
    } else {
      CanvasContext.fillRect(markX, y - 42, boxSize, boxSize);
    }
  }
}

function loadTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(STORAGE_THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function loadStudyIntent(): StudyIntent | null {
  if (typeof window === 'undefined') return null;
  const saved = window.localStorage.getItem(STORAGE_INTENT_KEY);
  return saved === 'warmup' || saved === 'review' || saved === 'deep-practice' ? saved : null;
}

function loadOnboardingDone(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(STORAGE_ONBOARDING_DONE_KEY) === 'true' || loadStudyIntent() !== null;
}

function saveOnboardingChoice(intent: StudyIntent) {
  window.localStorage.setItem(STORAGE_INTENT_KEY, intent);
  window.localStorage.setItem(STORAGE_ONBOARDING_DONE_KEY, 'true');
}

function loadStreakVisible(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_STREAK_VISIBLE_KEY) === 'true';
}

function loadDailyFocusSetIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_DAILY_FOCUS_SET_IDS_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function loadStreakShieldEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_STREAK_SHIELD_KEY) === 'true';
}

function loadGameSettings(): GameSettings {
  const defaults = { classifyGroups: CLASSIFY_GROUP_COUNT, revealRounds: REVEAL_ROUND_COUNT, blackoutRounds: 5, blackoutBlanks: 2, arrangeTerms: 6 };
  if (typeof window === 'undefined') return defaults;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_GAME_SETTINGS_KEY) ?? '{}');
    return {
      classifyGroups: clampNumber(saved.classifyGroups, 4, 6, CLASSIFY_GROUP_COUNT),
      revealRounds: clampNumber(saved.revealRounds, 3, 10, REVEAL_ROUND_COUNT),
      blackoutRounds: clampNumber(saved.blackoutRounds, 3, 10, defaults.blackoutRounds),
      blackoutBlanks: clampNumber(saved.blackoutBlanks, 1, 3, defaults.blackoutBlanks),
      arrangeTerms: clampNumber(saved.arrangeTerms, 3, 10, defaults.arrangeTerms),
    };
  } catch {
    return defaults;
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function currentWeekRange(): [string, string] {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return [formatDateOnly(start), formatDateOnly(end)];
}

function currentMonthRange(): [string, string] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return [start.toISOString(), end.toISOString()];
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function countTerms(set: StudySet) {
  return set.categories.reduce((sum, category) => sum + completeTerms(category).length, 0);
}

function parseBulkTerms(input: string): Term[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?)\s*(?:\t| - | – | — |: )\s*(.+)$/);
      if (!match) return null;
      const term = match[1].trim();
      const def = match[2].trim();
      return term && def ? { term, def } : null;
    })
    .filter((term): term is Term => Boolean(term));
}

function primerLabel(set: StudySet, setAccuracy: SetAccuracyItem[]) {
  const accuracy = setAccuracy.find((item) => item.setId === set.id);
  if (!accuracy || accuracy.attempts === 0) return set.name;
  return `${set.name} - lowest accuracy: ${accuracy.accuracy}%`;
}

function ScoreBox({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="score-box">
      <div className="score-box-val">{value}</div>
      <div className="score-box-lbl">{label}</div>
    </div>
  );
}

function ResultAchievement({
  label,
  filled,
  total,
  tone,
  caption,
  shape = 'square',
}: {
  label: string;
  filled: number;
  total: number;
  tone: 'classify' | 'reveal' | 'blackout' | 'arrange';
  caption: string;
  shape?: 'square' | 'diamond';
}) {
  return (
    <div className={`result-achievement ${tone}`}>
      <div className="result-achievement-top">
        <span>{label}</span>
        <strong>{caption}</strong>
      </div>
      <div className={`result-marks ${shape}`}>
        {Array.from({ length: total }).map((_, index) => (
          <span key={index} className={index < filled ? 'filled' : ''} />
        ))}
      </div>
    </div>
  );
}

function Loader({ size = 'md' }: { size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  return (
    <img
      className={`app-loader ${size}`}
      src="/engramble-loader.svg"
      alt=""
      aria-hidden="true"
    />
  );
}

function SetsGuide({ classifyGroupCount }: { classifyGroupCount: number }) {
  return (
    <section className="guide-panel" aria-label="Study set quick instructions">
      <div className="guide-card">
        <div className="guide-graphic plus-guide">+</div>
        <div><strong>Add a set</strong><span>Tap the round + button in the upper right.</span></div>
      </div>
      <div className="guide-card">
        <ModeIcon mode="connections" />
        <div><strong>Classify minimum</strong><span>{classifyGroupCount} categories with 4 complete terms each.</span></div>
      </div>
      <div className="guide-card">
        <ModeIcon mode="reveal" />
        <div><strong>Reveal minimum</strong><span>At least 1 term with a definition.</span></div>
      </div>
      <div className="guide-card">
        <ModeIcon mode="blackout" />
        <div><strong>Blackout minimum</strong><span>At least 1 definition. Blanks are picked automatically.</span></div>
      </div>
      <div className="guide-card">
        <ModeIcon mode="arrange" />
        <div><strong>Arrange minimum</strong><span>3 terms in one category. Untagged sets use category order.</span></div>
      </div>
    </section>
  );
}

function ModeIcon({ mode }: { mode: PickerMode }) {
  if (mode === 'arrange') {
    return (
      <div className="mode-icon">
        <img src="/arrange_icon.svg" alt="Arrange mode" draggable={false} />
      </div>
    );
  }
  if (mode === 'blackout') {
    return (
      <div className="mode-icon">
        <img src="/blackout_logo.svg" alt="Blackout mode" draggable={false} />
      </div>
    );
  }
  const src = mode === 'connections' ? '/connections_icon.svg' : '/reveal_icon.svg';
  const alt = `${modeLabel(mode)} mode`;

  return (
    <div className="mode-icon">
      <img src={src} alt={alt} draggable={false} />
    </div>
  );
}

function HomeModeCard({
  mode,
  completed,
  replayable,
  description,
  onStart,
  onSettings,
}: {
  mode: PickerMode;
  completed: boolean;
  replayable: boolean;
  description: string;
  onStart: () => void;
  onSettings: () => void;
}) {
  function handleKeyDown(event: { key: string; preventDefault: () => void }) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onStart();
  }

  return (
    <div
      className={`mode-card ${completed ? 'completed' : ''} ${replayable ? 'replayable' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onStart}
      onKeyDown={handleKeyDown}
      aria-label={`Play ${modeLabel(mode)}`}
    >
      <button
        className="mode-settings-btn"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSettings();
        }}
        aria-label={`${modeLabel(mode)} settings`}
        title={`${modeLabel(mode)} settings`}
      >
        <Settings size={17} strokeWidth={2.4} />
      </button>
      <ModeIcon mode={mode} />
      <div className="mode-title">{modeLabel(mode)}</div>
      <div className="mode-desc">{description}</div>
      {completed && <Check className="checkmark" size={20} />}
    </div>
  );
}

function GameIntroModal({ mode, classifyGroupCount, onClose, onStart }: { mode: PickerMode; classifyGroupCount: number; onClose: () => void; onStart: () => void }) {
  const intro = gameIntroCopy(mode, classifyGroupCount);
  return (
    <div className="reference-overlay show" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <div className="game-intro-modal">
        <div className="game-intro-header">
          <ModeIcon mode={mode} />
          <div>
            <div className="section-label">{modeLabel(mode)}</div>
            <h3>{intro.title}</h3>
          </div>
          <button className="picker-close" onClick={onClose}>x</button>
        </div>
        <div className="game-intro-steps">
          {intro.steps.map((step, index) => <IntroStep key={step} n={`${index + 1}`} text={step} />)}
        </div>
        <div className="game-intro-actions">
          <button className="btn primary" onClick={onStart}>Start {modeLabel(mode)}</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function GameSettingsModal({
  mode,
  isPaid,
  settings,
  onChange,
  onClose,
  onUpgrade,
}: {
  mode: PickerMode;
  isPaid: boolean;
  settings: GameSettings;
  onChange: (patch: Partial<GameSettings>) => void;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  return (
    <div className="reference-overlay show" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <div className="game-intro-modal game-settings-modal">
        <div className="game-intro-header">
          <ModeIcon mode={mode} />
          <div>
            <div className="section-label">{modeLabel(mode)}</div>
            <h3>Game Settings</h3>
          </div>
          <button className="picker-close" onClick={onClose}>x</button>
        </div>
        <div className="game-settings-modal-body">
          {isPaid ? (
            <GameSettingsPanel
              settings={settings}
              onChange={onChange}
              focusMode={mode}
            />
          ) : (
            <div className="empty-state compact">
              <Lock size={24} />
              <p>Custom game length is a premium feature.</p>
              <button className="btn primary" type="button" onClick={onUpgrade}>View premium</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IntroStep({ n, text }: { n: string; text: string }) {
  return (
    <div className="intro-step">
      <span>{n}</span>
      <p>{text}</p>
    </div>
  );
}

function modeLabel(mode: PickerMode): string {
  if (mode === 'connections') return 'Classify';
  if (mode === 'reveal') return 'Reveal';
  if (mode === 'blackout') return 'Blackout';
  return 'Arrange';
}

function eligibilityMessage(mode: PickerMode, classifyGroupCount: number): string {
  if (mode === 'connections') return `Classify needs at least ${classifyGroupCount} categories with 4 complete terms each before you can play.`;
  if (mode === 'reveal') return 'Reveal needs at least 1 complete term before you can play.';
  if (mode === 'blackout') return 'Blackout needs at least 1 complete definition before you can play.';
  return 'Arrange needs one category with at least 3 complete terms in the right order.';
}

function gameIntroCopy(mode: PickerMode, classifyGroupCount: number) {
  if (mode === 'connections') {
    return {
      title: 'Sort the grid into groups',
      steps: [
        'Pick four terms that belong to the same category.',
        'Submit the group. Correct groups lock in place.',
        `Solve all ${classifyGroupCount} groups before your mistakes run out.`,
      ],
    };
  }
  if (mode === 'reveal') {
    return {
      title: 'Guess from progressive clues',
      steps: [
        'Read each clue and guess the hidden term.',
        'Earlier guesses are worth more points.',
        'If you are stuck, reveal more clues or give up after clue four.',
      ],
    };
  }
  if (mode === 'blackout') {
    return {
      title: 'Fill the missing word from context',
      steps: [
        'Read the full definition with one key word blacked out.',
        'Type the missing word or phrase exactly enough to match.',
        'Each correct fill is worth 100 points.',
      ],
    };
  }
  return {
    title: 'Put terms in the right sequence',
    steps: [
      'Use the saved term order from one category as the answer key.',
      'Move terms up or down until the sequence makes sense.',
      'You get three attempts before the correct order is revealed.',
    ],
  };
}

function setPickerHint(mode: PickerMode): string {
  if (mode === 'connections') return 'Needs enough categories with 4+ terms each.';
  if (mode === 'reveal') return 'Any set with at least one complete term works.';
  if (mode === 'blackout') return 'Uses definitions and auto-picked blanks.';
  return 'Uses a category with at least 3 terms in saved order.';
}

function WeeklySnapshotPanel({ snapshot, isSignedIn }: { snapshot: WeeklySnapshot | null; isSignedIn: boolean }) {
  const best = snapshot?.bestCategory;
  const worst = snapshot?.worstCategory;

  return (
    <section className="weekly-panel">
      <div className="weekly-heading">
        <div>
          <div className="section-label">Weekly Snapshot</div>
          <h3>Consistency into growth</h3>
        </div>
        <Sparkles size={20} />
      </div>
      <div className="weekly-grid">
        <ScoreBox value={snapshot?.daysPlayed ?? 0} label="Days Played" />
        <ScoreBox value={snapshot?.termsStrengthened ?? 0} label="Terms Strengthened" />
      </div>
      <div className="category-performance-grid">
        <CategoryPerformance label="Best Category" item={best} emptyText={isSignedIn ? 'Play more to find it' : 'Sign in to track'} />
        <CategoryPerformance label="Needs Attention" item={worst} emptyText={isSignedIn ? 'No weak spot yet' : 'Sign in to track'} />
      </div>
    </section>
  );
}

function CategoryPerformance({ label, item, emptyText }: { label: string; item: { categoryName: string; accuracy: number; attempts: number } | null | undefined; emptyText: string }) {
  return (
    <div className="category-performance">
      <div className="category-performance-label">{label}</div>
      <div className="category-performance-name">{item?.categoryName ?? emptyText}</div>
      {item && <div className="category-performance-meta">{item.accuracy}% accuracy - {item.attempts} attempts</div>}
    </div>
  );
}

function SetReferenceModal({ title, subtitle, set, onClose }: { title: string; subtitle: string; set: StudySet; onClose: () => void }) {
  return (
    <div className="reference-overlay show" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <div className="reference-modal">
        <div className="reference-header">
          <div>
            <div className="section-label">{title}</div>
            <h3>{subtitle}</h3>
          </div>
          <button className="picker-close" onClick={onClose}>x</button>
        </div>
        <div className="reference-list">
          {set.categories.map((category) => (
            <section className="reference-category" key={category.name}>
              <div className="reference-category-title">
                <span className="cat-pip" style={{ background: category.color }} />
                {category.name}
              </div>
              {completeTerms(category).map((term, termIndex) => (
                <div className={`reference-term ${category.sequenceEnabled ? 'ordered' : ''}`} key={`${category.name}-${term.term}`}>
                  {category.sequenceEnabled && <span className="reference-order">{termIndex + 1}</span>}
                  <strong>{term.term}</strong>
                  <p>{term.def}</p>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function SharedSetModal({
  set,
  isLoading,
  message,
  onClose,
  onImport,
}: {
  set: StudySet | null;
  isLoading: boolean;
  message: { type: 'success' | 'error'; message: string } | null;
  onClose: () => void;
  onImport: () => void;
}) {
  const modalTitle = set?.name ?? (isLoading ? 'Loading shared set...' : message?.type === 'success' ? 'Shared set added' : 'Shared set');

  return (
    <div className="reference-overlay show">
      <div className="reference-modal">
        <div className="reference-header">
          <div>
            <div className="section-label">Shared Set</div>
            <h3>{modalTitle}</h3>
          </div>
          <button className="picker-close" onClick={onClose}>x</button>
        </div>
        <div className="reference-list">
          {isLoading && <div className="saving-strip"><Loader size="sm" />Loading shared set...</div>}
          {message && <div className={`alert ${message.type}`}>{message.message}</div>}
          {set && (
            <>
              {set.categories.map((category) => (
                <section className="reference-category" key={category.name}>
                  <div className="reference-category-title">
                    <span className="cat-pip" style={{ background: category.color }} />
                    {category.name}
                  </div>
                  {completeTerms(category).map((term, termIndex) => (
                    <div className={`reference-term ${category.sequenceEnabled ? 'ordered' : ''}`} key={`${category.name}-${term.term}`}>
                      {category.sequenceEnabled && <span className="reference-order">{termIndex + 1}</span>}
                      <strong>{term.term}</strong>
                      <p>{term.def}</p>
                    </div>
                  ))}
                </section>
              ))}
              <div className="shared-set-actions">
                <button className="btn primary" type="button" onClick={onImport}>Add to My Sets</button>
                <button className="btn" type="button" onClick={onClose}>Close</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OnboardingModal({ onChoose }: { onChoose: (intent: StudyIntent) => void }) {
  return (
    <div className="reference-overlay show">
      <div className="onboarding-modal">
        <div className="section-label">First Launch</div>
        <h2>How are you using Engramble?</h2>
        <div className="subtitle">This tunes the tone of the app. You can still use every feature either way.</div>
        <div className="onboarding-options">
          <button className="onboarding-option" onClick={() => onChoose('warmup')}>
            <strong>Warm-up</strong>
            <span>Quick confidence before class or a quiz.</span>
          </button>
          <button className="onboarding-option" onClick={() => onChoose('review')}>
            <strong>Review</strong>
            <span>Steady recall practice for current material.</span>
          </button>
          <button className="onboarding-option" onClick={() => onChoose('deep-practice')}>
            <strong>Deep Practice</strong>
            <span>Focused repetition for harder sets.</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanMeter({ label, value, max, unlimited }: { label: string; value: number; max: number; unlimited: boolean }) {
  const pct = unlimited ? 100 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="plan-meter">
      <div className="plan-meter-top">
        <span>{label}</span>
        <span>{unlimited ? `${value} / unlimited` : `${value} / ${max}`}</span>
      </div>
      <div className="plan-meter-track">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FeatureItem({ active, label }: { active: boolean; label: string }) {
  return (
    <div className={`feature-item ${active ? 'active' : 'locked'}`}>
      {active ? <Crown size={14} /> : <Lock size={14} />}
      <span>{label}</span>
    </div>
  );
}

function DailySetFocusPanel({
  sets,
  selectedIds,
  onToggle,
  onClear,
}: {
  sets: StudySet[];
  selectedIds: string[];
  onToggle: (setId: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="daily-focus-panel">
      <div className="daily-focus-heading">
        <div>
          <strong>Daily Set Focus</strong>
          <small>{selectedIds.length ? `${selectedIds.length} set${selectedIds.length === 1 ? '' : 's'} feeding daily games` : 'All eligible sets can appear'}</small>
        </div>
        {selectedIds.length > 0 && <button className="btn sm" type="button" onClick={onClear}>Clear</button>}
      </div>
      <div className="daily-focus-list">
        {sets.length === 0 ? (
          <div className="empty-line">Create a set first.</div>
        ) : sets.map((set) => (
          <label className="daily-focus-item" key={set.id}>
            <input type="checkbox" checked={selectedIds.includes(set.id)} onChange={() => onToggle(set.id)} />
            <span>
              <strong>{set.name}</strong>
              <small>{set.categories.length} categories - {countTerms(set)} terms</small>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function GameSettingsPanel({
  settings,
  onChange,
  focusMode,
}: {
  settings: GameSettings;
  onChange: (patch: Partial<GameSettings>) => void;
  focusMode?: PickerMode;
}) {
  return (
    <div className="game-settings-panel">
      <div className="daily-focus-heading">
        <div>
          <strong>{focusMode ? `${modeLabel(focusMode)} Settings` : 'Game Settings'}</strong>
          <small>{focusMode ? gameSettingsHint(focusMode) : 'Set puzzle length separately for each mode.'}</small>
        </div>
      </div>
      <div className="game-settings-grid">
        {(!focusMode || focusMode === 'connections') && <label className="setting-stepper">
          <span>
            <strong>Classify groups</strong>
            <small>{settings.classifyGroups} groups, 4 terms each</small>
          </span>
          <select
            value={settings.classifyGroups}
            onChange={(event) => onChange({ classifyGroups: Number(event.target.value) })}
          >
            {[4, 5, 6].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>}
        {(!focusMode || focusMode === 'reveal') && <label className="setting-stepper">
          <span>
            <strong>Reveal rounds</strong>
            <small>{settings.revealRounds} terms per Reveal game</small>
          </span>
          <select
            value={settings.revealRounds}
            onChange={(event) => onChange({ revealRounds: Number(event.target.value) })}
          >
            {[3, 4, 5, 6, 7, 8, 9, 10].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>}
        {(!focusMode || focusMode === 'blackout') && <label className="setting-stepper">
          <span>
            <strong>Blackout rounds</strong>
            <small>{settings.blackoutRounds} definitions per Blackout game</small>
          </span>
          <select
            value={settings.blackoutRounds}
            onChange={(event) => onChange({ blackoutRounds: Number(event.target.value) })}
          >
            {[3, 4, 5, 6, 7, 8, 9, 10].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>}
        {(!focusMode || focusMode === 'blackout') && <label className="setting-stepper">
          <span>
            <strong>Blackout blanks</strong>
            <small>{settings.blackoutBlanks} blanks per definition max</small>
          </span>
          <select
            value={settings.blackoutBlanks}
            onChange={(event) => onChange({ blackoutBlanks: Number(event.target.value) })}
          >
            {[1, 2, 3].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>}
        {(!focusMode || focusMode === 'arrange') && <label className="setting-stepper">
          <span>
            <strong>Arrange terms</strong>
            <small>{settings.arrangeTerms} terms per Arrange game</small>
          </span>
          <select
            value={settings.arrangeTerms}
            onChange={(event) => onChange({ arrangeTerms: Number(event.target.value) })}
          >
            {[3, 4, 5, 6, 7, 8, 9, 10].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>}
      </div>
      <div className="hint">{focusMode ? gameSettingsDetail(focusMode) : 'Classify samples random eligible categories. Arrange uses tagged categories first, otherwise a random eligible category.'}</div>
    </div>
  );
}

function gameSettingsHint(mode: PickerMode): string {
  if (mode === 'connections') return 'Choose how many groups appear in each Classify puzzle.';
  if (mode === 'reveal') return 'Choose how many Reveal rounds appear in each game.';
  if (mode === 'blackout') return 'Choose the number of Blackout rounds and max blanks.';
  return 'Choose how many terms appear in each Arrange puzzle.';
}

function gameSettingsDetail(mode: PickerMode): string {
  if (mode === 'connections') return 'Classify samples random eligible categories from the chosen set.';
  if (mode === 'reveal') return 'More rounds means more terms per Reveal game.';
  if (mode === 'blackout') return 'Blanks are still picked automatically from important definition words.';
  return 'Tagged ordered categories are used first; untagged sets use saved category order.';
}

function LeaderboardSection({ entries, currentUserId }: { entries: FriendLeaderboardEntry[]; currentUserId: string | null }) {
  return (
    <section className="account-panel">
      <div className="section-label">Today&apos;s Leaderboard</div>
      <div className="leaderboard-list">
        {entries.length === 0 ? (
          <div className="empty-line">Add friends from Account to compare today&apos;s scores.</div>
        ) : entries.map((entry, index) => (
          <div className="leaderboard-row" key={entry.userId}>
            <span className="leaderboard-rank">{index + 1}</span>
            <span className="leaderboard-name">
              {entry.username ?? entry.email}{entry.userId === currentUserId ? ' (you)' : ''}
              {index === 0 && <Crown className="leaderboard-crown" size={15} aria-label="Top player" />}
            </span>
            <span className="leaderboard-score">{entry.totalScore} pts</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AnalyticsPanel({ analytics, onRefresh, onReset }: { analytics: PerformanceAnalytics | null; onRefresh: () => void; onReset: () => void }) {
  return (
    <section className="account-panel analytics-panel">
      <div className="analytics-heading">
        <div>
          <div className="section-label">Performance Analytics - This Month</div>
          <h3>{analytics?.totalAttempts ? `${analytics.accuracy}% accuracy` : 'No attempts yet'}</h3>
        </div>
        <div className="analytics-actions">
          <button className="btn sm" onClick={onRefresh}>Refresh</button>
          <button className="btn sm danger" onClick={onReset} disabled={!analytics || analytics.totalAttempts === 0}>Reset</button>
        </div>
      </div>

      {!analytics || analytics.totalAttempts === 0 ? (
        <div className="empty-line">Play the test set or any daily game to start collecting term-level analytics.</div>
      ) : (
        <>
          <div className="analytics-stats">
            <ScoreBox value={analytics.totalAttempts} label="Attempts" />
            <ScoreBox value={analytics.correctAttempts} label="Correct" />
            <ScoreBox value={`${analytics.accuracy}%`} label="Accuracy" />
          </div>

          <div className="analytics-columns">
            <div>
              <div className="mini-label">Weakest Terms</div>
              <div className="analytics-list">
                {analytics.weakestTerms.length === 0 ? (
                  <div className="empty-line">No missed terms yet.</div>
                ) : analytics.weakestTerms.map((item) => (
                  <div className="analytics-row" key={`${item.categoryName}-${item.term}`}>
                    <div>
                      <div className="analytics-name">{item.term}</div>
                      <div className="analytics-meta">{item.categoryName} - {item.missed} missed</div>
                    </div>
                    <span>{item.accuracy}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mini-label">Weakest Categories</div>
              <div className="analytics-list">
                {analytics.weakestCategories.length === 0 ? (
                  <div className="empty-line">No weak categories yet.</div>
                ) : analytics.weakestCategories.map((item) => (
                  <div className="analytics-row" key={item.categoryName}>
                    <div>
                      <div className="analytics-name">{item.categoryName}</div>
                      <div className="analytics-meta">{item.missed} missed - {item.attempts} attempts</div>
                    </div>
                    <span>{item.accuracy}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mini-label">Recent Accuracy</div>
          <div className="trend-bars">
            {analytics.recentTrend.map((day) => (
              <div className="trend-day" key={day.date}>
                <div className="trend-bar-track"><span style={{ height: `${Math.max(8, day.accuracy)}%` }} /></div>
                <div>{day.date.slice(5)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function AdminScreen({
  users,
  search,
  message,
  isLoading,
  currentUserId,
  onQueueNotification,
  onSendQueuedNotifications,
  onSearchChange,
  onSearch,
  onRefresh,
  onPlanChange,
}: {
  users: AdminUserRow[];
  search: string;
  message: { type: 'success' | 'error'; message: string } | null;
  isLoading: boolean;
  currentUserId: string | null;
  onQueueNotification: (title: string, body: string, url: string) => Promise<void>;
  onSendQueuedNotifications: () => Promise<{ pushed: number; failed: number; ts: string }>;
  onSearchChange: (search: string) => void;
  onSearch: () => void;
  onRefresh: () => void;
  onPlanChange: (userId: string, plan: Plan) => void;
}) {
  const premiumCount = users.filter((user) => user.plan === 'paid').length;
  const [notifTitle, setNotifTitle] = useState('Engramble notification test');
  const [notifBody, setNotifBody] = useState('If you can see this, push notifications are working.');
  const [notifUrl, setNotifUrl] = useState('/');
  const [notifStatus, setNotifStatus] = useState<string | null>(null);
  const [isSendingNotifications, setIsSendingNotifications] = useState(false);

  async function queueNotificationTest() {
    setNotifStatus(null);
    try {
      await onQueueNotification(notifTitle, notifBody, notifUrl);
      setNotifStatus('Queued. Run the push function or wait for the next scheduled notification cycle.');
    } catch (error) {
      setNotifStatus(`Queue failed: ${error instanceof Error ? error.message : 'Unable to queue test notification.'}`);
    }
  }

  async function sendQueuedNotifications() {
    setNotifStatus(null);
    setIsSendingNotifications(true);
    try {
      const result = await onSendQueuedNotifications();
      setNotifStatus(`Sent now. Pushed: ${result.pushed}. Failed: ${result.failed}.`);
    } catch (error) {
      setNotifStatus(`Send failed: ${error instanceof Error ? error.message : 'Unable to run notification sender.'}`);
    } finally {
      setIsSendingNotifications(false);
    }
  }

  return (
    <main className="screen active">
      <div className="admin-hero">
        <div>
          <h2>Admin</h2>
          <div className="subtitle">Search users and control account tiers.</div>
        </div>
        <button className="btn sm" onClick={onRefresh} disabled={isLoading}>{isLoading ? <><Loader size="xs" />Loading...</> : 'Refresh'}</button>
      </div>

      <div className="score-row">
        <ScoreBox value={users.length} label="Users Shown" />
        <ScoreBox value={premiumCount} label="Premium" />
        <ScoreBox value={users.length - premiumCount} label="Free" />
      </div>

      <section className="account-panel admin-panel admin-users-panel">
        <div className="admin-panel-heading">
          <div>
            <div className="section-label">User Search</div>
            <h3>Accounts</h3>
          </div>
          <span className="admin-result-count">{users.length} shown</span>
        </div>
        <div className="admin-search-row">
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && onSearch()}
            placeholder="Search email or username"
          />
          <button className="btn primary" onClick={onSearch} disabled={isLoading}>
            {isLoading ? <><Loader size="xs" />Searching...</> : 'Search'}
          </button>
        </div>
        {message && <div className={`alert ${message.type}`}>{message.message}</div>}
        <div className="admin-user-list">
          {users.length === 0 ? (
            <div className="empty-state compact">
              <div className="empty-icon">?</div>
              <p>No users found.</p>
            </div>
          ) : users.map((user) => (
            <article className="admin-user-card" key={user.id}>
              <div className="admin-user-main">
                <div>
                  <div className="admin-user-name">
                    {user.username ?? 'No username'}
                    {user.isAdmin && <span className="tier-badge">Admin</span>}
                    {user.id === currentUserId && <span className="tier-badge">You</span>}
                  </div>
                  <div className="admin-user-email">{user.email}</div>
                </div>
                <div className={`admin-plan-pill ${user.plan}`}>{user.plan === 'paid' ? 'Premium' : 'Free'}</div>
              </div>
              <div className="admin-user-meta">
                <span>{user.streak} streak</span>
                <span>{user.daysPlayed} days played</span>
              </div>
              <div className="admin-plan-actions">
                <button
                  className={`btn sm ${user.plan === 'free' ? 'primary' : ''}`}
                  onClick={() => onPlanChange(user.id, 'free')}
                  disabled={user.plan === 'free'}
                >
                  Set Free
                </button>
                <button
                  className={`btn sm ${user.plan === 'paid' ? 'primary' : ''}`}
                  onClick={() => onPlanChange(user.id, 'paid')}
                  disabled={user.plan === 'paid'}
                >
                  Set Premium
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="account-panel admin-panel">
        <div className="section-label">Notification Test</div>
        <div className="admin-notif-grid">
          <div className="field compact">
            <label>Preset Title</label>
            <input value={notifTitle} onChange={(event) => setNotifTitle(event.target.value)} />
          </div>
          <div className="field compact">
            <label>Preset Description</label>
            <input value={notifBody} onChange={(event) => setNotifBody(event.target.value)} />
          </div>
          <div className="field compact">
            <label>Open URL</label>
            <input value={notifUrl} onChange={(event) => setNotifUrl(event.target.value)} />
          </div>
        </div>
        <div className="admin-notif-actions">
          <button className="btn primary" onClick={() => void queueNotificationTest()}>
            Queue Test Notification
          </button>
          <button className="btn" onClick={() => void sendQueuedNotifications()} disabled={isSendingNotifications}>
            {isSendingNotifications ? <><Loader size="xs" />Sending...</> : 'Send Queued Now'}
          </button>
        </div>
        {notifStatus && <div className="hint">{notifStatus}</div>}
      </section>
    </main>
  );
}

function PremiumScreen({ setsCount, totalTerms, onBack }: { setsCount: number; totalTerms: number; onBack: () => void }) {
  return (
    <main className="screen active">
      <div className="premium-hero">
        <div>
          <h2>Premium</h2>
          <div className="subtitle">For students who keep adding material and want smarter daily review.</div>
        </div>
        <button className="btn sm" onClick={onBack}>Account</button>
      </div>

      <section className="account-panel premium-summary">
        <div className="premium-summary-main">
          <div className="premium-mark"><Crown size={22} /></div>
          <div>
            <h3>Unlock the full study loop</h3>
            <p>Free keeps the habit working. Premium removes the limits and adds the tools serious students need after their sets start piling up.</p>
          </div>
        </div>
        <div className="tier-usage">
          <PlanMeter label="Free sets used" value={setsCount} max={FREE_SET_LIMIT} unlimited={false} />
          <PlanMeter label="Free term capacity" value={totalTerms} max={FREE_SET_LIMIT * FREE_TERM_LIMIT} unlimited={false} />
        </div>
      </section>

      <section className="account-panel comparison-panel">
        <div className="comparison-table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Free</th>
                <th>Premium</th>
              </tr>
            </thead>
            <tbody>
              {premiumFeatures.map((row) => (
                <tr key={row.feature} className={row.highlight ? 'highlight' : ''}>
                  <td>{row.feature}</td>
                  <td>{row.free}</td>
                  <td>{row.premium}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="account-panel premium-cta">
        <div>
          <h3>Premium checkout is coming next.</h3>
          <p>For now, the free limits are active so the upgrade path is visible and ready for billing.</p>
        </div>
        <button className="btn primary upgrade-btn" type="button">
          <Crown size={15} />
          Upgrade coming soon
        </button>
      </section>
    </main>
  );
}

function SetPicker({ mode, sets, onClose, onPick }: { mode: PickerMode; sets: StudySet[]; onClose: () => void; onPick: (set: StudySet) => void }) {
  return (
    <div className="picker-overlay show" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <div className="picker-modal">
        <div className="picker-header">
          <div>
            <h3>Pick a Set - {modeLabel(mode)}</h3>
            <p>{setPickerHint(mode)}</p>
          </div>
          <button className="picker-close" onClick={onClose}>x</button>
        </div>
        <div className="picker-list">
          {sets.map((set) => (
            <button className="picker-set-card" key={set.id} onClick={() => onPick(set)}>
              <div>
                <div className="picker-set-name">{set.name}</div>
                <div className="picker-set-meta">{set.categories.length} categories / {set.categories.reduce((sum, category) => sum + category.terms.length, 0)} terms</div>
                <div className="picker-cats">
                  {set.categories.map((category) => <span className="picker-cat-tag" style={{ background: category.color }} key={category.name}>{category.name}</span>)}
                </div>
              </div>
              <span className="picker-arrow">-&gt;</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RevealScreen({
  reveal,
  onBack,
  onGuessChange,
  onSubmit,
  onNextClue,
  onGiveUp,
}: {
  reveal: RevealState;
  onBack: () => void;
  onGuessChange: (guess: string) => void;
  onSubmit: () => void;
  onNextClue: () => void;
  onGiveUp: () => void;
}) {
  const round = reveal.rounds[reveal.currentRound];
  const clues = round ? generateRevealClues(round.term, round.def) : [];
  const wrongGuesses = reveal.wrongGuesses[reveal.currentRound] ?? 0;
  const currentPenalty = wrongGuesses * REVEAL_WRONG_GUESS_PENALTY;

  return (
    <main className="screen active">
      <div className="game-heading">
        <button className="btn sm" onClick={onBack}>Back</button>
        <h2>Reveal</h2>
      </div>
      <div className="subtitle">Guess the term from progressive clues.</div>
      <div className="score-display">
        <ScoreBox value={reveal.score} label="Points" />
        <ScoreBox value={reveal.currentRound + 1} label="Round" />
        <ScoreBox value={reveal.rounds.length || '-'} label="Of" />
      </div>
      <section className="reveal-card">
        <div className="reveal-header">
          <span>Clues revealed</span>
          <span className="clue-number">{reveal.cluesShown} / 4</span>
        </div>
        <div className="clues-list">
          {clues.map((clue, index) => {
            const shown = index < reveal.cluesShown;
            return (
              <div className={`clue-item ${shown ? 'revealed' : 'hidden'}`} key={index}>
                <span className="clue-idx">{index + 1}.</span>
                <span className="clue-text">{shown ? clue : 'Locked'}</span>
                <span className="points-badge">{POINTS_BY_CLUE[index]}pts</span>
              </div>
            );
          })}
        </div>
        <div className="reveal-guess-area">
          <div className="feedback">{reveal.feedback}</div>
          {wrongGuesses > 0 && (
            <div className="reveal-penalty">
              {wrongGuesses} incorrect {wrongGuesses === 1 ? 'guess' : 'guesses'} -{currentPenalty} pts from this round
            </div>
          )}
          <div className="guess-row">
            <input value={reveal.guess} onChange={(event) => onGuessChange(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && onSubmit()} placeholder="Your answer..." />
            <button className="btn primary" onClick={onSubmit}>Guess</button>
            <button className="btn" onClick={onNextClue}>Next Clue</button>
            {reveal.cluesShown >= 4 && <button className="btn danger" onClick={onGiveUp}>Give Up</button>}
          </div>
        </div>
      </section>
    </main>
  );
}

function BlackoutScreen({
  blackout,
  onBack,
  onGuessChange,
  onSubmit,
  onGiveUp,
}: {
  blackout: BlackoutState;
  onBack: () => void;
  onGuessChange: (guess: string) => void;
  onSubmit: () => void;
  onGiveUp: () => void;
}) {
  const round = blackout.rounds[blackout.currentRound];
  const attemptsUsed = blackout.attempts[blackout.currentRound] ?? 0;
  return (
    <main className="screen active">
      <div className="game-heading">
        <button className="btn sm" onClick={onBack}>Back</button>
        <h2>Blackout</h2>
      </div>
      <div className="subtitle">Use the full definition to recover the missing vocabulary.</div>
      <div className="score-display">
        <ScoreBox value={blackout.score} label="Points" />
        <ScoreBox value={blackout.currentRound + 1} label="Round" />
        <ScoreBox value={blackout.rounds.length || '-'} label="Of" />
        <ScoreBox value={Math.max(0, 3 - attemptsUsed)} label="Tries Left" />
      </div>
      <section className="blackout-card">
        <div className="section-label">{round?.catName ?? 'Definition'}</div>
        <p className="blackout-definition">
          {round ? (
            <>
              {round.promptParts.map((part, index) => (
                <Fragment key={index}>
                  {part}
                  {index < round.answers.length && (
                    <span className="blackout-blank">{'_'.repeat(Math.max(6, Math.min(18, round.answers[index].length)))}</span>
                  )}
                </Fragment>
              ))}
            </>
          ) : 'No blackout round available.'}
        </p>
        <div className="feedback">{blackout.feedback}</div>
        <div className="guess-row">
          <input value={blackout.guess} onChange={(event) => onGuessChange(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && onSubmit()} placeholder={round && round.answers.length > 1 ? 'Missing words, comma separated...' : 'Missing word...'} />
          <button className="btn primary" onClick={onSubmit}>Fill Blank</button>
          <button className="btn danger" onClick={onGiveUp}>Give Up</button>
        </div>
      </section>
    </main>
  );
}

function ArrangeScreen({
  arrange,
  onBack,
  onReorder,
  onRevealDefinition,
  onSubmit,
}: {
  arrange: ArrangeState;
  onBack: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRevealDefinition: (termId: string) => void;
  onSubmit: () => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const touchDragIndex = useRef<number | null>(null);

  function startTouchDrag(event: ReactPointerEvent<HTMLDivElement>, index: number) {
    if (event.pointerType === 'mouse' || arrange.solved) return;
    if (event.target instanceof Element && event.target.closest('button')) return;
    event.preventDefault();
    touchDragIndex.current = index;
    setDragIndex(index);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveTouchDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (touchDragIndex.current === null || event.pointerType === 'mouse') return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-arrange-index]');
    const targetIndex = target ? Number(target.dataset.arrangeIndex) : Number.NaN;
    if (!Number.isInteger(targetIndex) || targetIndex === touchDragIndex.current) return;
    onReorder(touchDragIndex.current, targetIndex);
    touchDragIndex.current = targetIndex;
    setDragIndex(targetIndex);
  }

  function endTouchDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (touchDragIndex.current === null || event.pointerType === 'mouse') return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    touchDragIndex.current = null;
    setDragIndex(null);
  }

  return (
    <main className="screen active">
      <div className="game-heading">
        <button className="btn sm" onClick={onBack}>Back</button>
        <h2>Arrange</h2>
      </div>
      <div className="subtitle">Move terms into the correct sequence.</div>
      <div className="score-display">
        <ScoreBox value={arrange.score} label="Points" />
        <ScoreBox value={Math.max(0, 3 - arrange.attempts)} label="Attempts Left" />
        <ScoreBox value={arrange.definitionReveals} label="Defs Shown" />
        <ScoreBox value={arrange.order.length || '-'} label="Terms" />
      </div>
      <section className="arrange-card">
        <div className="arrange-category" style={{ borderColor: arrange.round?.color ?? 'var(--ink)' }}>
          <div className="section-label">Sequence</div>
          <h3>{arrange.round?.categoryName ?? 'No category'}</h3>
        </div>
        <div className="arrange-list">
          {arrange.order.map((term, index) => (
            <div
              className={`arrange-item ${dragIndex === index ? 'dragging' : ''}`}
              key={term.id}
              data-arrange-index={index}
              draggable={!arrange.solved}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragIndex !== null) onReorder(dragIndex, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              onPointerDown={(event) => startTouchDrag(event, index)}
              onPointerMove={moveTouchDrag}
              onPointerUp={endTouchDrag}
              onPointerCancel={endTouchDrag}
            >
              <span className="arrange-index">{index + 1}</span>
              <div className="arrange-term-main">
                <span>{term.term}</span>
                {arrange.revealedDefinitions.includes(term.id) && <p>{term.def}</p>}
              </div>
              <button className="btn sm" disabled={arrange.solved || arrange.revealedDefinitions.includes(term.id)} onClick={() => onRevealDefinition(term.id)}>Show Definition</button>
            </div>
          ))}
        </div>
        <div className="feedback">{arrange.feedback}</div>
        <button className="btn primary full" disabled={!arrange.round || arrange.solved} onClick={onSubmit}>Submit Order</button>
      </section>
    </main>
  );
}

function buildResultSummary(
  connectionMistakes: number,
  revealScore: number,
  blackoutScore: number,
  arrangeScore: number,
  completed: { connections: boolean; reveal: boolean; blackout: boolean; arrange: boolean },
  connectionGroupCount: number,
) {
  const solvedGroups = Math.max(0, connectionGroupCount - Math.min(connectionMistakes, connectionGroupCount));
  const revealLabel = completed.reveal ? (revealScore >= 200 ? 'Strong' : revealScore >= 100 ? 'Steady' : 'Needs work') : 'Open';
  const revealFilled = completed.reveal ? revealStrengthMarks(revealScore) : 0;
  const blackoutFilled = completed.blackout ? Math.min(3, Math.max(1, Math.ceil(blackoutScore / 100))) : 0;
  const arrangeFilled = completed.arrange ? (arrangeScore >= 100 ? 3 : arrangeScore > 0 ? 2 : 1) : 0;
  return {
    classify: completed.connections ? `${solvedGroups}/${connectionGroupCount} groups` : 'Open',
    classifyFilled: completed.connections ? solvedGroups : 0,
    classifyTotal: connectionGroupCount,
    reveal: revealLabel,
    revealFilled,
    revealTotal: 3,
    blackout: completed.blackout ? `${blackoutScore} pts` : 'Open',
    blackoutFilled,
    blackoutTotal: 3,
    arrange: completed.arrange ? (arrangeScore > 0 ? 'Sequenced' : 'Revealed') : 'Open',
    arrangeFilled,
    arrangeTotal: 3,
  };
}

function revealStrengthMarks(revealScore: number) {
  return revealScore >= 200 ? 3 : revealScore >= 100 ? 2 : 1;
}

function buildResultText(
  today: string,
  username: string,
  score: number,
  summary: { classify: string; classifyFilled: number; classifyTotal: number; reveal: string; revealFilled: number; revealTotal: number; blackout: string; blackoutFilled: number; blackoutTotal: number; arrange: string; arrangeFilled: number; arrangeTotal: number },
) {
  const classifyMarks = makeResultMarks(summary.classifyFilled, summary.classifyTotal, '¦', '?');
  const revealMarks = makeResultMarks(summary.revealFilled, summary.revealTotal, '?', '?');
  const blackoutMarks = makeResultMarks(summary.blackoutFilled, summary.blackoutTotal, '¦', '?');
  const arrangeMarks = makeResultMarks(summary.arrangeFilled, summary.arrangeTotal, '?', '?');
  return `Engramble\n${username} - ${today}\n\nClassify: ${classifyMarks} ${summary.classify}\nReveal: ${revealMarks} ${summary.reveal}\nBlackout: ${blackoutMarks} ${summary.blackout}\nArrange: ${arrangeMarks} ${summary.arrange}\nScore: ${score} pts\n\nengramble.app`;
}

function makeResultMarks(filled: number, total: number, on: string, off: string) {
  return Array.from({ length: total }, (_, index) => (index < filled ? on : off)).join('');
}



