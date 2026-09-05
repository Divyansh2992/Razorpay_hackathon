import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

let socketInstance = null;

export function useSocket(onEvent) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!socketInstance) {
      socketInstance = io('http://localhost:5000', {
        transports: ['websocket', 'polling']
      });
    }

    const socket = socketInstance;

    const handlers = {
      'event:detected': (data) => onEventRef.current?.('detected', data),
      'event:diagnosed': (data) => onEventRef.current?.('diagnosed', data),
      'event:action_started': (data) => onEventRef.current?.('action_started', data),
      'event:resolved': (data) => onEventRef.current?.('resolved', data),
      'event:blocked': (data) => onEventRef.current?.('blocked', data),
      'invoice:approval_requested': (data) => onEventRef.current?.('invoice_approval_requested', data),
      'invoice:approval_decided': (data) => onEventRef.current?.('invoice_approval_decided', data),
      'invoice:reminder_sent': (data) => onEventRef.current?.('invoice_reminder_sent', data),
    };

    Object.entries(handlers).forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        socket.off(event, handler);
      });
    };
  }, []);

  return socketInstance;
}
