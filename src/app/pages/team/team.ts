import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { DEPARTMENT_OPTIONS } from '../../constants/departments';
import { Api } from '../../services/api';
import { UserService } from '../../services/user.service';
import { SnackbarService } from '../../services/snackbar.service';
import { environment } from '../../../environments/environment';
import type { Profile, UserRole } from '../../interfaces/database.types';

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './team.html',
  styleUrl: './team.scss',
})
export class Team implements OnInit {
  readonly api = inject(Api);
  readonly userService = inject(UserService);
  readonly snackbar = inject(SnackbarService);

  readonly loading = signal(true);
  readonly users = signal<Profile[]>([]);
  readonly searchQuery = signal('');
  readonly selectedRole = signal<string>('all');

  readonly showInviteModal = signal(false);
  readonly inviting = signal(false);
  readonly inviteError = signal<string | null>(null);
  readonly inviteSuccess = signal(false);

  inviteForm = {
    email: '',
    role: 'user' as UserRole,
    department: '',
  };

  readonly departmentOptions = DEPARTMENT_OPTIONS;

  readonly filteredUsers = computed(() => {
    let result = this.users();
    const query = this.searchQuery().toLowerCase();
    const role = this.selectedRole();

    if (query) {
      result = result.filter(
        (u) => u.full_name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)
      );
    }
    if (role !== 'all') {
      result = result.filter((u) => u.role === role);
    }
    return result;
  });

  async ngOnInit(): Promise<void> {
    await this.loadUsers();
  }

  async loadUsers(): Promise<void> {
    this.loading.set(true);
    try {
      const users = await this.userService.getUsers();
      this.users.set(users);
    } finally {
      this.loading.set(false);
    }
  }

  openInviteModal(): void {
    this.inviteForm = { email: '', role: 'user' as UserRole, department: '' };
    this.inviteError.set(null);
    this.inviteSuccess.set(false);
    this.showInviteModal.set(true);
  }

  closeInviteModal(): void {
    this.showInviteModal.set(false);
  }

  async inviteUser(): Promise<void> {
    if (!this.inviteForm.email?.trim()) {
      this.inviteError.set('Email is required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.inviteForm.email)) {
      this.inviteError.set('Please enter a valid email address');
      return;
    }

    this.inviting.set(true);
    this.inviteError.set(null);

    try {
      const appUrl = (environment as { appUrl?: string }).appUrl ?? window.location.origin;
      const { data, error } = await this.api.supabase.functions.invoke('invite-user', {
        body: {
          email: this.inviteForm.email.trim(),
          role: this.inviteForm.role,
          department: this.inviteForm.department || undefined,
          appUrl,
        },
      });

      if (error) {
        let msg = 'Failed to send invitation';
        if (error instanceof FunctionsHttpError && error.context) {
          try {
            const body = await error.context.json();
            if (body?.error) msg = body.error;
          } catch {
            msg = error.message;
          }
        } else if (error instanceof Error) {
          msg = error.message;
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      this.inviteSuccess.set(true);
      await this.loadUsers();

      setTimeout(() => {
        this.closeInviteModal();
      }, 2000);
    } catch (err) {
      this.inviteError.set(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      this.inviting.set(false);
    }
  }

  getRoleLabel(role: string): string {
    const map: Record<string, string> = {
      admin: 'Admin',
      csm: 'CSM',
      manager: 'Manager',
      it_manager: 'IT Manager',
      finance: 'Finance',
      user: 'Employee',
    };
    return map[role] || role;
  }

  getRoleBadgeClass(role: string): string {
    const map: Record<string, string> = {
      admin: 'danger',
      csm: 'danger',
      manager: 'primary',
      it_manager: 'info',
      finance: 'success',
      user: 'secondary',
    };
    return map[role] || 'secondary';
  }

  getStatusBadgeClass(status: string): string {
    const map: Record<string, string> = {
      active: 'success',
      invited: 'warning',
      deactivated: 'danger',
    };
    return map[status] || 'secondary';
  }
}
