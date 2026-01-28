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
      }, 500);
    };

    source.current = eventSource;

    for (const eventName of eventNames) {
      eventSource.addEventListener(eventName, (event: MessageEvent) =>
        onMessage(eventName, event),
      );
    }

    return eventSource;
  };

  const setup = useEffectEvent(setupEventSource);
  const urlString = url.toString(); // Equal URLs don't have Object.is() equality, so the useEffect would be triggered on every render if we didn't convert this into a string first.

  useEffect(() => {
    shouldOpen.current = true;
    let eventSource: EventSource;
    eventSource = setup((newEventSource) => {
      eventSource = newEventSource;
    });

    return () => {
      shouldOpen.current = false;
      eventSource.close();
    };
  }, [urlString, reconnectCounter]);

  return {
    connected,
    connecting: !connected && !hasConnected,
    close: () => {
      source.current?.close();
      setConnected(false);
    },
    reconnect: () => {
      setReconnectCounter((current) => current + 1);
    },
  };
};
