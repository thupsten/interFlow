import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TitleCasePipe } from '@angular/common';
import { DEPARTMENT_OPTIONS } from '../../constants/departments';
import { Api } from '../../services/api';
import { UserService } from '../../services/user.service';
import type { Profile as ProfileType } from '../../interfaces/database.types';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, TitleCasePipe],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile implements OnInit {
  readonly api = inject(Api);
  readonly userService = inject(UserService);
  readonly saving = signal(false);
  readonly departmentOptions = DEPARTMENT_OPTIONS;
  readonly message = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  form = {
    full_name: '',
    department: '',
  };

  ngOnInit(): void {
    const profile = this.api.profile();
    if (profile) {
      this.form.full_name = profile.full_name;
      this.form.department = profile.department || '';
    }
  }

  async saveProfile(): Promise<void> {
    const userId = this.api.user()?.id;
    if (!userId) return;

    this.saving.set(true);
    this.message.set(null);

    try {
      await this.userService.updateUser(userId, {
        full_name: this.form.full_name,
        department: this.form.department || null,
      });
      await this.api.loadProfile(userId);
      this.message.set({ type: 'success', text: 'Profile updated successfully!' });
    } catch {
      this.message.set({ type: 'error', text: 'Failed to update profile' });
    } finally {
      this.saving.set(false);
    }
  }

  getInitials(): string {
    return this.form.full_name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
}
