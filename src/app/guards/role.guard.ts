import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Api } from '../services/api';

export function roleGuard(allowedRoles: ('admin' | 'manager' | 'user' | 'it_manager')[]): CanActivateFn {
  return async () => {
    const api = inject(Api);
    const router = inject(Router);

    await api.initialize();

    const role = api.userRole();
    if (role && allowedRoles.includes(role)) {
      return true;
    }

    router.navigate(['/dashboard']);
    return false;
  };
}

export const adminGuard: CanActivateFn = roleGuard(['admin']);
export const adminOrManagerGuard: CanActivateFn = roleGuard(['admin', 'manager']);
export const userOnlyGuard: CanActivateFn = roleGuard(['user']);
export const itManagerGuard: CanActivateFn = roleGuard(['it_manager']);
export const adminOrItManagerGuard: CanActivateFn = roleGuard(['admin', 'it_manager']);
