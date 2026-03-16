import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Api } from '../../services/api';
import { UserService } from '../../services/user.service';
import { SnackbarService } from '../../services/snackbar.service';
import { environment } from '../../../environments/environment';
import { DEPARTMENT_OPTIONS } from '../../constants/departments';
import type { Profile, UserRole } from '../../interfaces/database.types';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './user-management.html',
  styleUrl: './user-management.scss',
})
export class UserManagement implements OnInit {
  readonly api = inject(Api);
  readonly userService = inject(UserService);
  readonly snackbar = inject(SnackbarService);
  
  readonly Math = Math;

  readonly loading = signal(true);
  readonly users = signal<Profile[]>([]);
  readonly pendingInvites = signal<Profile[]>([]);
  readonly searchQuery = signal('');
  readonly selectedRole = signal<string>('all');

  // Pagination
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);
  readonly pageSizeOptions = [5, 10, 25, 50];

  // Invite Modal
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

  // Edit Modal
  readonly showEditModal = signal(false);
  readonly editingUser = signal<Profile | null>(null);
  readonly saving = signal(false);

  editForm = {
    full_name: '',
    role: 'user' as UserRole,
    department: '',
    status: 'active' as 'invited' | 'active' | 'deactivated',
  };

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

  readonly totalPages = computed(() => {
    return Math.ceil(this.filteredUsers().length / this.pageSize());
  });

  readonly paginatedUsers = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    const end = start + this.pageSize();
    return this.filteredUsers().slice(start, end);
  });

  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: (number | string)[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) pages.push('...');
      for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
        pages.push(i);
      }
      if (current < total - 2) pages.push('...');
      pages.push(total);
    }
    return pages;
  });

  goToPage(page: number | string): void {
    if (typeof page === 'number' && page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update((p) => p + 1);
    }
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update((p) => p - 1);
    }
  }

  changePageSize(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  onSearchChange(): void {
    this.currentPage.set(1);
  }

  onRoleFilterChange(): void {
    this.currentPage.set(1);
  }

  async ngOnInit(): Promise<void> {
    await this.loadUsers();
  }

  async loadUsers(): Promise<void> {
    this.loading.set(true);
    try {
      const [users, pending] = await Promise.all([
        this.userService.getUsers(),
        this.userService.getPendingInvites(),
      ]);
      this.users.set(users);
      this.pendingInvites.set(pending);
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
      // Always use production URL for invite links (Edge Function will also enforce this)
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

  openEditModal(user: Profile): void {
    this.editingUser.set(user);
    this.editForm = {
      full_name: user.full_name,
      role: user.role,
      department: user.department || '',
      status: user.status,
    };
    this.showEditModal.set(true);
  }

  closeEditModal(): void {
    this.showEditModal.set(false);
    this.editingUser.set(null);
  }

  async saveUser(): Promise<void> {
    const user = this.editingUser();
    if (!user) return;

    this.saving.set(true);
    try {
      await this.userService.updateUser(user.id, {
        full_name: this.editForm.full_name,
        role: this.editForm.role,
        department: this.editForm.department || null,
        status: this.editForm.status,
      });

      this.users.update((list) =>
        list.map((u) =>
          u.id === user.id
            ? { ...u, ...this.editForm, department: this.editForm.department || null }
            : u
        )
      );

      this.closeEditModal();
    } catch (err) {
      this.snackbar.error('Failed to update user');
    } finally {
      this.saving.set(false);
    }
  }

  async deactivateUser(user: Profile): Promise<void> {
    if (!confirm(`Are you sure you want to deactivate ${user.full_name}?`)) return;

    try {
      await this.userService.updateUser(user.id, { status: 'deactivated' });
      this.users.update((list) =>
        list.map((u) => (u.id === user.id ? { ...u, status: 'deactivated' as const } : u))
      );
    } catch {
      this.snackbar.error('Failed to deactivate user');
    }
  }

  async activateUser(user: Profile): Promise<void> {
    try {
      await this.userService.updateUser(user.id, { status: 'active' });
      this.users.update((list) =>
        list.map((u) => (u.id === user.id ? { ...u, status: 'active' as const } : u))
      );
    } catch {
      this.snackbar.error('Failed to activate user');
    }
  }

  getRoleClass(role: string): string {
    const map: Record<string, string> = { admin: 'danger', manager: 'primary', it_manager: 'info', user: 'secondary' };
    return map[role] || 'secondary';
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = { active: 'success', invited: 'warning', deactivated: 'danger' };
    return map[status] || 'secondary';
  }

  getInitials(name: string): string {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }
}
