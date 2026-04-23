"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ── Messages ────────────────────────────────────────────────────────────────

const ENCOURAGE = [
  "You're doing amazing!", "One task at a time!", "You've got this!", "Take a deep breath.",
  "Proud of you!", "Keep going, superstar!", "Almost there!", "You're unstoppable!",
  "Believe in yourself!", "Great work today!", "Stay pawsitive!", "You're purrfect!",
  "Meow-velous job!", "Time for a stretch!", "Hydrate, human!", "You make it look easy!",
  "Crushing it!", "Small steps matter!", "Progress, not perfection!", "You're a legend!",
];
const CELEBRATE = [
  "Task done! You're on fire!", "Another one bites the dust!", "Yay! Keep it up!",
  "That's how it's done!", "Purr-fect execution!", "You crushed that!", "Victory dance time!",
];
const SAD = [
  "Some tasks are overdue...", "Let's catch up on those!", "You can still do it!",
  "Don't worry, one at a time.", "Let's tackle the backlog!",
];
const EXCITED = [
  "New schedule loaded! Let's go!", "Fresh week, fresh energy!", "Ooh, new tasks to conquer!",
  "Let's make this week great!", "Ready, set, meow!",
];
const NUDGE = [
  "That task has been in progress a while...", "Need help with that task?",
  "Maybe time to finish or re-prioritize?", "Just checking in on your progress!",
];
const POMO_WORK = ["Focus time! You got this!", "Deep work mode activated!", "Let's stay focused!"];
const POMO_BREAK = ["Break time! Stretch those paws!", "Time to rest! Good job!", "Nap time... zzz"];
const IDLE_WAKE = ["Oh! You're back!", "Missed you!", "Ready to work again?", "*yawn* ...hi!"];
const PET_MSG = ["Purrrr...", "Mrrrrp!", "So cozy...", "*happy purring*", "More pets please!"];

// ── Types ───────────────────────────────────────────────────────────────────

type CatMood = "happy" | "sleepy" | "playful" | "love" | "celebrate" | "sad" | "excited" | "petting";
type PomoState = "idle" | "work" | "break";

const CAT_BODY = "#2d2d2d";
const CAT_HEAD = "#333";

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function getSeason(): "winter" | "spring" | "summer" | "fall" {
  const m = new Date().getMonth();
  if (m >= 2 && m <= 4) return "spring";
  if (m >= 5 && m <= 7) return "summer";
  if (m >= 8 && m <= 10) return "fall";
  return "winter";
}

// ── Component ───────────────────────────────────────────────────────────────

