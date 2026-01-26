import { useEffect, useRef, useState } from "react";

export const useEventSource = <T extends string>(
  url: URL,
  eventNames: T[],
  onMessage: (eventName: T, message: MessageEvent) => void,
) => {
  const [hasConnected, setHasConnected] = useState(false); // Whether a connection has been established before; true after the first connection is successfully opened
  const [connected, setConnected] = useState(false);
  const shouldOpen = useRef(true);

  const setupEventSource = (
    reconnectCallback: (newEventSource: EventSource) => void,
  ) => {
    console.log("Creating EventSource for", url.toString());
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      setConnected(true);
      setHasConnected(true);
    };
    eventSource.onerror = () => {
      setConnected(false);
      eventSource.close();
      setTimeout(() => {
        if (!shouldOpen.current) return; // The component has unmounted; we shouldn't try to reconnect anymore
        reconnectCallback(setupEventSource(reconnectCallback));
      }, 3000);
    };

    for (const eventName of eventNames) {
      eventSource.addEventListener(eventName, (event: MessageEvent) =>
        onMessage(eventName, event),
      );
    }

    return eventSource;
  };

  useEffect(() => {
    shouldOpen.current = true;
    let eventSource: EventSource;
    eventSource = setupEventSource((newEventSource) => {
      eventSource = newEventSource;
    });

    return () => {
      shouldOpen.current = false;
      eventSource.close();
    };
  }, [url.toString()]);

  return { connected, connecting: !connected && !hasConnected };
};
