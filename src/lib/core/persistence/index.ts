import { SESSION_STORAGE_KEY } from '$lib/shared/constants/storage';
import type { SessionState } from '../types';

interface StoredSession {
	version: 1;
	session: SessionState;
}

export function saveSession(session: SessionState): void {
	if (typeof localStorage === 'undefined') return;

	const payload: StoredSession = {
		version: 1,
		session
	};

	localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
}

export function loadSession(): SessionState | null {
	if (typeof localStorage === 'undefined') return null;
	const raw = localStorage.getItem(SESSION_STORAGE_KEY);
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as StoredSession;
		if (parsed.version !== 1) return null;
		return parsed.session;
	} catch {
		return null;
	}
}
