import type { StudySet, UserProfile } from '../types';
import { sampleStudySets } from './sampleData';

const SETS_KEY = 'engramble.studySets';
const PROFILE_KEY = 'engramble.profile';

export function loadStudySets(): StudySet[] {
  const saved = window.localStorage.getItem(SETS_KEY);
  if (!saved) return sampleStudySets;

  try {
    return JSON.parse(saved) as StudySet[];
  } catch {
    return sampleStudySets;
  }
}

export function saveStudySets(sets: StudySet[]): void {
  window.localStorage.setItem(SETS_KEY, JSON.stringify(sets));
}

export function loadProfile(): UserProfile {
  const saved = window.localStorage.getItem(PROFILE_KEY);
  if (saved) {
    try {
      const profile = JSON.parse(saved) as UserProfile;
      return {
        ...profile,
        plan: profile.plan ?? 'free',
        isAdmin: profile.isAdmin ?? false,
      };
    } catch {
      // Fall through to the default profile.
    }
  }

  return {
    uid: 'local-user',
    email: '',
    username: 'local',
    plan: 'free',
    isAdmin: false,
    streak: 3,
    lastPlayedDate: null,
    daysPlayed: 0,
  };
}

export function saveProfile(profile: UserProfile): void {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