export default function CatMascot() {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const [mood, setMood] = useState<CatMood>("happy");
  const [minimized, setMinimized] = useState(false);
  const [bounce, setBounce] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
  const [isFlipping, setIsFlipping] = useState(false);
  const [isPetting, setIsPetting] = useState(false);
  const [yarnActive, setYarnActive] = useState(false);
  const [streak, setStreak] = useState(0);
  const [pomoState, setPomoState] = useState<PomoState>("idle");
  const [pomoTime, setPomoTime] = useState(0);
  const [idleTime, setIdleTime] = useState(0);

  const catRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const petTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const season = getSeason();
  // ── Show message ────────────────────────────────────────────────────────

  const showMsg = useCallback((msg: string, m: CatMood, duration = 4000) => {
    setMessage(msg);
    setMood(m);
    setVisible(true);
    setBounce(true);
    setTimeout(() => setBounce(false), 600);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setVisible(false), duration);
  }, []);

  const showRandom = useCallback(() => {
    const moods: CatMood[] = ["happy", "playful", "love"];
    showMsg(pick(ENCOURAGE), pick(moods));
  }, [showMsg]);

  // ── Streak (localStorage) ──────────────────────────────────────────────

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem("cat-streak") ?? "{}");
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      if (data.last === today) {
        setStreak(data.count ?? 1);
      } else if (data.last === yesterday) {
        const n = (data.count ?? 0) + 1;
        setStreak(n);
        localStorage.setItem("cat-streak", JSON.stringify({ last: today, count: n }));
      } else {
        setStreak(1);
        localStorage.setItem("cat-streak", JSON.stringify({ last: today, count: 1 }));
      }
    } catch { setStreak(1); }
  }, []);

  // ── Periodic encouragement ─────────────────────────────────────────────

  useEffect(() => {
    const t = setTimeout(showRandom, 3000);
    const i = setInterval(showRandom, 50000);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [showRandom]);

  // ── Idle detection ─────────────────────────────────────────────────────

  useEffect(() => {
    let idle = 0;
    const tick = setInterval(() => {
      idle++;
      setIdleTime(idle);
      if (idle === 60) { // 60s idle
        setMood("sleepy");
        showMsg("*yawn* ...zzz", "sleepy", 6000);
        setYarnActive(false);
      }
      if (idle === 120) { // 2min idle → yarn ball
        setYarnActive(true);
      }
    }, 1000);

    function reset() {
      if (idle >= 60 && mood === "sleepy") {
        showMsg(pick(IDLE_WAKE), "happy");
      }
      idle = 0;
      setIdleTime(0);
      setYarnActive(false);
    }

    window.addEventListener("mousemove", reset);
    window.addEventListener("keydown", reset);
    window.addEventListener("click", reset);
    return () => {
      clearInterval(tick);
      window.removeEventListener("mousemove", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("click", reset);
    };
  }, [mood, showMsg]);

  // ── Eye tracking ───────────────────────────────────────────────────────

  useEffect(() => {
    function track(e: MouseEvent) {
      if (!catRef.current || mood === "sleepy" || isPetting) return;
      const rect = catRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxOff = 1.5;
      const scale = Math.min(maxOff / (dist / 150), maxOff);
      setEyeOffset({ x: (dx / dist) * scale || 0, y: (dy / dist) * scale || 0 });
    }
    window.addEventListener("mousemove", track);
    return () => window.removeEventListener("mousemove", track);
  }, [mood, isPetting]);

  // ── Custom events (from TaskBoard / Schedule) ──────────────────────────

  useEffect(() => {
    function onDone() { showMsg(pick(CELEBRATE), "celebrate"); }
    function onImport() { showMsg(pick(EXCITED), "excited"); }
    function onOverdue() {
      if (mood !== "sad") showMsg(pick(SAD), "sad", 5000);
    }
    function onNudge() { showMsg(pick(NUDGE), "playful", 5000); }

    window.addEventListener("cat:task-done", onDone);
    window.addEventListener("cat:schedule-import", onImport);
    window.addEventListener("cat:task-overdue", onOverdue);
    window.addEventListener("cat:task-nudge", onNudge);
    return () => {
      window.removeEventListener("cat:task-done", onDone);
      window.removeEventListener("cat:schedule-import", onImport);
      window.removeEventListener("cat:task-overdue", onOverdue);
      window.removeEventListener("cat:task-nudge", onNudge);
    };
  }, [mood, showMsg]);

  // ── Pomodoro timer ─────────────────────────────────────────────────────

  useEffect(() => {
    if (pomoState === "idle") return;
    const i = setInterval(() => {
      setPomoTime((t) => {
        if (t <= 1) {
          if (pomoState === "work") {
            setPomoState("break");
            showMsg(pick(POMO_BREAK), "sleepy", 5000);
            return 5 * 60;
          } else {
            setPomoState("work");
            showMsg(pick(POMO_WORK), "playful", 4000);
            return 25 * 60;
          }
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(i);
  }, [pomoState, showMsg]);

  function togglePomo() {
    if (pomoState === "idle") {
      setPomoState("work");
      setPomoTime(25 * 60);
      showMsg(pick(POMO_WORK), "playful");
    } else {
      setPomoState("idle");
      setPomoTime(0);
      showMsg("Pomodoro stopped!", "happy");
    }
  }

  function fmtPomo(s: number) {
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${m}:${ss.toString().padStart(2, "0")}`;
  }

  // ── Drag to reposition ─────────────────────────────────────────────────

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const p = pos ?? { x: 16, y: 16 };
    dragStart.current = { mx: e.clientX, my: e.clientY, px: p.x, py: p.y };
    setIsDragging(false);

    // Pet detection — hold for 500ms
    petTimer.current = setTimeout(() => {
      setIsPetting(true);
      showMsg(pick(PET_MSG), "petting", 3000);
    }, 500);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      setIsDragging(true);
      if (petTimer.current) { clearTimeout(petTimer.current); petTimer.current = null; }
      setIsPetting(false);
      setPos({
        x: Math.max(0, dragStart.current.px - dx),
        y: Math.max(0, dragStart.current.py + dy),
      });
    }
  }

  function onPointerUp() {
    if (petTimer.current) { clearTimeout(petTimer.current); petTimer.current = null; }
    if (isPetting) { setTimeout(() => setIsPetting(false), 500); }
    dragStart.current = null;
  }

  // ── Double-click flip ──────────────────────────────────────────────────

  function onDoubleClick() {
    if (isFlipping) return;
    setIsFlipping(true);
    showMsg("Wheee!", "playful", 2000);
    setTimeout(() => setIsFlipping(false), 800);
  }

  // ── Click handler ──────────────────────────────────────────────────────

  function onClick() {
    if (isDragging) return;
    showRandom();
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (minimized) {
    return (
      <button
        onClick={() => { setMinimized(false); showRandom(); }}
        className="fixed bottom-4 right-4 z-40 w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform cursor-pointer"
        title="Bring back the cat!"
      >
        <span className="text-lg">🐱</span>
      </button>
    );
  }

  const posStyle = pos
    ? { bottom: `${pos.y}px`, right: `${pos.x}px` }
    : { bottom: "16px", right: "16px" };

  const isSleeping = mood === "sleepy" || (pomoState === "break") || idleTime >= 60;
  const tailAnim = mood === "playful" || mood === "celebrate" || mood === "excited"
    ? "animate-[wiggle_0.3s_ease-in-out_infinite]"
    : isSleeping ? "" : "animate-[sway_2s_ease-in-out_infinite]";

  const eyeX = isSleeping || isPetting ? 0 : eyeOffset.x;
  const eyeY = isSleeping || isPetting ? 0 : eyeOffset.y;

  return (
    <div
      className="fixed z-40 flex flex-col items-end gap-1 select-none"
      style={posStyle}
    >
      {/* Speech bubble */}
      {visible && (
        <div className="bg-white border border-gray-200 rounded-2xl rounded-br-sm px-3 py-2 shadow-md max-w-52 animate-[fadeIn_0.3s_ease]">
          <p className="text-xs text-gray-700 font-medium leading-snug">{message}</p>
        </div>
      )}

      {/* Controls row */}
      <div className="flex items-center gap-1.5">
        {/* Streak */}
        {streak > 1 && (
          <div className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full" title={`${streak} day streak!`}>
            {streak}d
          </div>
        )}

        {/* Pomodoro */}
        <button
          onClick={togglePomo}
          className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
            pomoState === "idle"
              ? "bg-gray-100 text-gray-500 hover:bg-gray-200"
              : pomoState === "work"
                ? "bg-red-100 text-red-600"
                : "bg-green-100 text-green-600"
          }`}
          title={pomoState === "idle" ? "Start Pomodoro" : "Stop Pomodoro"}
        >
          {pomoState === "idle" ? "🍅" : `${pomoState === "work" ? "🔥" : "💤"} ${fmtPomo(pomoTime)}`}
        </button>

      </div>

      {/* Cat SVG */}
      <div
        ref={catRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={onDoubleClick}
        onClick={onClick}
        className={`relative cursor-pointer group touch-none ${bounce ? "animate-[bounce_0.5s_ease]" : ""} ${isFlipping ? "animate-[flip_0.8s_ease]" : ""}`}
        title="Click for encouragement · Hold to pet · Double-click for a trick · Drag to move"
      >
        {/* Minimize */}
        <button
          onClick={(e) => { e.stopPropagation(); setMinimized(true); }}
          className="absolute -top-1 -left-1 w-4 h-4 bg-gray-200 rounded-full text-gray-400 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-gray-300 z-10"
          title="Hide cat"
        >
          ✕
        </button>

        <svg width="60" height="56" viewBox="0 0 60 56" className="drop-shadow-md">
          {/* Yarn ball (idle play) */}
          {yarnActive && (
            <g className="animate-[yarnRoll_2s_ease-in-out_infinite]">
              <circle cx="8" cy="48" r="5" fill="#38bdf8" />
              <path d="M4 46 Q8 42 12 46" stroke="#0ea5e9" strokeWidth="0.8" fill="none" />
              <path d="M5 50 Q8 46 11 50" stroke="#0ea5e9" strokeWidth="0.8" fill="none" />
            </g>
          )}

          {/* Tail */}
          <g className={tailAnim} style={{ transformOrigin: "46px 38px" }}>
            <path d="M46 38 Q54 30 50 20 Q48 16 52 14" stroke={CAT_BODY} strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>

          {/* Body */}
          <ellipse cx="30" cy="42" rx="16" ry="10" fill={CAT_BODY} />

          {/* Head */}
          <circle cx="30" cy="26" r="13" fill={CAT_HEAD} />

          {/* Ears */}
          <polygon points="19,18 15,6 24,14" fill={CAT_HEAD} />
          <polygon points="41,18 45,6 36,14" fill={CAT_HEAD} />
          <polygon points="19.5,17 16.5,8 23,14" fill="#ffb6c1" opacity="0.5" />
          <polygon points="40.5,17 43.5,8 37,14" fill="#ffb6c1" opacity="0.5" />

          {/* Seasonal outfit */}
          {season === "winter" && (
            <>
              {/* Santa hat */}
              <polygon points="22,14 30,0 38,14" fill="#e53e3e" />
              <ellipse cx="30" cy="14" rx="9" ry="2.5" fill="white" />
              <circle cx="30" cy="1" r="2.5" fill="white" />
            </>
          )}
          {season === "summer" && (
            <>
              {/* Sunglasses */}
              <rect x="18" y="21" width="8" height="5" rx="2" fill="#1a1a1a" opacity="0.85" />
              <rect x="34" y="21" width="8" height="5" rx="2" fill="#1a1a1a" opacity="0.85" />
              <line x1="26" y1="23" x2="34" y2="23" stroke="#1a1a1a" strokeWidth="1" />
            </>
          )}
          {season === "spring" && (
            <>
              {/* Flower */}
              <circle cx="19" cy="12" r="2" fill="#f472b6" />
              <circle cx="17" cy="10" r="1.5" fill="#fb923c" />
              <circle cx="21" cy="10" r="1.5" fill="#a78bfa" />
              <circle cx="19" cy="8.5" r="1.5" fill="#fbbf24" />
              <circle cx="19" cy="11" r="1" fill="#fde047" />
            </>
          )}
          {season === "fall" && (
            <>
              {/* Scarf */}
              <path d="M18 32 Q30 36 42 32" stroke="#f97316" strokeWidth="3" fill="none" strokeLinecap="round" />
              <path d="M18 32 L16 40" stroke="#f97316" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </>
          )}

          {/* Eyes */}
          {isSleeping || isPetting ? (
            <>
              <path d="M21 24 Q23 22 25 24" stroke={"white"} strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <path d="M35 24 Q33 22 31 24" stroke={"white"} strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </>
          ) : mood === "love" || mood === "celebrate" ? (
            <>
              <text x="22" y="27" fontSize="7" fill="#ff6b8a" textAnchor="middle">♥</text>
              <text x="38" y="27" fontSize="7" fill="#ff6b8a" textAnchor="middle">♥</text>
            </>
          ) : mood === "sad" ? (
            <>
              <circle cx="23" cy="24" r="2.5" fill="white" />
              <circle cx="37" cy="24" r="2.5" fill="white" />
              <circle cx={23 + eyeX} cy={24 + eyeY} r="1.2" fill="#2d2d2d" />
              <circle cx={37 + eyeX} cy={24 + eyeY} r="1.2" fill="#2d2d2d" />
              {/* Sad eyebrows */}
              <line x1="20" y1="20" x2="25" y2="21" stroke={"white"} strokeWidth="1" strokeLinecap="round" />
              <line x1="40" y1="20" x2="35" y2="21" stroke={"white"} strokeWidth="1" strokeLinecap="round" />
            </>
          ) : season !== "summer" ? (
            <>
              <circle cx="23" cy="24" r="2.5" fill="white" />
              <circle cx="37" cy="24" r="2.5" fill="white" />
              <circle cx={23 + eyeX} cy={24 + eyeY} r="1.2" fill="#2d2d2d" />
              <circle cx={37 + eyeX} cy={24 + eyeY} r="1.2" fill="#2d2d2d" />
              <circle cx={22.5 + eyeX * 0.3} cy={23} r="0.6" fill="white" opacity="0.8" />
              <circle cx={36.5 + eyeX * 0.3} cy={23} r="0.6" fill="white" opacity="0.8" />
            </>
          ) : null}

          {/* Nose */}
          <ellipse cx="30" cy="29" rx="1.2" ry="0.8" fill="#ffb6c1" />

          {/* Mouth */}
          {mood === "happy" || mood === "love" || mood === "celebrate" || mood === "excited" ? (
            <path d="M27 31 Q30 34 33 31" stroke={"white"} strokeWidth="1" fill="none" strokeLinecap="round" />
          ) : mood === "sad" ? (
            <path d="M27 32 Q30 30 33 32" stroke={"white"} strokeWidth="1" fill="none" strokeLinecap="round" />
          ) : mood === "playful" || mood === "petting" ? (
            <>
              <path d="M27 31 Q30 33 33 31" stroke={"white"} strokeWidth="1" fill="none" strokeLinecap="round" />
              <line x1="30" y1="29.5" x2="30" y2="31" stroke={"white"} strokeWidth="0.8" />
            </>
          ) : null}

          {/* Whiskers */}
          <g opacity={0.5}>
            <line x1="12" y1="26" x2="21" y2="28" stroke="white" strokeWidth="0.5" />
            <line x1="12" y1="30" x2="21" y2="30" stroke="white" strokeWidth="0.5" />
            <line x1="48" y1="26" x2="39" y2="28" stroke="white" strokeWidth="0.5" />
            <line x1="48" y1="30" x2="39" y2="30" stroke="white" strokeWidth="0.5" />
          </g>

          {/* Paws */}
          <ellipse cx="22" cy="50" rx="4" ry="2.5" fill={CAT_HEAD} />
          <ellipse cx="38" cy="50" rx="4" ry="2.5" fill={CAT_HEAD} />

          {/* Pet sparkles */}
          {isPetting && (
            <>
              <text x="10" y="16" fontSize="8" className="animate-[sparkle_0.6s_ease_infinite]">✨</text>
              <text x="44" y="12" fontSize="6" className="animate-[sparkle_0.8s_ease_infinite_0.2s]">✨</text>
              <text x="48" y="30" fontSize="7" className="animate-[sparkle_0.7s_ease_infinite_0.4s]">💕</text>
            </>
          )}

          {/* Celebrate particles */}
          {mood === "celebrate" && (
            <>
              <text x="6" y="10" fontSize="6" className="animate-[confetti1_1s_ease_infinite]">🎉</text>
              <text x="48" y="8" fontSize="5" className="animate-[confetti2_1.2s_ease_infinite]">⭐</text>
              <text x="14" y="6" fontSize="5" className="animate-[confetti3_0.9s_ease_infinite]">🎊</text>
            </>
          )}

          {/* Zzz for sleeping */}
          {isSleeping && !isPetting && (
            <>
              <text x="42" y="16" fontSize="6" fill="#94a3b8" className="animate-[zzz_2s_ease_infinite]">z</text>
              <text x="46" y="10" fontSize="8" fill="#94a3b8" className="animate-[zzz_2s_ease_infinite_0.5s]">z</text>
              <text x="50" y="4" fontSize="10" fill="#94a3b8" className="animate-[zzz_2s_ease_infinite_1s]">Z</text>
            </>
          )}
        </svg>
      </div>

      <style>{`
        @keyframes sway {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(12deg); }
        }
        @keyframes wiggle {
          0%, 100% { transform: rotate(-10deg); }
          50% { transform: rotate(15deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes flip {
          0% { transform: rotateY(0deg); }
          50% { transform: rotateY(180deg) scale(1.1); }
          100% { transform: rotateY(360deg); }
        }
        @keyframes sparkle {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes confetti1 {
          0% { opacity: 1; transform: translate(0, 0); }
          100% { opacity: 0; transform: translate(-8px, -16px) rotate(45deg); }
        }
        @keyframes confetti2 {
          0% { opacity: 1; transform: translate(0, 0); }
          100% { opacity: 0; transform: translate(6px, -18px) rotate(-30deg); }
        }
        @keyframes confetti3 {
          0% { opacity: 1; transform: translate(0, 0); }
          100% { opacity: 0; transform: translate(4px, -14px) rotate(60deg); }
        }
        @keyframes zzz {
          0% { opacity: 0; transform: translate(0, 4px); }
          50% { opacity: 1; }
          100% { opacity: 0; transform: translate(2px, -6px); }
        }
        @keyframes yarnRoll {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(3px, -2px) rotate(90deg); }
          50% { transform: translate(0, 0) rotate(180deg); }
          75% { transform: translate(-3px, -1px) rotate(270deg); }
        }
      `}</style>
    </div>
  );
}
