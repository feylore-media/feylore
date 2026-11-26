import type { PlaybackState } from "../context/playbackReducer";

interface MediaSessionBinding {
  state: PlaybackState;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (positionSeconds: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function bindMediaSession(binding: MediaSessionBinding): () => void {
  if (!("mediaSession" in navigator)) {
    return () => {};
  }

  const { state, onPlay, onPause, onSeek, onPrevious, onNext } = binding;
  const mediaSession = navigator.mediaSession;

  const updateMetadata = () => {
    const item = state.currentItem;
    if (!item) {
      mediaSession.metadata = null;
      return;
    }
    mediaSession.metadata = new MediaMetadata({
      title: item.title,
      artist: item.subtitle ?? "Feylore",
    });
  };

  const updatePlaybackState = () => {
    if (state.status === "playing") {
      mediaSession.playbackState = "playing";
    } else if (state.status === "paused") {
      mediaSession.playbackState = "paused";
    } else {
      mediaSession.playbackState = "none";
    }
  };

  mediaSession.setActionHandler("play", () => onPlay());
  mediaSession.setActionHandler("pause", () => onPause());
  mediaSession.setActionHandler("seekbackward", () => {
    onSeek(Math.max(0, state.positionSeconds - 15));
  });
  mediaSession.setActionHandler("seekforward", () => {
    const duration = state.durationSeconds ?? state.positionSeconds + 15;
    onSeek(Math.min(duration, state.positionSeconds + 15));
  });
  mediaSession.setActionHandler("previoustrack", () => onPrevious());
  mediaSession.setActionHandler("nexttrack", () => onNext());

  updateMetadata();
  updatePlaybackState();

  return () => {
    mediaSession.setActionHandler("play", null);
    mediaSession.setActionHandler("pause", null);
    mediaSession.setActionHandler("seekbackward", null);
    mediaSession.setActionHandler("seekforward", null);
    mediaSession.setActionHandler("previoustrack", null);
    mediaSession.setActionHandler("nexttrack", null);
    mediaSession.metadata = null;
    mediaSession.playbackState = "none";
  };
}
