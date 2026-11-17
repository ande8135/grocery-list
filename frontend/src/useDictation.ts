import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal typings for the Web Speech API (not in lib.dom). */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type Ctor = new () => SpeechRecognitionLike;

const Recognition: Ctor | undefined =
  typeof window === "undefined"
    ? undefined
    : ((window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: Ctor }).webkitSpeechRecognition);

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser settings.",
  "service-not-allowed": "Microphone access is blocked. Allow it in your browser settings.",
  "audio-capture": "No microphone found.",
  network: "Voice input needs an internet connection.",
};

/** Tap-to-start / tap-to-stop dictation. `onDone` receives the final transcript. */
export function useDictation(onDone: (transcript: string) => void) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const textRef = useRef("");
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const start = useCallback(() => {
    if (!Recognition || recRef.current) return;
    const rec = new Recognition();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    textRef.current = "";
    setTranscript("");
    setError(null);

    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += `${e.results[i]?.[0]?.transcript ?? ""} `;
      textRef.current = text;
      setTranscript(text.trim());
    };
    rec.onerror = (e) => {
      const message = ERRORS[e.error];
      if (message) setError(message); // "no-speech" / "aborted" are not worth surfacing
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      const text = textRef.current.trim();
      textRef.current = "";
      setTranscript("");
      if (text) onDoneRef.current(text);
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
    }
  }, []);

  const stop = useCallback(() => recRef.current?.stop(), []);
  const toggle = useCallback(() => (recRef.current ? stop() : start()), [start, stop]);

  useEffect(() => () => recRef.current?.stop(), []);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  return { supported: Boolean(Recognition), listening, transcript, error, toggle };
}
