import { Injectable, computed, signal } from '@angular/core';
import {
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
  createClient,
} from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import type { Profile, UserRole } from '../interfaces/database.types';

export interface AuthResult {
  session: Session | null;
  errorMessage: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

@Injectable({
  providedIn: 'root',
})
export class Api {
  readonly session = signal<Session | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly userRole = computed<UserRole | null>(() => this.profile()?.role ?? null);
  /** Platform administrator only (not CSM). */
  readonly isAdmin = computed(() => this.userRole() === 'admin');
  readonly isCsm = computed(() => this.userRole() === 'csm');
  readonly isManager = computed(() => this.userRole() === 'manager');
  /**
   * Admin or CSM: see all projects (archived, restricted titles), org-wide manager dashboard stats.
   * Does not grant user management, IT admin queue, or finance admin inbox.
   */
  readonly hasProjectOversight = computed(() => this.isAdmin() || this.isCsm());
  readonly isUser = computed(() => this.userRole() === 'user');
  readonly isItManager = computed(() => this.userRole() === 'it_manager');
  readonly isFinance = computed(() => this.userRole() === 'finance');
  /** Create new project records (admin or manager only; CSM uses existing projects). */
  readonly canCreateProject = computed(() => this.isAdmin() || this.isManager());
  readonly initialized = signal(false);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly supabase: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
  );
  private initializationPromise?: Promise<void>;

  constructor() {
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.syncSession(session);
      if (session?.user) {
        void this.loadProfile(session.user.id);
      } else {
        this.profile.set(null);
      }
      this.initialized.set(true);
    });

    void this.initialize();
  }

  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.getSession()
      .then(async (session) => {
        if (session?.user) {
          await this.loadProfile(session.user.id);
        }
      })
      .finally(() => this.initialized.set(true));

    return this.initializationPromise;
  }

  async loadProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error loading profile:', error);
      return null;
    }

    this.profile.set(data as Profile);
    return data as Profile;
  }

  async signInWithPassword(credentials: LoginCredentials): Promise<AuthResult> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { data, error } = await this.supabase.auth.signInWithPassword(credentials);

    this.isLoading.set(false);

    if (error) {
      this.errorMessage.set(error.message);
      return { session: null, errorMessage: error.message };
    }

    this.syncSession(data.session);
    if (data.session?.user) {
      await this.loadProfile(data.session.user.id);
    }

    return { session: data.session, errorMessage: null };
  }

  async signOut(): Promise<string | null> {
    this.isLoading.set(true);

    const { error } = await this.supabase.auth.signOut();

    this.isLoading.set(false);

    if (error) {
      this.errorMessage.set(error.message);
      return error.message;
    }

    this.syncSession(null);
    this.profile.set(null);
    return null;
  }

  async getSession(): Promise<Session | null> {
    const { data, error } = await this.supabase.auth.getSession();

    if (error) {
      this.errorMessage.set(error.message);
      return null;
    }

    this.syncSession(data.session);
    return data.session;
  }

  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return this.supabase.auth.onAuthStateChange(callback);
  }

  private syncSession(session: Session | null): void {
    this.session.set(session);
    this.errorMessage.set(null);
  }
}
