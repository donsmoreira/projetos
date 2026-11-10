import {
  useEffect,
  useState
} from "react";

/**
 * Contagem regressiva em segundos, usada para liberar o "Reenviar código".
 */
export function useCooldown() {
  const [secondsLeft, setSecondsLeft] =
    useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSecondsLeft(current =>
        Math.max(current - 1, 0)
      );
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [secondsLeft]);

  return {
    secondsLeft,
    start: (seconds = 60) =>
      setSecondsLeft(seconds)
  };
}
