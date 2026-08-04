import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const SW_URL = `/sw.js?v=${encodeURIComponent(import.meta.env.VITE_APP_VERSION ?? '1')}`;

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return new Uint8Array([...raw].map((char) => char.charCodeAt(0)));
}

function getApplicationServerKey(base64String: string) {
  const key = urlBase64ToUint8Array(base64String.trim());
  return key.length === 65 && key[0] === 4 ? key : null;
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  try {
    return await navigator.serviceWorker.register(SW_URL, {
      scope: '/',
      updateViaCache: 'none',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      try {
        return await navigator.serviceWorker.register(SW_URL, {
          scope: '/',
          updateViaCache: 'none',
        });
      } catch (retryError) {
        console.warn('[SW] Registration retry failed:', retryError);
        return null;
      }
    }
    console.warn('[SW] Registration failed:', error);
    return null;
  }
}

export async function requestPushPermission(userId: string): Promise<NotificationPermission | 'unsupported' | 'missing-key' | 'invalid-key'> {
  if (!isPushSupported()) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'missing-key';
  const applicationServerKey = getApplicationServerKey(VAPID_PUBLIC_KEY);
  if (!applicationServerKey) return 'invalid-key';

  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return permission;

  const registration = await registerServiceWorker();
  if (!registration || !supabase) return permission;

  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    try {
      await subscription.unsubscribe();
    } catch {
      // A stale subscription should not block creating a fresh one.
    }
  }

  subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      subscription: JSON.parse(JSON.stringify(subscription)),
      reminders_enabled: true,
      streak_reminders_enabled: true,
      leaderboard_reminders_enabled: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  return permission;
}

export async function removePushPermission(userId: string) {
  const registration = await navigator.serviceWorker?.ready;
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) await subscription.unsubscribe();
  if (supabase) await supabase.from('push_subscriptions').delete().eq('user_id', userId);
}
