'use strict';
/* Konfiguration. Publik fil – lägg ALDRIG hemliga nycklar här.
   supabaseUrl och supabaseAnonKey är tomma: appen körs då i demoläge med syntetiska data.
   Anon-nyckeln är avsedd att vara publik; skyddet ligger i databasens RLS (se backend/schema.sql). */
const APP_CONFIG = {
  supabaseUrl: "https://gmzxjjqgsuauztgueesw.supabase.co",          // t.ex. 'https://<projekt>.supabase.co'
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtenhqanFnc3VhdXp0Z3VlZXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NDI4NjQsImV4cCI6MjEwNzMxODg2NH0.dXH752IGM3sYjBrWDVqZfJJV5Hb5OPe8jYnQtuTfZgE",      // anon/publishable key – aldrig service_role
  authRedirectUrl: "https://osho98.github.io/traningsapp/",      // dit den magiska länken leder, t.ex. 'https://osho98.github.io/traningsapp/' (tom = aktuell adress)
  programApprovedStatus: 'Godkänd', // exakt statustext i säsongsprogrammet för godkända rader (sätts vid driftsättning)
  appName: 'Träning'
};
