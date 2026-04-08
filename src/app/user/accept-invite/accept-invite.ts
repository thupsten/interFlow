import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { DEPARTMENT_OPTIONS } from '../../constants/departments';
import { Api } from '../../services/api';

@Component({
  selector: 'app-accept-invite',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './accept-invite.html',
  styleUrl: './accept-invite.scss',
})
export class AcceptInvite implements OnInit {
  readonly api = inject(Api);
  readonly router = inject(Router);
  readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly success = signal(false);
  readonly submitting = signal(false);

  readonly userEmail = signal<string>('');
  readonly userName = signal<string>('');
  readonly userRole = signal<string>('');
  readonly departmentOptions = DEPARTMENT_OPTIONS;

  form = {
    password: '',
    confirmPassword: '',
    full_name: '',
    department: '',
  };

  async ngOnInit(): Promise<void> {
    try {
      // Check for token in URL (Supabase adds it as hash fragment)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');

      if (type === 'invite' || type === 'recovery' || type === 'signup') {
        if (accessToken && refreshToken) {
          // Set the session
          const { data, error } = await this.api.supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            this.error.set('Invalid or expired invitation link. Please contact your administrator.');
            this.loading.set(false);
            return;
          }

          if (data.user) {
            this.userEmail.set(data.user.email || '');
            this.userName.set(data.user.user_metadata?.['full_name'] || '');
            this.userRole.set(data.user.user_metadata?.['role'] || 'user');
            const metaName = data.user.user_metadata?.['full_name'];
            this.form.full_name = (metaName && metaName !== 'Pending') ? metaName : '';
            this.form.department = data.user.user_metadata?.['department'] || '';
          }
        }
      } else {
        // Check if already logged in
        const { data: { session } } = await this.api.supabase.auth.getSession();
        if (session?.user) {
          // Check if profile is complete
          const { data: profile } = await this.api.supabase
            .from('profiles')
            .select('status')
            .eq('id', session.user.id)
            .single();

          if (profile?.status === 'active') {
            this.router.navigate(['/dashboard']);
            return;
          }

          this.userEmail.set(session.user.email || '');
          this.userName.set(session.user.user_metadata?.['full_name'] || '');
          this.userRole.set(session.user.user_metadata?.['role'] || 'user');
          const metaName = session.user.user_metadata?.['full_name'];
          this.form.full_name = (metaName && metaName !== 'Pending') ? metaName : '';
        } else {
          this.error.set('No invitation found. Please use the link from your invitation email.');
        }
      }
    } catch (err) {
      this.error.set('Something went wrong. Please try again or contact support.');
    } finally {
      this.loading.set(false);
    }
  }

  async completeRegistration(): Promise<void> {
    // Validation
    if (!this.form.password || this.form.password.length < 8) {
      this.error.set('Password must be at least 8 characters');
      return;
    }

    if (this.form.password !== this.form.confirmPassword) {
      this.error.set('Passwords do not match');
      return;
    }

    if (!this.form.full_name.trim()) {
      this.error.set('Full name is required');
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    try {
      // Update password
      const { error: passwordError } = await this.api.supabase.auth.updateUser({
        password: this.form.password,
        data: {
          full_name: this.form.full_name,
          department: this.form.department,
        },
      });

      if (passwordError) {
        this.error.set(passwordError.message);
        return;
      }

      // Get current user
      const { data: { user } } = await this.api.supabase.auth.getUser();

      if (user) {
        // Update profile to active
        const { error: profileError } = await this.api.supabase
          .from('profiles')
          .update({
            full_name: this.form.full_name,
            department: this.form.department || null,
            status: 'active',
          })
          .eq('id', user.id);

        if (profileError) {
          console.error('Profile update error:', profileError);
        }

        // Refresh Api profile cache so authGuard sees status 'active'
        await this.api.loadProfile(user.id);
      }

      this.success.set(true);

      // Redirect to dashboard after short delay
      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 2000);

    } catch (err) {
      this.error.set('Failed to complete registration. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }

  getInitials(): string {
    const name = this.form.full_name?.trim() || this.userEmail();
    if (!name) return '?';
    return name
      .split(/\s+/)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      admin: 'Administrator',
      csm: 'Customer Success',
      manager: 'Project Manager',
      it_manager: 'IT Manager',
      finance: 'Finance',
      user: 'Team Member',
    };
    return labels[role] || 'Team Member';
  }
}
