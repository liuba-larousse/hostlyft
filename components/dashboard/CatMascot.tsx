"use client";

import { useState, useEffect, useCallback } from "react";

const MESSAGES = [
  "You're doing amazing!",
  "One task at a time!",
  "You've got this!",
  "Take a deep breath.",
  "Proud of you!",
  "Keep going, superstar!",
  "Almost there!",
  "You're unstoppable!",
  "Believe in yourself!",
  "Great work today!",
  "Stay pawsitive!",
  "You're purrfect!",
  "Meow-velous job!",
  "Time for a stretch!",
  "Hydrate, human!",
  "You make it look easy!",
  "Crushing it!",
  "Small steps matter!",
  "Progress, not perfection!",
  "You're a legend!",
];

type CatMood = "happy" | "sleepy" | "playful" | "love";

export default function CatMascot() {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const [mood, setMood] = useState<CatMood>("happy");
  const [minimized, setMinimized] = useState(false);
  const [bounce, setBounce] = useState(false);

  const showMessage = useCallback(() => {
    const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    const moods: CatMood[] = ["happy", "sleepy", "playful", "love"];
    setMood(moods[Math.floor(Math.random() * moods.length)]);
    setMessage(msg);
    setVisible(true);
    setBounce(true);
    setTimeout(() => setBounce(false), 600);
    setTimeout(() => setVisible(false), 4000);
  }, []);

  // Show a message every 45s
  useEffect(() => {
    const timeout = setTimeout(showMessage, 3000); // first one after 3s
    const interval = setInterval(showMessage, 45000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [showMessage]);

  if (minimized) {
    return (
      <button
        onClick={() => { setMinimized(false); showMessage(); }}
        className="fixed bottom-4 right-4 z-40 w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform cursor-pointer"
        title="Bring back the cat!"
      >
        <span className="text-lg">🐱</span>
      </button>
    );
  }

  const catFace: Record<CatMood, string> = {
    happy:   "◠ ◡ ◠",
    sleepy:  "– ᴗ –",
    playful: "◉ ω ◉",
    love:    "♡ ᴗ ♡",
  };

  const tailAnim = mood === "playful"
    ? "animate-[wiggle_0.4s_ease-in-out_infinite]"
    : "animate-[sway_2s_ease-in-out_infinite]";

  return (
    <div className={`fixed bottom-4 right-4 z-40 flex flex-col items-end gap-1 ${bounce ? "animate-[bounce_0.5s_ease]" : ""}`}>
      {/* Speech bubble */}
      {visible && (
        <div className="bg-white border border-gray-200 rounded-2xl rounded-br-sm px-3 py-2 shadow-md max-w-48 animate-[fadeIn_0.3s_ease]">
          <p className="text-xs text-gray-700 font-medium leading-snug">{message}</p>
        </div>
      )}

      {/* Cat */}
      <div
        onClick={showMessage}
        className="relative cursor-pointer group select-none"
        title="Click for encouragement!"
      >
        {/* Minimize button */}
        <button
          onClick={(e) => { e.stopPropagation(); setMinimized(true); }}
          className="absolute -top-1 -left-1 w-4 h-4 bg-gray-200 rounded-full text-gray-400 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-gray-300"
          title="Hide cat"
        >
          ✕
        </button>

        <svg width="56" height="52" viewBox="0 0 56 52" className="drop-shadow-md">
          {/* Tail */}
          <g className={tailAnim} style={{ transformOrigin: "44px 36px" }}>
            <path d="M44 36 Q52 28 48 18 Q46 14 50 12" stroke="#2d2d2d" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>

          {/* Body */}
          <ellipse cx="28" cy="40" rx="16" ry="10" fill="#2d2d2d" />

          {/* Head */}
          <circle cx="28" cy="24" r="13" fill="#333" />

          {/* Ears */}
          <polygon points="17,16 13,4 22,12" fill="#333" />
          <polygon points="39,16 43,4 34,12" fill="#333" />
          <polygon points="17.5,15 14.5,6 21,12" fill="#ffb6c1" opacity="0.6" />
          <polygon points="38.5,15 41.5,6 35,12" fill="#ffb6c1" opacity="0.6" />

          {/* Eyes */}
          {mood === "sleepy" ? (
            <>
              <line x1="21" y1="22" x2="25" y2="22" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="31" y1="22" x2="35" y2="22" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </>
          ) : mood === "love" ? (
            <>
              <text x="20" y="25" fontSize="6" fill="#ff6b8a" textAnchor="middle">♥</text>
              <text x="36" y="25" fontSize="6" fill="#ff6b8a" textAnchor="middle">♥</text>
            </>
          ) : (
            <>
              <circle cx="22" cy="22" r="2.5" fill="white" />
              <circle cx="34" cy="22" r="2.5" fill="white" />
              <circle cx={mood === "playful" ? "23" : "22.5"} cy="22" r="1.2" fill="#2d2d2d" />
              <circle cx={mood === "playful" ? "35" : "34.5"} cy="22" r="1.2" fill="#2d2d2d" />
              {/* Shine */}
              <circle cx="21.5" cy="21" r="0.6" fill="white" opacity="0.8" />
              <circle cx="33.5" cy="21" r="0.6" fill="white" opacity="0.8" />
            </>
          )}

          {/* Nose */}
          <ellipse cx="28" cy="27" rx="1.2" ry="0.8" fill="#ffb6c1" />

          {/* Mouth */}
          {mood === "happy" || mood === "love" ? (
            <path d="M25 29 Q28 32 31 29" stroke="white" strokeWidth="1" fill="none" strokeLinecap="round" />
          ) : mood === "playful" ? (
            <>
              <path d="M25 29 Q28 31 31 29" stroke="white" strokeWidth="1" fill="none" strokeLinecap="round" />
              <line x1="28" y1="27.5" x2="28" y2="29" stroke="white" strokeWidth="0.8" />
            </>
          ) : null}

          {/* Whiskers */}
          <line x1="10" y1="24" x2="19" y2="26" stroke="white" strokeWidth="0.5" opacity="0.5" />
          <line x1="10" y1="28" x2="19" y2="28" stroke="white" strokeWidth="0.5" opacity="0.5" />
          <line x1="46" y1="24" x2="37" y2="26" stroke="white" strokeWidth="0.5" opacity="0.5" />
          <line x1="46" y1="28" x2="37" y2="28" stroke="white" strokeWidth="0.5" opacity="0.5" />

          {/* Paws */}
          <ellipse cx="20" cy="48" rx="4" ry="2.5" fill="#333" />
          <ellipse cx="36" cy="48" rx="4" ry="2.5" fill="#333" />
        </svg>
      </div>

      <style>{`
        @keyframes sway {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(12deg); }
        }
        @keyframes wiggle {
          0%, 100% { transform: rotate(-8deg); }
          50% { transform: rotate(15deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
