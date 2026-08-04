import type { User } from '@supabase/supabase-js';
import type { Category, StudySet, UserProfile } from '../types';
import { supabase } from './supabase';

interface StudySetRow {
  id: string;
  owner_id: string;
  name: string;
  is_public: boolean;
  share_slug: string | null;
  created_at: string;
}

interface CategoryRow {
  id: string;
  set_id: string;
  name: string;
  color: string;
  sequence_enabled: boolean;
  sort_order: number;
}

interface TermRow {
  id: string;
  category_id: string;
  term: string;
  def: string;
  blackout_words: string | null;
  sort_order: number;
}

interface ProfileRow {
  id: string;
  email: string;
  username: string | null;
  plan: 'free' | 'paid';
  is_admin: boolean;
  streak: number;
  last_played_date: string | null;
  days_played: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  username: string | null;
  plan: 'free' | 'paid';
  isAdmin: boolean;
  streak: number;
  daysPlayed: number;
  createdAt: string;
}

export interface FriendProfile {
  id: string;
  username: string | null;
  email: string;
}

export interface FriendshipView {
  id: string;
  status: 'pending' | 'accepted' | 'blocked';
  direction: 'incoming' | 'outgoing';
  friend: FriendProfile;
}

export interface FriendLeaderboardEntry {
  userId: string;
  username: string | null;
  email: string;
  totalScore: number;
  connectionsScore: number;
  revealScore: number;
  blackoutScore: number;
  arrangeScore: number;
  completed: boolean;
}

export interface DailyRecordView {
  connectionsCompleted: boolean;
  connectionsMistakes: number;
  connectionsScore: number;
  revealCompleted: boolean;
  revealScore: number;
  blackoutCompleted: boolean;
  blackoutScore: number;
  arrangeCompleted: boolean;
  arrangeScore: number;
  totalScore: number;
}

export interface TermAttemptInput {
  setId?: string;
  categoryName: string;
  term: string;
  gameMode: 'connections' | 'reveal' | 'blackout' | 'arrange';
  correct: boolean;
}

interface TermAttemptRow {
  term: string;
  category_name: string;
  game_mode: 'connections' | 'reveal' | 'blackout' | 'arrange';
  correct: boolean;
  created_at: string;
}

export interface TermAnalyticsItem {
  term: string;
  categoryName: string;
  attempts: number;
  correct: number;
  missed: number;
  accuracy: number;
}

export interface CategoryAnalyticsItem {
  categoryName: string;
  attempts: number;
  correct: number;
  missed: number;
  accuracy: number;
}

export interface PerformanceAnalytics {
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;
  weakestTerms: TermAnalyticsItem[];
  weakestCategories: CategoryAnalyticsItem[];
  recentTrend: Array<{ date: string; attempts: number; accuracy: number }>;
}

export interface SetAccuracyItem {
  setId: string;
  attempts: number;
  correct: number;
  missed: number;
  accuracy: number;
}

export interface WeeklySnapshot {
  weekStart: string;
  weekEnd: string;
  daysPlayed: number;
  termsStrengthened: number;
  bestCategory: CategoryAnalyticsItem | null;
  worstCategory: CategoryAnalyticsItem | null;
}

export interface NotificationDispatchResult {
  pushed: number;
  failed: number;
  ts: string;
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function ensureProfile(user: User): Promise<UserProfile> {
  const client = requireSupabase();
  const email = user.email ?? '';

  const { data, error } = await client
    .from('profiles')
    .upsert({ id: user.id, email }, { onConflict: 'id' })
    .select('id,email,username,plan,is_admin,streak,last_played_date,days_played')
    .single<ProfileRow>();

  if (error) throw error;
  return mapProfile(data);
}

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('profiles')
    .select('id,email,username,plan,is_admin,streak,last_played_date,days_played')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();

  if (error) throw error;
  return data ? mapProfile(data) : null;
}

