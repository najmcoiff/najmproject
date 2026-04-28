"use client";

const STAMPS = [
  { top: "3%",  left: "2%",   size: 88,  rotate: -15 },
  { top: "7%",  right: "7%",  size: 52,  rotate: 22  },
  { top: "14%", left: "42%",  size: 40,  rotate: -38 },
  { top: "22%", left: "18%",  size: 72,  rotate: 8   },
  { top: "25%", right: "18%", size: 95,  rotate: -6  },
  { top: "38%", left: "5%",   size: 48,  rotate: 28  },
  { top: "42%", right: "4%",  size: 65,  rotate: -20 },
  { top: "50%", left: "55%",  size: 58,  rotate: 14  },
  { top: "58%", left: "25%",  size: 82,  rotate: -10 },
  { top: "65%", right: "30%", size: 44,  rotate: 32  },
  { top: "72%", left: "8%",   size: 76,  rotate: -24 },
  { top: "80%", right: "10%", size: 90,  rotate: 5   },
  { top: "85%", left: "48%",  size: 50,  rotate: -32 },
  { top: "90%", left: "20%",  size: 62,  rotate: 18  },
];

export default function WatermarkBg() {
  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: -1 }}
      aria-hidden="true"
    >
      {STAMPS.map((s, i) => (
        <img
          key={i}
          src="/logo.png"
          alt=""
          style={{
            position: "absolute",
            top: s.top,
            ...(s.left  ? { left:  s.left  } : {}),
            ...(s.right ? { right: s.right } : {}),
            width:       s.size,
            height:      s.size,
            objectFit:   "contain",
            opacity:     0.028,
            filter:      "invert(1) brightness(1.5)",
            transform:   `rotate(${s.rotate}deg)`,
            userSelect:  "none",
            pointerEvents: "none",
          }}
        />
      ))}
    </div>
  );
}
