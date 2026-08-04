export interface Term {
  term: string;
  def: string;
  blackoutWords?: string;
}

export interface Category {
  id?: string;
  name: string;
  color: string;
  terms: Term[];
  sequenceEnabled?: boolean;
}

export interface StudySet {
  id: string;
  ownerId: string;
  name: string;
  categories: Category[];
  createdAt: string;
  isPublic: boolean;
  shareSlug?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  username?: string;
  plan: 'free' | 'paid';
  isAdmin: boolean;
  streak: number;
  lastPlayedDate: string | null;
  daysPlayed: number;
}

export interface DailyRecord {
  userId: string;
  date: string;
  connectionsCompleted: boolean;
  connectionsMistakes: number;
  connectionsScore: number;
  revealCompleted: boolean;
  revealScore: number;
  blackoutCompleted?: boolean;
  blackoutScore?: number;
  arrangeCompleted?: boolean;
  arrangeScore?: number;
  totalScore: number;
  setIdUsed: string;
}
