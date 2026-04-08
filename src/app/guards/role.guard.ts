import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { UserRole } from '../interfaces/database.types';
import { Api } from '../services/api';

export function roleGuard(allowedRoles: UserRole[]): CanActivateFn {
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

/** Platform admin only (user management, activity log, admin dashboard). */
export const adminGuard: CanActivateFn = roleGuard(['admin']);
export const adminOrManagerGuard: CanActivateFn = roleGuard(['admin', 'csm', 'manager']);
/** Admin or manager only (no CSM): interests, team, time logs. */
export const adminOrManagerOnlyGuard: CanActivateFn = roleGuard(['admin', 'manager']);
/** Only roles allowed to open /projects/new (CSM may edit existing projects but not create). */
export const canCreateProjectGuard: CanActivateFn = roleGuard(['admin', 'manager']);
/** Project finance: PMs create estimates; finance staff may also open this page to review/delete. */
export const adminManagerOrFinanceGuard: CanActivateFn = roleGuard([
  'admin',
  'manager',
  'finance',
]);
export const userOnlyGuard: CanActivateFn = roleGuard(['user']);
export const itManagerGuard: CanActivateFn = roleGuard(['it_manager']);
export const adminOrItManagerGuard: CanActivateFn = roleGuard(['admin', 'it_manager']);
export const financeGuard: CanActivateFn = roleGuard(['finance', 'admin']);
