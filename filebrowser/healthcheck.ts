import { exit } from "node:process";

try {
  const result = await fetch("http://localhost:8080/livez");
  const text = await result.text();
  if (text !== "OK") {
    exit(1);
  }
} catch (e) {
  exit(1);
}