export async function fetchStudySets(ownerId: string): Promise<StudySet[]> {
  const client = requireSupabase();

  const { data: setRows, error: setError } = await client
    .from('study_sets')
    .select('id,owner_id,name,is_public,share_slug,created_at')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
    .returns<StudySetRow[]>();

  if (setError) throw setError;
  if (!setRows.length) return [];

  const setIds = setRows.map((set) => set.id);
  const { data: categoryRows, error: categoryError } = await client
    .from('categories')
    .select('id,set_id,name,color,sequence_enabled,sort_order')
    .in('set_id', setIds)
    .order('sort_order', { ascending: true })
    .returns<CategoryRow[]>();

  if (categoryError) throw categoryError;

  const categoryIds = categoryRows.map((category) => category.id);
  const { data: termRows, error: termError } = categoryIds.length
    ? await client
        .from('terms')
        .select('id,category_id,term,def,blackout_words,sort_order')
        .in('category_id', categoryIds)
        .order('sort_order', { ascending: true })
        .returns<TermRow[]>()
    : { data: [] as TermRow[], error: null };

  if (termError) throw termError;

  return setRows.map((set) => ({
    id: set.id,
    ownerId: set.owner_id,
    name: set.name,
    createdAt: set.created_at,
    isPublic: set.is_public,
    shareSlug: set.share_slug ?? undefined,
    categories: categoryRows
      .filter((category) => category.set_id === set.id)
      .map((category) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        sequenceEnabled: category.sequence_enabled,
        terms: termRows
          .filter((term) => term.category_id === category.id)
          .map((term) => ({ term: term.term, def: term.def, blackoutWords: term.blackout_words ?? undefined })),
      })),
  }));
}

export async function fetchPublicStudySetBySlug(slug: string): Promise<StudySet | null> {
  const client = requireSupabase();
  const cleaned = slug.trim();
  if (!cleaned) return null;

  const { data: setRow, error: setError } = await client
    .from('study_sets')
    .select('id,owner_id,name,is_public,share_slug,created_at')
    .eq('share_slug', cleaned)
    .eq('is_public', true)
    .maybeSingle<StudySetRow>();

  if (setError) throw setError;
  if (!setRow) return null;

  const { data: categoryRows, error: categoryError } = await client
    .from('categories')
    .select('id,set_id,name,color,sequence_enabled,sort_order')
    .eq('set_id', setRow.id)
    .order('sort_order', { ascending: true })
    .returns<CategoryRow[]>();

  if (categoryError) throw categoryError;

  const categoryIds = categoryRows.map((category) => category.id);
  const { data: termRows, error: termError } = categoryIds.length
    ? await client
        .from('terms')
        .select('id,category_id,term,def,blackout_words,sort_order')
        .in('category_id', categoryIds)
        .order('sort_order', { ascending: true })
        .returns<TermRow[]>()
    : { data: [] as TermRow[], error: null };

  if (termError) throw termError;

  return {
    id: setRow.id,
    ownerId: setRow.owner_id,
    name: setRow.name,
    createdAt: setRow.created_at,
    isPublic: setRow.is_public,
    shareSlug: setRow.share_slug ?? undefined,
    categories: categoryRows.map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      sequenceEnabled: category.sequence_enabled,
      terms: termRows
        .filter((term) => term.category_id === category.id)
        .map((term) => ({ term: term.term, def: term.def, blackoutWords: term.blackout_words ?? undefined })),
    })),
  };
}

