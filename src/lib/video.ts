export class ScreenStreamer {
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private captureIntervalId: number | null = null;

  public onVideoData: ((base64: string) => void) | null = null;

  async startScreenShare() {
    try {
      this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { max: 640 },
          height: { max: 480 },
          frameRate: { max: 2 },
        },
        audio: false,
      });

      this.videoElement = document.createElement("video");
      this.videoElement.srcObject = this.mediaStream;
      this.videoElement.autoplay = true;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;

      this.canvasElement = document.createElement("canvas");
      this.context = this.canvasElement.getContext("2d", { willReadFrequently: true });

      // Handle user terminating screen share via browser UI
      this.mediaStream.getVideoTracks()[0].onended = () => {
        this.stop();
      };

      await new Promise<void>((resolve) => {
        if (!this.videoElement) return;
        this.videoElement.onloadedmetadata = () => {
          this.videoElement!.play();
          resolve();
        };
      });

      // Capture at ~1 FPS
      this.captureIntervalId = window.setInterval(() => {
        this.captureFrame();
      }, 1000) as unknown as number;

    } catch (err) {
      console.error("Error starting screen share:", err);
      this.stop();
      throw err;
    }
  }

  private captureFrame() {
    if (!this.videoElement || !this.canvasElement || !this.context) return;
    if (this.videoElement.videoWidth === 0 || this.videoElement.videoHeight === 0) return;

    // Scale to max 640 width to preserve bandwidth
    const MAX_WIDTH = 640;
    let width = this.videoElement.videoWidth;
    let height = this.videoElement.videoHeight;

    if (width > MAX_WIDTH) {
      height = Math.floor(height * (MAX_WIDTH / width));
      width = MAX_WIDTH;
    }

    this.canvasElement.width = width;
    this.canvasElement.height = height;

    this.context.drawImage(this.videoElement, 0, 0, width, height);
    
    // Quality 0.5 for heavily compressed jpeg to keep WebSocket latency near zero
    const dataUrl = this.canvasElement.toDataURL("image/jpeg", 0.5);
    const base64 = dataUrl.split(",")[1];
    
    if (this.onVideoData && base64) {
      this.onVideoData(base64);
    }
  }

  stop() {
    if (this.captureIntervalId !== null) {
      clearInterval(this.captureIntervalId);
      this.captureIntervalId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
    this.canvasElement = null;
    this.context = null;
  }
}
