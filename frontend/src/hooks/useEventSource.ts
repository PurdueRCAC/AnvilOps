import { useEffect, useState } from "react";

export const useEventSource = (
  url: URL,
  onMessage: (message: MessageEvent) => void,
) => {
  const [connected, setConnected] = useState(false);

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
        reconnectCallback(setupEventSource(reconnectCallback));
      }, 3000);
    };

    eventSource.onmessage = onMessage;

    return eventSource;
  };

  useEffect(() => {
    let eventSource: EventSource;
    eventSource = setupEventSource((newEventSource) => {
      eventSource = newEventSource;
    });

    return () => {
      eventSource.close();
    };
  }, [url.toString()]);

  return { connected };
};
