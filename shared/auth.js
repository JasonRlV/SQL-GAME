const AppAuth = (() => {
    let client;

    function getClient() {
        if (client) return client;
        if (!window.supabase || !window.supabase.createClient) {
            throw new Error('Supabase could not load. Check your internet connection and reload.');
        }
        if (CONFIG.SUPABASE_URL.includes('YOUR_PROJECT_REF') ||
            CONFIG.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_')) {
            throw new Error('Add your Supabase project URL and publishable key in shared/config.js.');
        }

        client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
            },
        });
        return client;
    }

    return Object.freeze({
        getSession() {
            return getClient().auth.getSession();
        },
        signInWithPassword(credentials) {
            return getClient().auth.signInWithPassword(credentials);
        },
        signUp({ username, email, password }) {
            return getClient().auth.signUp({
                email,
                password,
                options: {
                    data: { username },
                    emailRedirectTo: `${window.location.origin}/login/index.html`,
                },
            });
        },
        signInWithGoogle() {
            return getClient().auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/dashboard/dashboard.html`,
                },
            });
        },
        signOut() {
            return getClient().auth.signOut();
        },
    });
})();
