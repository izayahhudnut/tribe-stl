
/**
 * Extracts a sequence of frames from a video file as base64 strings.
 */
export const extractFrames = async (
  file: File,
  numFrames: number = 6
): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const frames: string[] = [];

    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.play();

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      const interval = duration / (numFrames + 1);

      for (let i = 1; i <= numFrames; i++) {
        await new Promise<void>((r) => {
          video.currentTime = i * interval;
          video.onseeked = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context?.drawImage(video, 0, 0, canvas.width, canvas.height);
            const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
            frames.push(base64);
            r();
          };
        });
      }

      video.pause();
      URL.revokeObjectURL(video.src);
      resolve(frames);
    };

    video.onerror = (e) => reject(e);
  });
};
