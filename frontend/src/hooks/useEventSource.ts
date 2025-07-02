import { useEffect, useRef, useState } from "react";

export const useEventSource = (
  url: URL,
  onMessage: (message: MessageEvent) => void,
) => {
  const [connected, setConnected] = useState(false);
  const shouldOpen = useRef(true);

  const setupEventSource = (
    reconnectCallback: (newEventSource: EventSource) => void,
  ) => {
    console.log("Creating EventSource for", url.toString());
    const eventSource = new EventSource(url);

    eventSource.onopen = () => setConnected(true);
    eventSource.onerror = () => {
      setConnected(false);
      eventSource.close();
      setTimeout(() => {
        if (!shouldOpen.current) return; // The component has unmounted; we shouldn't try to reconnect anymore
        reconnectCallback(setupEventSource(reconnectCallback));
      }, 3000);
    };

    eventSource.onmessage = onMessage;

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

  return { connected };
};
