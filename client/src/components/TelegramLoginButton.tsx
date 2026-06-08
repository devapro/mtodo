import { useEffect, useRef } from 'react';
import { TelegramLoginData } from '../types';

interface Props {
  botUsername: string;
  onAuth: (data: TelegramLoginData) => void;
  size?: 'large' | 'medium' | 'small';
  requestAccess?: boolean;
}

// Each mounted widget registers a uniquely-named global callback because the
// Telegram widget script can only call a function on `window` by name.
let callbackSeq = 0;

/**
 * Renders the official Telegram Login Widget by injecting Telegram's script
 * with the appropriate data-* attributes. On success the widget invokes our
 * global callback with the signed login payload.
 */
export default function TelegramLoginButton({
  botUsername,
  onAuth,
  size = 'large',
  requestAccess = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  useEffect(() => {
    if (!botUsername || !containerRef.current) return;

    const callbackName = `onTelegramAuth_${++callbackSeq}`;
    (window as unknown as Record<string, unknown>)[callbackName] = (
      user: TelegramLoginData
    ) => onAuthRef.current(user);

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', size);
    script.setAttribute('data-userpic', 'true');
    script.setAttribute('data-request-access', requestAccess ? 'write' : 'read');
    script.setAttribute('data-onauth', `${callbackName}(user)`);

    const container = containerRef.current;
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
      delete (window as unknown as Record<string, unknown>)[callbackName];
    };
  }, [botUsername, size, requestAccess]);

  return <div ref={containerRef} className="d-inline-block" />;
}
