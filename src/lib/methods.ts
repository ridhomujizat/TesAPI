import type { Method } from '../types';

export const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export function methodColor(m: Method): string {
  switch (m) {
    case 'GET':
      return 'var(--method-get)';
    case 'POST':
      return 'var(--method-post)';
    case 'PUT':
      return 'var(--method-put)';
    case 'PATCH':
      return 'var(--method-patch)';
    case 'DELETE':
      return 'var(--method-delete)';
    default:
      return 'var(--text-secondary)';
  }
}
