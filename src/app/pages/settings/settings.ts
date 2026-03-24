import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Api } from '../../services/api';
import { SnackbarService } from '../../services/snackbar.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, MatTooltipModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  readonly api = inject(Api);
  readonly router = inject(Router);
  readonly snackbar = inject(SnackbarService);
  readonly saving = signal(false);
  readonly updatingPassword = signal(false);
  readonly passwordTouched = signal(false);
  readonly showCurrentPassword = signal(false);
  readonly showNewPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  settings = {
    emailNotifications: true,
    taskReminders: true,
    projectUpdates: true,
    interestAlerts: true,
  };

  passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  };

  async saveSettings(): Promise<void> {
    this.saving.set(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      this.snackbar.success('Settings saved successfully!');
    } catch {
      this.snackbar.error('Failed to save settings');
    } finally {
      this.saving.set(false);
    }
  }

  async updateMyPassword(): Promise<void> {
    this.passwordTouched.set(true);

    const { currentPassword, newPassword, confirmPassword } = this.passwordForm;
    if (!currentPassword || !newPassword || !confirmPassword) {
      this.snackbar.error('Please fill all password fields.');
      return;
    }
    if (newPassword.length < 8) {
      this.snackbar.error('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      this.snackbar.error('New password and confirm password do not match.');
      return;
    }

    this.updatingPassword.set(true);
    try {
      const email = this.api.user()?.email;
      if (!email) {
        throw new Error('Unable to verify current password. Please log in again.');
      }
      const { error: verifyError } = await this.api.supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (verifyError) {
        throw new Error('Current password is incorrect.');
      }

      const { error } = await this.api.supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      this.passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
      this.passwordTouched.set(false);
      this.snackbar.success('Password changed successfully. Logging out...');
      setTimeout(async () => {
        await this.api.signOut();
        await this.router.navigate(['/login']);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password';
      this.snackbar.error(msg);
    } finally {
      this.updatingPassword.set(false);
    }
  }

  onPasswordInput(): void {
    this.passwordTouched.set(true);
  }

  getPasswordValidationError(): string {
    const { currentPassword, newPassword, confirmPassword } = this.passwordForm;
    if (!currentPassword || !newPassword || !confirmPassword) return 'Fill all password fields';
    if (newPassword.length < 8) return 'New password must be at least 8 characters';
    if (newPassword !== confirmPassword) return 'New password and confirm password do not match';
    return '';
  }

  shouldShowPasswordValidationError(): boolean {
    return this.passwordTouched() && !!this.getPasswordValidationError();
  }

  togglePasswordVisibility(field: 'current' | 'new' | 'confirm'): void {
    if (field === 'current') {
      this.showCurrentPassword.update((v) => !v);
      return;
    }
    if (field === 'new') {
      this.showNewPassword.update((v) => !v);
      return;
    }
    this.showConfirmPassword.update((v) => !v);
  }
}
