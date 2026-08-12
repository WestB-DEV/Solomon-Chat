const endpoint = process.argv[2] || "http://127.0.0.1:9222/json";
const expression = process.argv.slice(3).join(" ");

if (!expression) {
  throw new Error("Usage: node scripts/android-cdp.mjs [endpoint] <expression>");
}

const pages = await fetch(endpoint).then((response) => response.json());
const page = pages.find((candidate) => candidate.type === "page");
if (!page) throw new Error("No debuggable Android WebView page found");

const socket = new WebSocket(page.webSocketDebuggerUrl);
const response = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("CDP evaluation timed out")), 10_000);
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression, returnByValue: true, awaitPromise: true },
    }));
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== 1) return;
    clearTimeout(timer);
    if (message.error || message.result?.exceptionDetails) {
      reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
      return;
    }
    resolve(message.result?.result?.value);
  });
  socket.addEventListener("error", reject);
});

socket.close();
console.log(JSON.stringify(response, null, 2));
