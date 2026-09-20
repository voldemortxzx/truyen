// The Supabase "anon" key is designed to be public (unlike a service key) — access control
// is enforced by Postgres Row Level Security policies configured in the Supabase dashboard,
// not by hiding this key. This page intentionally has no auth: every visitor shares the
// same data, by explicit user choice.
export const SUPABASE_URL = 'https://ganrzfgrogkgdrbxxmar.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhbnJ6Zmdyb2drZ2RyYnh4bWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4NjgzNzksImV4cCI6MjEwNTQ0NDM3OX0.n4r3JlPR9iH9d8s6cPfbYW117WJhrx1hvZuaB7To5LM';

export const NOTES_TABLE = 'truyen';
export const NOTES_BUCKET = 'truen';
