import { useEffect, useRef, useState } from "react";

export interface CameraStreamState {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  error: string | null;
  isReady: boolean;
}

/**
 * Reusable hook to access the user's webcam.
 * Returns a video ref that can be attached to a hidden <video> element,
 * plus status flags for the stream.
 */
export function useCameraStream(): CameraStreamState {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let activeStream: MediaStream | null = null;

    async function init() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 5 } },
          audio: false,
        });

        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        activeStream = mediaStream;
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            setIsReady(true);
          };
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("[useCameraStream] Camera access error:", err);
          setError(err?.message || "Camera permission denied");
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Ensure stream gets attached even if the video element mounts late (e.g. after login)
  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(e => console.warn("Video play blocked:", e));
          setIsReady(true);
        };
      }
    }
  }, [stream, videoRef.current]);

  return { videoRef, stream, error, isReady };
}
