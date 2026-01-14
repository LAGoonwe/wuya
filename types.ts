
export enum AppStage {
  SPLASH = 'SPLASH',
  CATEGORY_SELECTION = 'CATEGORY_SELECTION',
  MAIN = 'MAIN'
}

export enum MainTab {
  WUYA = 'WUYA',
  SEA = 'SEA',
  FRIENDS = 'FRIENDS',
  PROFILE = 'PROFILE'
}

export enum NotificationType {
  LIKE = 'LIKE',
  COMMENT = 'COMMENT',
  FRIEND_REQUEST = 'FRIEND_REQUEST',
  BOOKMARK = 'BOOKMARK',
  SHARE = 'SHARE',
  STUDY_REMINDER = 'STUDY_REMINDER',
  FRIEND_ACCEPT = 'FRIEND_ACCEPT'
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  sender: {
    id: string; // Add sender ID
    name: string;
    avatar: string;
  };
  content?: string;
  targetContent?: string;
  relatedId?: string; // Add related ID (e.g. post ID)
  time: string;
  createdAt: string; // ISO string for sorting
  isRead: boolean;
  status?: 'pending' | 'accepted' | 'rejected';
}

export interface Category {
  id: string;
  name: string;
  isCustom?: boolean;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  category: string;
  date: string;
  lastEdited: number;
}

export interface Comment {
  id: string;
  author: string;
  avatar: string;
  content: string;
  time: string;
}

export interface Post {
  id: string;
  userId: string; // Add this for ownership checks
  author: {
    name: string;
    avatar: string;
  };
  content: string;
  images?: string[];
  likes: number;
  comments: number;
  commentsList?: Comment[];
  isLiked: boolean;
  isBookmarked?: boolean;
  time: string;
  tags: string[];
}

export interface Friend {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  checkInDays: number; // Total days this month
  hasCheckedInToday: boolean;
  learningTags: string[];
  lastActive: string;
  isReminded: boolean;
  isNew?: boolean;
}

export interface GroupMember {
  id: string;
  name: string;
  avatar: string;
  hasCheckedIn: boolean;
}

export interface StudyGroup {
  id: string;
  name: string;
  avatar: string;
  memberCount: number;
  members: GroupMember[];
}

export interface UserProfileStats {
  studyDays: number;
  notesCount: number;
  followers: number; // Keep for compatibility or map to Friends
  following: number; // Keep for compatibility
  likesReceived: number; // New explicit field
  friendsCount: number; // New explicit field
  bookmarksCount: number; // New explicit field
}

export interface UserProfile {
  id: string;
  uid: string; // Add this unique numeric ID
  name: string;
  bio: string;
  avatar: string;
  stats: UserProfileStats;
  selectedCategories: string[];
}