export async function saveStudySet(ownerId: string, set: Pick<StudySet, 'id' | 'name' | 'categories' | 'isPublic' | 'shareSlug'>): Promise<StudySet> {
  const client = requireSupabase();

  const { data: savedSet, error: setError } = await client
    .from('study_sets')
    .upsert(
      {
        id: set.id,
        owner_id: ownerId,
        name: set.name,
        is_public: set.isPublic,
        share_slug: set.shareSlug ?? null,
      },
      { onConflict: 'id' },
    )
    .select('id,owner_id,name,is_public,share_slug,created_at')
    .single<StudySetRow>();

  if (setError) throw setError;

  await client.from('categories').delete().eq('set_id', savedSet.id);

  const categoriesToInsert = set.categories.map((category, index) => ({
    set_id: savedSet.id,
    name: category.name,
    color: category.color,
    sequence_enabled: category.sequenceEnabled ?? false,
    sort_order: index,
  }));

  const { data: savedCategories, error: categoryError } = await client
    .from('categories')
    .insert(categoriesToInsert)
    .select('id,set_id,name,color,sequence_enabled,sort_order')
    .returns<CategoryRow[]>();

  if (categoryError) throw categoryError;

  const termsToInsert = savedCategories.flatMap((savedCategory, categoryIndex) =>
    set.categories[categoryIndex].terms.map((term, termIndex) => ({
      category_id: savedCategory.id,
      term: term.term,
      def: term.def,
      blackout_words: term.blackoutWords?.trim() || null,
      sort_order: termIndex,
    })),
  );

  if (termsToInsert.length) {
    const { error: termError } = await client.from('terms').insert(termsToInsert);
    if (termError) throw termError;
  }

  const [fresh] = await fetchStudySets(ownerId).then((sets) => sets.filter((item) => item.id === savedSet.id));
  return fresh;
}

export async function deleteStudySet(setId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('study_sets').delete().eq('id', setId);
  if (error) throw error;
}

export async function publishStudySet(setId: string, slug: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('study_sets').update({ is_public: true, share_slug: slug }).eq('id', setId);
  if (error) throw error;
}

export async function updateUsername(userId: string, username: string): Promise<UserProfile> {
  const client = requireSupabase();
  const cleaned = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(cleaned)) {
    throw new Error('Use 3-20 lowercase letters, numbers, or underscores.');
  }

  const { data, error } = await client
    .from('profiles')
    .update({ username: cleaned })
    .eq('id', userId)
    .select('id,email,username,plan,is_admin,streak,last_played_date,days_played')
    .single<ProfileRow>();

  if (error) throw error;
  return mapProfile(data);
}

export async function sendFriendRequest(currentUserId: string, username: string): Promise<void> {
  const client = requireSupabase();
  const cleaned = username.trim().toLowerCase();
  const { data: target, error: profileError } = await client.from('profiles').select('id').eq('username', cleaned).maybeSingle<{ id: string }>();

  if (profileError) throw profileError;
  if (!target) throw new Error('No user found with that username.');
  if (target.id === currentUserId) throw new Error('You cannot add yourself.');

  const { error } = await client.from('friendships').insert({
    requester_id: currentUserId,
    addressee_id: target.id,
    status: 'pending',
  });

  if (error) {
    if (error.code === '23505') throw new Error('Friend request already exists.');
    throw error;
  }
}

export async function updateFriendshipStatus(friendshipId: string, status: 'accepted' | 'blocked'): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('friendships').update({ status, updated_at: new Date().toISOString() }).eq('id', friendshipId);
  if (error) throw error;
}

export async function removeFriendship(friendshipId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}

