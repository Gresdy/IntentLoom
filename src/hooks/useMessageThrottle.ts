import { useState, useRef, useCallback, useEffect } from 'react';

export const UPDATE_THROTTLE_MS = 500;

export function useMessageThrottle<T>(
  initialValue: T,
  throttleMs: number = UPDATE_THROTTLE_MS
) {
  const [value, setValue] = useState<T>(initialValue);
  const [throttledValue, setThrottledValue] = useState<T>(initialValue);
  const pendingValue = useRef<T | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const updateValue = useCallback((newValue: T) => {
    pendingValue.current = newValue;
    setValue(newValue);

    if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        if (pendingValue.current !== null) {
          setThrottledValue(pendingValue.current);
          pendingValue.current = null;
        }
        timerRef.current = null;
      }, throttleMs);
    }
  }, [throttleMs]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingValue.current !== null) {
      setThrottledValue(pendingValue.current);
      pendingValue.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    value,
    throttledValue,
    updateValue,
    flush,
  };
}

export function useThinkingThrottle(throttleMs: number = 50) {
  const [thinking, setThinking] = useState('');
  const [throttledThinking, setThrottledThinking] = useState('');
  const pendingThinking = useRef('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(0);

  const appendThinking = useCallback((content: string) => {
    pendingThinking.current += content;
    const now = Date.now();
    
    if (now - lastUpdateRef.current >= throttleMs) {
      lastUpdateRef.current = now;
      setThinking(pendingThinking.current);
      setThrottledThinking(pendingThinking.current);
    } else if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        lastUpdateRef.current = Date.now();
        setThinking(pendingThinking.current);
        setThrottledThinking(pendingThinking.current);
        timerRef.current = null;
      }, throttleMs);
    }
  }, [throttleMs]);

  const clearThinking = useCallback(() => {
    pendingThinking.current = '';
    setThinking('');
    setThrottledThinking('');
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    thinking,
    throttledThinking,
    appendThinking,
    clearThinking,
  };
}

export function useContentThrottle(throttleMs: number = UPDATE_THROTTLE_MS) {
  const [content, setContent] = useState('');
  const pendingContent = useRef('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(0);

  const appendContent = useCallback((text: string) => {
    pendingContent.current += text;
    const now = Date.now();
    
    if (now - lastUpdateRef.current >= throttleMs) {
      lastUpdateRef.current = now;
      setContent(pendingContent.current);
    } else if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        lastUpdateRef.current = Date.now();
        setContent(pendingContent.current);
        timerRef.current = null;
      }, throttleMs);
    }
  }, [throttleMs]);

  const clearContent = useCallback(() => {
    pendingContent.current = '';
    setContent('');
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setContent(pendingContent.current);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    content,
    appendContent,
    clearContent,
    flush,
  };
}
