import WebSocket from "ws";

const endpoint =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export function attachGeminiLive(client, apiKey) {
  const model =
    process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview";

  console.log("[Gemini] Connecting to model:", model);

  const upstream = new WebSocket(
    `${endpoint}?key=${encodeURIComponent(apiKey)}`,
  );

  let ready = false;
  let stopped = false;
  let setupTimer;

  const sendClient = (payload) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  };

  const reportError = (message) => {
    console.error("[Gemini]", message);
    sendClient({ type: "error", message });
  };

  upstream.on("open", () => {
    console.log("[Gemini] WebSocket opened; sending setup");

    setupTimer = setTimeout(() => {
      if (!ready && !stopped) {
        reportError(
          "Gemini setup timed out. Check model access and backend logs.",
        );
      }
    }, 15000);

    const setup = {
      setup: {
        model: `models/${model}`,
        generationConfig: {
          responseModalities: ["TEXT"],
        },
        inputAudioTranscription: {},
        systemInstruction: {
          parts: [
            {
              text: "Transcribe the user audio accurately. Preserve words as spoken, including mixed Hindi and English. Do not answer or summarize.",
            },
          ],
        },
      },
    };

    upstream.send(JSON.stringify(setup), (error) => {
      if (error) {
        reportError(`Failed to send Gemini setup: ${error.message}`);
      } else {
        console.log("[Gemini] Setup message sent");
      }
    });
  });

  upstream.on("message", (raw) => {
    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch {
      console.log("[Gemini] Received non-JSON message");
      return;
    }

    console.log("[Gemini] Received:", JSON.stringify(message).slice(0, 1500));

    if (message.setupComplete) {
      ready = true;
      clearTimeout(setupTimer);
      console.log("[Gemini] Setup completed successfully");
      sendClient({ type: "ready" });
      return;
    }

    if (message.error) {
      reportError(message.error.message || JSON.stringify(message.error));
      return;
    }

    const transcript =
      message.serverContent?.inputTranscription?.text ??
      message.inputTranscription?.text;

    if (transcript) {
      sendClient({ type: "transcript", text: transcript });
    }
  });

  upstream.on("error", (error) => {
    clearTimeout(setupTimer);
    reportError(`WebSocket error: ${error.message}`);
  });

  upstream.on("unexpected-response", (_request, response) => {
    clearTimeout(setupTimer);
    reportError(
      `Gemini HTTP ${response.statusCode}: ${response.statusMessage}`,
    );
  });

  upstream.on("close", (code, reason) => {
    clearTimeout(setupTimer);
    ready = false;

    console.log("[Gemini] Connection closed:", code, reason.toString());

    if (!stopped) {
      sendClient({ type: "closed" });
    }
  });

  client.on("message", (raw) => {
    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === "audio" && ready && typeof message.data === "string") {
      upstream.send(
        JSON.stringify({
          realtimeInput: {
            audio: {
              mimeType: "audio/pcm;rate=16000",
              data: message.data,
            },
          },
        }),
      );
    }

    if (message.type === "stop") {
      stopped = true;
      clearTimeout(setupTimer);

      if (
        upstream.readyState === WebSocket.OPEN ||
        upstream.readyState === WebSocket.CONNECTING
      ) {
        upstream.close();
      }

      if (client.readyState === WebSocket.OPEN) {
        client.close(1000, "Transcription stopped");
      }
    }
  });

  client.on("close", () => {
    stopped = true;
    clearTimeout(setupTimer);

    if (
      upstream.readyState === WebSocket.OPEN ||
      upstream.readyState === WebSocket.CONNECTING
    ) {
      upstream.close();
    }
  });
}