export async function fetchFriendships(currentUserId: string): Promise<FriendshipView[]> {
  const client = requireSupabase();
  const { data: rows, error } = await client
    .from('friendships')
    .select('id,requester_id,addressee_id,status')
    .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`)
    .returns<Array<{ id: string; requester_id: string; addressee_id: string; status: 'pending' | 'accepted' | 'blocked' }>>();

  if (error) throw error;
  if (!rows.length) return [];

  const friendIds = rows.map((row) => (row.requester_id === currentUserId ? row.addressee_id : row.requester_id));
  const { data: profiles, error: profileError } = await client.from('profiles').select('id,email,username').in('id', friendIds).returns<FriendProfile[]>();

  if (profileError) throw profileError;

  return rows.map((row) => {
    const friendId = row.requester_id === currentUserId ? row.addressee_id : row.requester_id;
    return {
      id: row.id,
      status: row.status,
      direction: row.requester_id === currentUserId ? 'outgoing' : 'incoming',
      friend: profiles.find((profile) => profile.id === friendId) ?? { id: friendId, username: null, email: 'Unknown user' },
    };
  });
}

export async function fetchFriendLeaderboard(currentUserId: string, date: string): Promise<FriendLeaderboardEntry[]> {
  const client = requireSupabase();
  const friendships = await fetchFriendships(currentUserId);
  const userIds = [currentUserId, ...friendships.filter((friendship) => friendship.status === 'accepted').map((friendship) => friendship.friend.id)];
  const { data: profiles, error: profileError } = await client.from('profiles').select('id,email,username').in('id', userIds).returns<FriendProfile[]>();

  if (profileError) throw profileError;

  const { data: records, error: recordError } = await client
    .from('daily_records')
    .select('user_id,total_score,connections_score,reveal_score,blackout_score,arrange_score,connections_completed,reveal_completed,blackout_completed,arrange_completed')
    .eq('played_date', date)
    .in('user_id', userIds)
    .returns<Array<{ user_id: string; total_score: number; connections_score: number; reveal_score: number; blackout_score: number; arrange_score: number; connections_completed: boolean; reveal_completed: boolean; blackout_completed: boolean; arrange_completed: boolean }>>();

  if (recordError) throw recordError;

  return profiles
    .map((profile) => {
      const record = records.find((item) => item.user_id === profile.id);
      return {
        userId: profile.id,
        username: profile.username,
        email: profile.email,
        totalScore: record?.total_score ?? 0,
        connectionsScore: record?.connections_score ?? 0,
        revealScore: record?.reveal_score ?? 0,
        blackoutScore: record?.blackout_score ?? 0,
        arrangeScore: record?.arrange_score ?? 0,
        completed: Boolean(record?.connections_completed && record?.reveal_completed && record?.blackout_completed && record?.arrange_completed),
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);
}

export async function fetchDailyRecord(userId: string, date: string): Promise<DailyRecordView | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('daily_records')
    .select('connections_completed,connections_mistakes,connections_score,reveal_completed,reveal_score,blackout_completed,blackout_score,arrange_completed,arrange_score,total_score')
    .eq('user_id', userId)
    .eq('played_date', date)
    .maybeSingle<{
      connections_completed: boolean;
      connections_mistakes: number;
      connections_score: number;
      reveal_completed: boolean;
      reveal_score: number;
      blackout_completed: boolean;
      blackout_score: number;
      arrange_completed: boolean;
      arrange_score: number;
      total_score: number;
    }>();

  if (error) throw error;
  return data ? {
    connectionsCompleted: data.connections_completed,
    connectionsMistakes: data.connections_mistakes,
    connectionsScore: data.connections_score,
    revealCompleted: data.reveal_completed,
    revealScore: data.reveal_score,
    blackoutCompleted: data.blackout_completed,
    blackoutScore: data.blackout_score,
    arrangeCompleted: data.arrange_completed,
    arrangeScore: data.arrange_score,
    totalScore: data.total_score,
  } : null;
}

export async function saveDailyModeResult(
  userId: string,
  date: string,
  mode: 'connections' | 'reveal' | 'blackout' | 'arrange',
  score: number,
  mistakes: number,
  setId?: string | null,
): Promise<DailyRecordView> {
  const existing = await fetchDailyRecord(userId, date);
  const connectionsScore = mode === 'connections' ? score : existing?.connectionsScore ?? 0;
  const revealScore = mode === 'reveal' ? score : existing?.revealScore ?? 0;
  const blackoutScore = mode === 'blackout' ? score : existing?.blackoutScore ?? 0;
  const arrangeScore = mode === 'arrange' ? score : existing?.arrangeScore ?? 0;
  const payload = {
    id: `${userId}-${date}`,
    user_id: userId,
    played_date: date,
    connections_completed: mode === 'connections' ? true : existing?.connectionsCompleted ?? false,
    connections_mistakes: mode === 'connections' ? mistakes : existing?.connectionsMistakes ?? 0,
    connections_score: connectionsScore,
    reveal_completed: mode === 'reveal' ? true : existing?.revealCompleted ?? false,
    reveal_score: revealScore,
    blackout_completed: mode === 'blackout' ? true : existing?.blackoutCompleted ?? false,
    blackout_score: blackoutScore,
    arrange_completed: mode === 'arrange' ? true : existing?.arrangeCompleted ?? false,
    arrange_score: arrangeScore,
    total_score: connectionsScore + revealScore + blackoutScore + arrangeScore,
    set_id_used: setId ?? null,
  };

  const { data, error } = await requireSupabase()
    .from('daily_records')
    .upsert(payload, { onConflict: 'user_id,played_date' })
    .select('connections_completed,connections_mistakes,connections_score,reveal_completed,reveal_score,blackout_completed,blackout_score,arrange_completed,arrange_score,total_score')
    .single<{
      connections_completed: boolean;
      connections_mistakes: number;
      connections_score: number;
      reveal_completed: boolean;
      reveal_score: number;
      blackout_completed: boolean;
      blackout_score: number;
      arrange_completed: boolean;
      arrange_score: number;
      total_score: number;
    }>();

  if (error) throw error;
  return {
    connectionsCompleted: data.connections_completed,
    connectionsMistakes: data.connections_mistakes,
    connectionsScore: data.connections_score,
    revealCompleted: data.reveal_completed,
    revealScore: data.reveal_score,
    blackoutCompleted: data.blackout_completed,
    blackoutScore: data.blackout_score,
    arrangeCompleted: data.arrange_completed,
    arrangeScore: data.arrange_score,
    totalScore: data.total_score,
  };
}

export async function fetchWeeklySnapshot(userId: string, weekStart: string, weekEnd: string): Promise<WeeklySnapshot> {
  const client = requireSupabase();
  const { data: records, error: recordsError } = await client
    .from('daily_records')
    .select('played_date,connections_completed,reveal_completed,blackout_completed,arrange_completed')
    .eq('user_id', userId)
    .gte('played_date', weekStart)
    .lte('played_date', weekEnd)
    .returns<Array<{ played_date: string; connections_completed: boolean; reveal_completed: boolean; blackout_completed: boolean; arrange_completed: boolean }>>();

  if (recordsError) throw recordsError;

  const { data: attempts, error: attemptsError } = await client
    .from('term_attempts')
    .select('term,category_name,correct,created_at')
    .eq('user_id', userId)
    .gte('created_at', `${weekStart}T00:00:00`)
    .lte('created_at', `${weekEnd}T23:59:59`)
    .returns<Array<{ term: string; category_name: string; correct: boolean; created_at: string }>>();

  if (attemptsError) throw attemptsError;

  const playedDates = new Set(
    records
      .filter((record) => record.connections_completed || record.reveal_completed || record.blackout_completed || record.arrange_completed)
      .map((record) => record.played_date),
  );
  const strengthenedTerms = new Set(
    attempts
      .filter((attempt) => attempt.correct)
      .map((attempt) => `${attempt.category_name.toLowerCase()}::${attempt.term.toLowerCase()}`),
  );

  const byCategory = new Map<string, CategoryAnalyticsItem>();
  for (const attempt of attempts) {
    const key = attempt.category_name.toLowerCase();
    const category = byCategory.get(key) ?? {
      categoryName: attempt.category_name,
      attempts: 0,
      correct: 0,
      missed: 0,
      accuracy: 0,
    };
    category.attempts += 1;
    category.correct += attempt.correct ? 1 : 0;
    category.missed += attempt.correct ? 0 : 1;
    category.accuracy = Math.round((category.correct / category.attempts) * 100);
    byCategory.set(key, category);
  }

  const categoryStats = [...byCategory.values()].filter((category) => category.attempts > 0);
  const byBest = (a: CategoryAnalyticsItem, b: CategoryAnalyticsItem) =>
    b.accuracy - a.accuracy || b.correct - a.correct || b.attempts - a.attempts;
  const byWorst = (a: CategoryAnalyticsItem, b: CategoryAnalyticsItem) =>
    a.accuracy - b.accuracy || b.missed - a.missed || b.attempts - a.attempts;

  return {
    weekStart,
    weekEnd,
    daysPlayed: playedDates.size,
    termsStrengthened: strengthenedTerms.size,
    bestCategory: categoryStats.length ? [...categoryStats].sort(byBest)[0] : null,
    worstCategory: categoryStats.length ? [...categoryStats].sort(byWorst)[0] : null,
  };
}

export async function fetchAdminUsers(search: string): Promise<AdminUserRow[]> {
  const client = requireSupabase();
  let query = client
    .from('profiles')
    .select('id,email,username,plan,is_admin,streak,days_played,created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const cleaned = search.trim();
  if (cleaned) {
    const term = cleaned.replace(/[%_]/g, '\\$&');
    query = query.or(`email.ilike.%${term}%,username.ilike.%${term}%`);
  }

  const { data, error } = await query.returns<Array<{
    id: string;
    email: string;
    username: string | null;
    plan: 'free' | 'paid';
    is_admin: boolean;
    streak: number;
    days_played: number;
    created_at: string;
  }>>();

  if (error) throw error;

  const userIds = data.map((row) => row.id);
  const counters = new Map<string, { streak: number; daysPlayed: number }>();
  if (userIds.length) {
    const { data: records, error: recordsError } = await client
      .from('daily_records')
      .select('user_id,played_date,connections_completed,reveal_completed,blackout_completed,arrange_completed')
      .in('user_id', userIds)
      .returns<Array<{ user_id: string; played_date: string; connections_completed: boolean; reveal_completed: boolean; blackout_completed: boolean; arrange_completed: boolean }>>();

    if (recordsError) throw recordsError;
    const datesByUser = new Map<string, Set<string>>();
    for (const record of records) {
      if (!record.connections_completed && !record.reveal_completed && !record.blackout_completed && !record.arrange_completed) continue;
      const dates = datesByUser.get(record.user_id) ?? new Set<string>();
      dates.add(record.played_date);
      datesByUser.set(record.user_id, dates);
    }
    for (const [userId, dates] of datesByUser) {
      counters.set(userId, { daysPlayed: dates.size, streak: calculateStreak([...dates]) });
    }
  }

  return data.map((row) => ({
    id: row.id,
    email: row.email,
    username: row.username,
    plan: row.plan,
    isAdmin: row.is_admin,
    streak: counters.get(row.id)?.streak ?? row.streak,
    daysPlayed: counters.get(row.id)?.daysPlayed ?? row.days_played,
    createdAt: row.created_at,
  }));
}

export async function updateUserPlan(userId: string, plan: 'free' | 'paid'): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('profiles').update({ plan }).eq('id', userId);
  if (error) throw error;
}

export async function queueAdminNotification(title: string, body: string, target = 'all', url = '/'): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('notifications_queue').insert({
    target,
    title: title.trim(),
    body: body.trim(),
    url: url.trim() || '/',
  });
  if (error) throw new Error(error.message);
}

export async function sendQueuedNotificationsNow(): Promise<NotificationDispatchResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) throw new Error('Supabase URL is not configured.');

  const response = await fetch(`${supabaseUrl}/functions/v1/engramble-push-notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Notification function failed with ${response.status}.`);
  }

  try {
    return JSON.parse(text) as NotificationDispatchResult;
  } catch {
    throw new Error('Notification function returned an invalid response.');
  }
}

export async function recordTermAttempts(userId: string, attempts: TermAttemptInput[]): Promise<void> {
  if (!attempts.length) return;
  const client = requireSupabase();
  const { error } = await client.from('term_attempts').insert(
    attempts.map((attempt) => ({
      user_id: userId,
      set_id: attempt.setId ?? null,
      category_name: attempt.categoryName,
      term: attempt.term,
      game_mode: attempt.gameMode,
      correct: attempt.correct,
    })),
  );
  if (error) throw error;
}

export async function fetchSetAccuracy(userId: string): Promise<SetAccuracyItem[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('term_attempts')
    .select('set_id,correct')
    .eq('user_id', userId)
    .not('set_id', 'is', null)
    .limit(1000)
    .returns<Array<{ set_id: string | null; correct: boolean }>>();

  if (error) throw error;

  const bySet = new Map<string, SetAccuracyItem>();
  for (const row of data) {
    if (!row.set_id) continue;
    const item = bySet.get(row.set_id) ?? { setId: row.set_id, attempts: 0, correct: 0, missed: 0, accuracy: 0 };
    item.attempts += 1;
    item.correct += row.correct ? 1 : 0;
    item.missed += row.correct ? 0 : 1;
    item.accuracy = Math.round((item.correct / item.attempts) * 100);
    bySet.set(row.set_id, item);
  }

  return [...bySet.values()].sort((a, b) => a.accuracy - b.accuracy || b.missed - a.missed || b.attempts - a.attempts);
}

export async function fetchPerformanceAnalytics(userId: string, fromDate?: string, toDate?: string): Promise<PerformanceAnalytics> {
  const client = requireSupabase();
  let query = client
    .from('term_attempts')
    .select('term,category_name,game_mode,correct,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (fromDate) query = query.gte('created_at', fromDate);
  if (toDate) query = query.lt('created_at', toDate);

  const { data, error } = await query.returns<TermAttemptRow[]>();

  if (error) throw error;
  return buildPerformanceAnalytics(data);
}

export async function resetPerformanceAnalytics(userId: string, fromDate?: string, toDate?: string): Promise<void> {
  const client = requireSupabase();
  let query = client.from('term_attempts').delete().eq('user_id', userId);
  if (fromDate) query = query.gte('created_at', fromDate);
  if (toDate) query = query.lt('created_at', toDate);
  const { error } = await query;
  if (error) throw error;
}

function buildPerformanceAnalytics(rows: TermAttemptRow[]): PerformanceAnalytics {
  const totalAttempts = rows.length;
  const correctAttempts = rows.filter((row) => row.correct).length;
  const byTerm = new Map<string, TermAnalyticsItem>();
  const byCategory = new Map<string, CategoryAnalyticsItem>();
  const byDay = new Map<string, { date: string; attempts: number; correct: number }>();

  for (const row of rows) {
    const termKey = `${row.category_name.toLowerCase()}::${row.term.toLowerCase()}`;
    const term = byTerm.get(termKey) ?? {
      term: row.term,
      categoryName: row.category_name,
      attempts: 0,
      correct: 0,
      missed: 0,
      accuracy: 0,
    };
    term.attempts += 1;
    term.correct += row.correct ? 1 : 0;
    term.missed += row.correct ? 0 : 1;
    term.accuracy = Math.round((term.correct / term.attempts) * 100);
    byTerm.set(termKey, term);

    const categoryKey = row.category_name.toLowerCase();
    const category = byCategory.get(categoryKey) ?? {
      categoryName: row.category_name,
      attempts: 0,
      correct: 0,
      missed: 0,
      accuracy: 0,
    };
    category.attempts += 1;
    category.correct += row.correct ? 1 : 0;
    category.missed += row.correct ? 0 : 1;
    category.accuracy = Math.round((category.correct / category.attempts) * 100);
    byCategory.set(categoryKey, category);

    const date = row.created_at.slice(0, 10);
    const day = byDay.get(date) ?? { date, attempts: 0, correct: 0 };
    day.attempts += 1;
    day.correct += row.correct ? 1 : 0;
    byDay.set(date, day);
  }

  const byWeakness = <T extends { attempts: number; missed: number; accuracy: number }>(a: T, b: T) =>
    b.missed - a.missed || a.accuracy - b.accuracy || b.attempts - a.attempts;

  return {
    totalAttempts,
    correctAttempts,
    accuracy: totalAttempts ? Math.round((correctAttempts / totalAttempts) * 100) : 0,
    weakestTerms: [...byTerm.values()].filter((item) => item.missed > 0).sort(byWeakness).slice(0, 5),
    weakestCategories: [...byCategory.values()].filter((item) => item.missed > 0).sort(byWeakness).slice(0, 4),
    recentTrend: [...byDay.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7)
      .map((day) => ({ date: day.date, attempts: day.attempts, accuracy: Math.round((day.correct / day.attempts) * 100) })),
  };
}

function mapProfile(row: ProfileRow): UserProfile {
  return {
    uid: row.id,
    email: row.email,
    username: row.username ?? undefined,
    plan: row.plan ?? 'free',
    isAdmin: row.is_admin ?? false,
    streak: row.streak,
    lastPlayedDate: row.last_played_date,
    daysPlayed: row.days_played,
  };
}

function calculateStreak(dates: string[]): number {
  const played = new Set(dates);
  const cursor = new Date();
  let streak = 0;

  while (played.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

