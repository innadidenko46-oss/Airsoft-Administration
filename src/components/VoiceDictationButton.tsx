import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';

interface VoiceDictationButtonProps {
  context: 'reportedFault' | 'diagnosisSummary';
  onTranscript: (text: string) => void;
  onError: (msg: string) => void;
}

function pickSupportedAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function formatSeconds(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      if (commaIdx === -1) {
        reject(new Error('Nie udało się zakodować nagrania audio.'));
        return;
      }
      resolve(result.slice(commaIdx + 1));
    };
    reader.onerror = () =>
      reject(new Error('Błąd odczytu nagranego pliku audio.'));
    reader.readAsDataURL(blob);
  });
}

export const VoiceDictationButton: React.FC<VoiceDictationButtonProps> = ({
  context,
  onTranscript,
  onError,
}) => {
  const [status, setStatus] = useState<'idle' | 'recording' | 'transcribing'>(
    'idle'
  );
  const [elapsedSec, setElapsedSec] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const maxTimeoutRef = useRef<number | null>(null);

  const stopTracksAndTimers = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (maxTimeoutRef.current !== null) {
      window.clearTimeout(maxTimeoutRef.current);
      maxTimeoutRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        mediaRecorderRef.current.stop();
      }
      stopTracksAndTimers();
    };
  }, []);

  const handleStopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const handleStartRecording = async () => {
    if (status !== 'idle') return;

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      onError(
        'Twoja przeglądarka nie obsługuje nagrywania głosu lub strona nie działa w bezpiecznym kontekście.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredMime = pickSupportedAudioMimeType();
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || preferredMime || 'audio/webm';
        const recordedChunks = [...chunksRef.current];
        chunksRef.current = [];
        stopTracksAndTimers();

        if (recordedChunks.length === 0) {
          setStatus('idle');
          onError('Nagranie było puste. Spróbuj ponownie.');
          return;
        }

        const audioBlob = new Blob(recordedChunks, { type: mimeType });
        if (audioBlob.size < 400) {
          setStatus('idle');
          onError('Nagranie jest zbyt krótkie. Przytrzymaj chwilę dłużej podczas mówienia.');
          return;
        }

        setStatus('transcribing');
        void (async () => {
          try {
            const audioBase64 = await blobToBase64(audioBlob);
            const resp = await fetch('/api/transcribe-fault', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64,
                mimeType,
                context,
              }),
            });
            const json = (await resp.json().catch(() => ({}))) as {
              text?: string;
              error?: string;
            };
            if (!resp.ok || !json.text) {
              throw new Error(
                json.error || 'Nie udało się rozpoznać mowy z nagrania.'
              );
            }
            onTranscript(json.text.trim());
          } catch (err: unknown) {
            onError(
              err instanceof Error
                ? err.message
                : 'Błąd podczas zamiany głosu na tekst.'
            );
          } finally {
            setStatus('idle');
            setElapsedSec(0);
          }
        })();
      };

      recorder.start(250);
      setElapsedSec(0);
      setStatus('recording');

      timerRef.current = window.setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);

      maxTimeoutRef.current = window.setTimeout(() => {
        handleStopRecording();
      }, 90000);
    } catch (err: unknown) {
      stopTracksAndTimers();
      setStatus('idle');
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        onError(
          'Brak dostępu do mikrofonu. Zezwól przeglądarce na użycie mikrofonu i spróbuj ponownie.'
        );
      } else if (name === 'NotFoundError') {
        onError('Nie wykryto podłączonego mikrofonu w tym komputerze.');
      } else {
        onError('Nie udało się uruchomić nagrywania z mikrofonu.');
      }
    }
  };

  if (status === 'recording') {
    return (
      <button
        type="button"
        onClick={handleStopRecording}
        className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 transition-colors"
        title="Zatrzymaj nagrywanie i wstaw tekst"
      >
        <Square className="h-3 w-3 fill-current" />
        <span className="font-mono tabular-nums">{formatSeconds(elapsedSec)}</span>
        <span>Stop</span>
      </button>
    );
  }

  if (status === 'transcribing') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900">
        <Loader2 className="h-3 w-3 animate-spin text-[#e88a00]" />
        Przetwarzam głos...
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleStartRecording()}
      className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-[#e88a00] hover:text-[#b86d00] transition-colors"
      title="Podyktuj opis usterki przez mikrofon"
    >
      <Mic className="h-3 w-3 text-[#e88a00]" />
      Nagraj głosem
    </button>
  );
};
