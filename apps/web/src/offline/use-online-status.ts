import { useEffect, useState } from 'react';

/**
 * Lo que el navegador cree de la conexión. No es definitivo (una red con
 * portal cautivo se ve "en línea"): lo que decide si algo se envió es la respuesta del servidor.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
