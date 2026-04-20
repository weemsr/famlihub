"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMsg(error.message);
        return;
      }
      // If the Supabase project requires email confirmation, no session is
      // returned and the user must verify before signing in. Otherwise the
      // onAuthStateChange listener above picks up the new session.
      if (!data.session) {
        setMsg('Account created. Check your email to confirm, then sign in.');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
    }
  };

  if (loading) return <div className="container" style={{paddingTop: 100, textAlign: 'center'}}>Loading Family Hub... ✨</div>;

  if (!session) {
    return (
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handleAuth} className="card" style={{ width: '100%', maxWidth: 400, marginTop: '20vh' }}>
          <h1 style={{textAlign: 'center'}}>Family Hub 🏠</h1>
          <p className="text-sm mb-4" style={{textAlign: 'center'}}>Sign in to access your shared lists.</p>
          
          {msg && <div style={{ color: 'var(--accent-color)', marginBottom: 16 }}>{msg}</div>}
          
          <input 
            type="email" 
            placeholder="Email" 
            className="input mb-4" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            required 
          />
          <input 
            type="password" 
            placeholder="Password" 
            className="input mb-4" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
          />
          
          <button type="submit" className="btn mb-4">
            {isSignUp ? 'Sign Up' : 'Sign In'}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => { setIsSignUp(!isSignUp); setMsg(''); }}
          >
            {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
