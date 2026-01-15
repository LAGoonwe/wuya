
import { supabase } from '../lib/supabase';
import { Post, Comment } from '../types';

// Simple in-memory cache
let postsCache: { data: Post[], timestamp: number } | null = null;
const commentsCache = new Map<string, { data: Comment[], timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const socialService = {
    async getPosts(page = 0, pageSize = 10, forceRefresh = false): Promise<Post[]> {
        // Check cache for first page
        if (page === 0 && !forceRefresh && postsCache && (Date.now() - postsCache.timestamp < CACHE_TTL)) {
            return postsCache.data;
        }

        const from = page * pageSize;
        const to = from + pageSize - 1;

        // Join with profiles to get author info
        const { data, error } = await supabase
            .from('posts')
            .select(`
        *,
        profiles:user_id (name, avatar),
        comments (count),
        likes (count),
        my_like:likes(user_id),
        my_bookmark:bookmarks(user_id)
      `)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) {
            console.error('Error fetching posts:', error);
            return [];
        }

        const { data: { user } } = await supabase.auth.getUser();
        const currentUserId = user?.id;

        // Apply filters to the query if we have currentUserId
        // Note: Ideally we would chain this to the query above, but for now we filter in JS 
        // because Supabase doesn't allow cross-join filtering in a single fluent select string easily 
        // without affecting top-level rows unless using RPC.
        // However, fetching ONLY our own like is much cheaper than fetching all.

        // Wait, if I use my_like:likes(user_id) without a top-level .eq('my_like.user_id', ...), 
        // it still fetches all likes. I must use a filter.

        const posts = data.map((p: any) => ({
            id: p.id,
            userId: p.user_id,
            author: {
                name: p.profiles?.name || 'Unknown',
                avatar: p.profiles?.avatar || ''
            },
            content: p.content,
            images: p.images || [],
            likes: p.likes[0]?.count || 0,
            comments: p.comments[0]?.count || 0,
            isLiked: currentUserId ? p.my_like?.some((l: any) => l.user_id === currentUserId) : false,
            isBookmarked: currentUserId ? p.my_bookmark?.some((b: any) => b.user_id === currentUserId) : false,
            time: new Date(p.created_at).toLocaleString(),
            tags: p.tags || []
        }));

        // Update cache only for first page
        if (page === 0) {
            postsCache = { data: posts, timestamp: Date.now() };
        }
        return posts;
    },

    getCacheInfo() {
        return postsCache;
    },

    async getPostById(postId: string): Promise<Post | null> {
        const { data: { user } } = await supabase.auth.getUser();
        const currentUserId = user?.id;

        const { data, error } = await supabase
            .from('posts')
            .select(`
                *,
                profiles:user_id (name, avatar),
                comments (count),
                likes (user_id),
                bookmarks (user_id)
            `)
            .eq('id', postId)
            .single();

        if (error || !data) return null;

        return {
            id: data.id,
            userId: data.user_id,
            author: {
                name: data.profiles?.name || 'Unknown',
                avatar: data.profiles?.avatar || ''
            },
            content: data.content,
            images: data.images || [],
            likes: data.likes[0]?.count || 0,
            comments: data.comments[0]?.count || 0,
            isLiked: currentUserId ? data.my_like?.some((l: any) => l.user_id === currentUserId) : false,
            isBookmarked: currentUserId ? data.my_bookmark?.some((b: any) => b.user_id === currentUserId) : false,
            time: new Date(data.created_at).toLocaleString(),
            tags: data.tags || []
        };
    },

    async getComments(postId: string, forceRefresh = false): Promise<Comment[]> {
        if (!forceRefresh) {
            const cached = commentsCache.get(postId);
            if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
                return cached.data;
            }
        }

        const { data, error } = await supabase
            .from('comments')
            .select(`
                id,
                content,
                created_at,
                profiles:user_id (name, avatar)
            `)
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching comments:', error);
            return [];
        }

        const comments = data.map((c: any) => {
            // Handle profiles being returned as array or object depending on TS inference or Supabase response
            const profile = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
            return {
                id: c.id,
                author: profile?.name || 'Unknown',
                avatar: profile?.avatar || '',
                content: c.content,
                time: new Date(c.created_at).toLocaleString()
            };
        });

        commentsCache.set(postId, { data: comments, timestamp: Date.now() });
        return comments;
    },



    async createComment(userId: string, postId: string, content: string) {
        const { data, error } = await supabase
            .from('comments')
            .insert({
                post_id: postId,
                user_id: userId,
                content
            })
            .select(`
                id,
                content,
                created_at,
                profiles:user_id (name, avatar)
            `)
            .single();

        if (error) throw error;

        // Check if data.profiles is array or object
        const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;

        const newComment = {
            id: data.id,
            author: profile?.name || 'Unknown',
            avatar: profile?.avatar || '',
            content: data.content,
            time: new Date(data.created_at).toLocaleString()
        };

        // Update posts cache comment count
        if (postsCache) {
            postsCache.data = postsCache.data.map(p =>
                p.id === postId ? { ...p, comments: p.comments + 1 } : p
            );
        }

        // Invalidate or update comments cache
        const cachedComments = commentsCache.get(postId);
        if (cachedComments) {
            commentsCache.set(postId, {
                data: [...cachedComments.data, newComment],
                timestamp: Date.now()
            });
        }

        return newComment;
    },

    async createPost(userId: string, content: string, images: string[] = [], tags: string[] = []) {
        const { data, error } = await supabase
            .from('posts')
            .insert({
                user_id: userId,
                content,
                images,
                tags
            })
            .select()
            .single();

        if (error) throw error;

        // Invalidate cache to force refresh on next load or manually prepend if we knew the full object structure without refetch.
        // For simplicity, invalidate.
        postsCache = null;

        return data;
    },

    async deletePost(postId: string) {
        const { error } = await supabase
            .from('posts')
            .delete()
            .eq('id', postId);

        if (error) throw error;

        // Update cache
        if (postsCache) {
            postsCache.data = postsCache.data.filter(p => p.id !== postId);
        }
    },

    async updatePost(postId: string, updates: { content?: string, images?: string[], tags?: string[] }) {
        const { data, error } = await supabase
            .from('posts')
            .update(updates)
            .eq('id', postId)
            .select()
            .single();

        if (error) throw error;

        // Invalidate cache
        postsCache = null;

        return data;
    },

    async toggleLike(postId: string, userId: string) {
        // Optimistic cache update
        if (postsCache) {
            postsCache.data = postsCache.data.map(p => {
                if (p.id === postId) {
                    const newLiked = !p.isLiked;
                    return {
                        ...p,
                        isLiked: newLiked,
                        likes: newLiked ? p.likes + 1 : Math.max(0, p.likes - 1)
                    };
                }
                return p;
            });
        }

        // Check if liked
        const { data: existing } = await supabase
            .from('likes')
            .select('post_id')
            .eq('post_id', postId)
            .eq('user_id', userId)
            .single();

        if (existing) {
            await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', userId);
            return false; // unliked
        } else {
            await supabase.from('likes').insert({ post_id: postId, user_id: userId });
            return true; // liked
        }
    },

    async toggleBookmark(postId: string, userId: string) {
        // Optimistic cache update
        if (postsCache) {
            postsCache.data = postsCache.data.map(p => {
                if (p.id === postId) {
                    return { ...p, isBookmarked: !p.isBookmarked };
                }
                return p;
            });
        }

        const { data: existing } = await supabase
            .from('bookmarks')
            .select('id')
            .eq('post_id', postId)
            .eq('user_id', userId)
            .single();

        if (existing) {
            await supabase.from('bookmarks').delete().eq('post_id', postId).eq('user_id', userId);
            return false;
        } else {
            await supabase.from('bookmarks').insert({ post_id: postId, user_id: userId });
            return true;
        }
    },

    async getBookmarkedPosts(userId: string): Promise<Post[]> {
        const { data, error } = await supabase
            .from('bookmarks')
            .select(`
                post:posts (
                    *,
                    profiles:user_id (name, avatar),
                    comments (count),
                    likes (count),
                    my_like:likes(user_id)
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) return [];

        // Map the nested post structure back to flat Post type
        return data.map((item: any) => {
            const p = item.post;
            if (!p) return null;
            return {
                id: p.id,
                userId: p.user_id,
                author: {
                    name: p.profiles?.name || 'Unknown',
                    avatar: p.profiles?.avatar || ''
                },
                content: p.content,
                images: p.images || [],
                likes: p.likes[0]?.count || 0,
                comments: p.comments[0]?.count || 0,
                isLiked: userId ? p.my_like?.some((l: any) => l.user_id === userId) : false,
                isBookmarked: true,
                time: new Date(p.created_at).toLocaleString(),
                tags: p.tags || []
            };
        }).filter(Boolean) as Post[];
    },

    async getUserPosts(userId: string): Promise<Post[]> {
        const { data, error } = await supabase
            .from('posts')
            .select(`
                *,
                profiles:user_id (name, avatar),
                comments (count),
                likes (user_id),
                bookmarks (user_id)
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching user posts:', error);
            return [];
        }

        return data.map((p: any) => ({
            id: p.id,
            userId: p.user_id,
            author: {
                name: p.profiles?.name || 'Unknown',
                avatar: p.profiles?.avatar || ''
            },
            content: p.content,
            images: p.images || [],
            likes: p.likes[0]?.count || 0,
            comments: p.comments[0]?.count || 0,
            isLiked: userId ? p.my_like?.some((l: any) => l.user_id === userId) : false,
            isBookmarked: userId ? p.my_bookmark?.some((b: any) => b.user_id === userId) : false,
            time: new Date(p.created_at).toLocaleString(),
            tags: p.tags || []
        }));
    },

    async getPostInteractions(postId: string) {
        // Fetch likes with profiles
        const { data: likes } = await supabase
            .from('likes')
            .select(`
                user_id,
                profiles:user_id (name, avatar)
            `)
            .eq('post_id', postId);

        // Fetch comments with profiles
        const { data: comments } = await supabase
            .from('comments')
            .select(`
                id,
                content,
                created_at,
                profiles:user_id (name, avatar)
            `)
            .eq('post_id', postId)
            .order('created_at', { ascending: false });

        // Fetch bookmarks with profiles
        const { data: bookmarks } = await supabase
            .from('bookmarks')
            .select(`
                user_id,
                profiles:user_id (name, avatar)
            `)
            .eq('post_id', postId);

        return {
            likes: likes?.map((l: any) => ({
                id: l.user_id,
                name: l.profiles?.name || 'Unknown',
                avatar: l.profiles?.avatar || ''
            })) || [],
            comments: comments?.map((c: any) => ({
                id: c.id,
                content: c.content,
                time: new Date(c.created_at).toLocaleString(),
                author: {
                    name: c.profiles?.name || 'Unknown',
                    avatar: c.profiles?.avatar || ''
                }
            })) || [],
            bookmarks: bookmarks?.map((b: any) => ({
                id: b.user_id,
                name: b.profiles?.name || 'Unknown',
                avatar: b.profiles?.avatar || ''
            })) || []
        };
    }
};
