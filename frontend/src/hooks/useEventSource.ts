import { useEffect, useEffectEvent, useRef, useState } from "react";

export const useEventSource = <T extends string>(
  url: URL,
  eventNames: T[],
  onMessage: (eventName: T, message: MessageEvent) => void,
) => {
  const [hasConnected, setHasConnected] = useState(false); // Whether a connection has been established before; true after the first connection is successfully opened
  const [connected, setConnected] = useState(false);
  const [reconnectCounter, setReconnectCounter] = useState(0);
  const source = useRef<EventSource | null>(null);
  const reconnectTimeout = useRef(500);
  const shouldOpen = useRef(true);

  const reconnect = () => {
    setReconnectCounter((current) => current + 1);
  };

  const setupEventSource = () => {
    console.log("Creating EventSource for", url.toString());

    source.current = new EventSource(url);

    source.current.onopen = () => {
      setConnected(true);
      setHasConnected(true);
      reconnectTimeout.current = 500;
    };
    source.current.onerror = () => {
      setConnected(false);
      source.current?.close();
      setTimeout(() => {
        if (!shouldOpen.current) return; // The component has unmounted; we shouldn't try to reconnect anymore
        console.log("Reconnecting");
        reconnect();
      }, reconnectTimeout.current);
      reconnectTimeout.current = Math.min(reconnectTimeout.current * 2, 10000);
    };

    for (const eventName of eventNames) {
      source.current.addEventListener(eventName, (event: MessageEvent) =>
        onMessage(eventName, event),
      );
    }
  };

  const setup = useEffectEvent(setupEventSource);
  const urlString = url.toString(); // Equal URLs don't have Object.is() equality, so the useEffect would be triggered on every render if we didn't convert this into a string first.

  useEffect(() => {
    shouldOpen.current = true;
    setup();

    return () => {
      shouldOpen.current = false;
      source.current?.close();
    };
  }, [urlString, reconnectCounter]);

  return {
    connected,
    connecting: !connected && !hasConnected,
    close: () => {
      source.current?.close();
      setConnected(false);
    },
  };
};
